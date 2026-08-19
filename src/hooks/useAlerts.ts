import { useMemo, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { batchProcess } from "@/utils/batchProcess";
import { toast } from "sonner";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { useUserPrefs } from "@/hooks/useUserPrefs";
import { filterAlertsForUser } from "@/lib/userPreferences/alerts";

// Loose Alert shape — the entity client is still untyped (Phase 3). Once the entity
// boundary is typed, this will be replaced with the generated Database row type.
export type Alert = {
  id: string;
  is_read?: boolean | null;
  is_dismissed?: boolean | null;
  dismissed_at?: string | null;
  [key: string]: unknown;
};

export function useAlerts() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const [generating, setGenerating] = useState(false);
  const userPreferences = useUserPrefs();

  const {
    data: alerts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Alert[]>({
    queryKey: ["alerts", projectId],
    queryFn: () =>
      projectId
        ? entities.Alert.filter({ project_id: projectId }, "-created_at")
        : entities.Alert.list("-created_at"),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  useRealtimeInvalidation("alerts", projectId, [["alerts", projectId]]);
  const visibleAlerts = useMemo(
    () => filterAlertsForUser(alerts, userPreferences),
    [alerts, userPreferences],
  );

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      entities.Alert.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts", projectId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.Alert.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts", projectId] }),
  });

  const markRead = (alert: Alert) => {
    updateMut.mutate(
      { id: alert.id, data: { is_read: true } },
      { onError: (err) => {
        if (!String(err?.message).includes("column")) {
          toast.error(`Failed to mark alert as read`);
        }
      }}
    );
  };

  const markAllRead = async () => {
    const unread = visibleAlerts.filter((a) => !a.is_read);
    if (unread.length === 0) return;
    try {
      const { succeeded, failed } = await batchProcess(unread, (a: Alert) =>
        entities.Alert.update(a.id, { is_read: true })
      );
      qc.invalidateQueries({ queryKey: ["alerts", projectId] });
      if (failed.length > 0) {
        toast.warning(`${succeeded.length} marked as read, ${failed.length} failed`);
      } else {
        toast.success(`${succeeded.length} alerts marked as read`);
      }
    } catch {
      // is_read column may not exist yet — silently degrade
      console.warn("[useAlerts] markAllRead failed — is_read column may not exist");
    }
  };

  const dismiss = (alert: Alert) => {
    updateMut.mutate(
      { id: alert.id, data: { dismissed_at: new Date().toISOString() } },
      { onError: (err) => {
        if (!String(err?.message).includes("column")) {
          toast.error(`Failed to dismiss alert`);
        }
      }}
    );
  };

  const generateAlerts = async () => {
    setGenerating(true);
    try {
      if (projectId) {
        // Server-side rule engine (migration 20260819002000): overdue
        // deliveries, overdue submittals, stalled submittals — scoped to this
        // project and access-gated by the RPC itself. The same engine runs
        // daily via pg_cron, so this is a manual "scan now".
        // Untyped rpc call — generate_project_alerts ships in migration
        // 20260819002000 and isn't in the generated DB types yet (same
        // pattern as src/lib/org/repository.ts callRpc).
        const rpc = supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
        const { data, error } = await rpc("generate_project_alerts", {
          p_project_id: projectId,
        });
        if (error) throw error;
        await refetch();
        const created = Number(data) || 0;
        toast.message(
          created > 0
            ? `Scan complete — ${created} new alert${created === 1 ? "" : "s"}`
            : "Scan complete — no new alerts",
        );
      } else {
        // Portfolio view: the daily server scan covers all projects; here we
        // just reload the feed.
        await refetch();
        toast.message("Alerts refreshed. Select a project to run an on-demand scan.");
      }
    } catch (err: unknown) {
      toast.error(`Failed to refresh alerts: ${toUserErrorMessage(err, "Unknown error")}`);
    } finally {
      setGenerating(false);
    }
  };

  const unreadCount = visibleAlerts.filter((a) => !a.is_read && !a.is_dismissed).length;

  return {
    alerts: visibleAlerts,
    isLoading,
    isError,
    error,
    refetch,
    generating,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
    generateAlerts,
  };
}
