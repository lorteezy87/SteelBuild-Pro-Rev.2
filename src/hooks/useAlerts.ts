import { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { batchProcess } from "@/utils/batchProcess";
import { toast } from "sonner";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";

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
    const unread = alerts.filter((a) => !a.is_read);
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
      // Cross-module generate-alerts Edge Function is not deployed. Refresh the
      // existing alert feed instead of pretending a scan succeeded.
      await refetch();
      toast.message(
        "Alerts refreshed. Overdue RFIs and deliveries create alerts from their modules; a cross-module scanner is not deployed.",
      );
    } catch (err: unknown) {
      toast.error(`Failed to refresh alerts: ${toUserErrorMessage(err, "Unknown error")}`);
    } finally {
      setGenerating(false);
    }
  };

  const unreadCount = alerts.filter((a) => !a.is_read && !a.is_dismissed).length;

  return {
    alerts,
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
