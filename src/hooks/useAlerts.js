import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { batchProcess } from "@/utils/batchProcess";
import { toast } from "sonner";

export function useAlerts() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [generating, setGenerating] = useState(false);

  const { data: alerts = [], isLoading, refetch } = useQuery({
    queryKey: ["alerts", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Alert.filter({ project_id: projectId }, "-created_at")
        : base44.entities.Alert.list("-created_at"),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Alert.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Alert.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const markRead = (alert) =>
    updateMut.mutate({ id: alert.id, data: { is_read: true } });

  const markAllRead = async () => {
    const unread = alerts.filter((a) => !a.is_read);
    if (unread.length === 0) return;
    try {
      const { succeeded, failed } = await batchProcess(unread, (a) =>
        base44.entities.Alert.update(a.id, { is_read: true })
      );
      qc.invalidateQueries({ queryKey: ["alerts"] });
      if (failed.length > 0) {
        toast.warning(`${succeeded.length} marked as read, ${failed.length} failed`);
      } else {
        toast.success(`${succeeded.length} alerts marked as read`);
      }
    } catch {
      toast.error("Some alerts failed to update");
    }
  };

  const dismiss = (alert) =>
    updateMut.mutate({ id: alert.id, data: { is_dismissed: true } });

  const generateAlerts = async () => {
    setGenerating(true);
    try {
      await base44.functions.invoke("generateAlerts", {});
      await refetch();
      toast.success("Alerts refreshed");
    } catch (err) {
      toast.error("Failed to generate alerts: " + (err?.message || "Unknown error"));
    } finally {
      setGenerating(false);
    }
  };

  const unreadCount = alerts.filter((a) => !a.is_read && !a.is_dismissed).length;

  return {
    alerts,
    isLoading,
    refetch,
    generating,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
    generateAlerts,
  };
}
