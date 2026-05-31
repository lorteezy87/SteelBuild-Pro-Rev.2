import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { batchProcess } from "@/utils/batchProcess";

/**
 * useLayoutNavData — single hook that owns every cross-module count + alert
 * stream the chrome (top utility bar, modules dropdown, bell, sidebar
 * badges) needs.
 *
 * What it returns:
 *   - allAlerts            full alert list scoped to the active project
 *   - unreadAlerts         allAlerts filtered to unread + not-dismissed
 *   - unreadCount          unreadAlerts.length
 *   - overdueRFICount      RFIs past their date_required and not Answered/Closed
 *   - overdueDrawingCount  drawings past their due_date and not Released
 *   - overdueDeliveryCount deliveries past scheduled_date and not Delivered
 *   - alertCounts          object the ModulesDropdown consumes for its badges
 *                          ({ unread, rfi, co, drawings, deliveries })
 *   - markAllRead          mutate-fn shorthand: marks every unread alert read
 *
 * Behaviour:
 *   - The alert query is gated on `projectId` being truthy; when null,
 *     `allAlerts` is `[]`.
 *   - Module badge count queries are additionally gated by
 *     `includeModuleCounts`, so closed module menus do not start RFI,
 *     drawing, and delivery count requests on every app load.
 *   - Refetch interval: 120s. Stale window: 60s. Same as the inline
 *     queries this hook replaces — nothing about cadence changed.
 *   - The alerts query catches errors so a missing `is_dismissed` column
 *     during a partial migration doesn't break the chrome. Other queries
 *     surface errors normally.
 *
 * Extracted from Layout.jsx (see git history) so the chrome JSX is
 * separable from its data layer and the hook can be tested in isolation.
 */
export function useLayoutNavData(projectId, { includeModuleCounts = false } = {}) {
  const qc = useQueryClient();
  const moduleCountsEnabled = !!projectId && includeModuleCounts;

  const { data: allAlerts = [] } = useQuery({
    queryKey: ["alerts-nav", projectId],
    queryFn: async () => {
      try {
        // Fetch all alerts for this project, then filter client-side.
        // This avoids 400 errors if `is_dismissed` column doesn't exist yet
        // on a freshly-deployed environment that hasn't run the latest
        // migration.
        const raw = await entities.Alert.filter({ project_id: projectId });
        return raw.filter((a) => !a.is_dismissed && !a.dismissed_at);
      } catch (err) {
        console.warn("[Layout] alerts query failed:", err?.message || err);
        return [];
      }
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled: !!projectId,
    retry: false,
  });

  const { data: navRFIs = [] } = useQuery({
    queryKey: ["rfis-nav-count", projectId],
    queryFn: () => entities.RFI.filter({ project_id: projectId }),
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled: moduleCountsEnabled,
  });

  const { data: navDrawings = [] } = useQuery({
    queryKey: ["drawings-nav-count", projectId],
    queryFn: () => entities.Drawing.filter({ project_id: projectId }),
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled: moduleCountsEnabled,
  });

  const { data: navDeliveries = [] } = useQuery({
    queryKey: ["deliveries-nav-count", projectId],
    queryFn: () => entities.Delivery.filter({ project_id: projectId }),
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled: moduleCountsEnabled,
  });

  // Overdue computations re-derive `now` once per memo so a stale closure
  // doesn't cause a row to flip "overdue" the moment React renders again.
  const { overdueRFICount, overdueDrawingCount, overdueDeliveryCount } = useMemo(() => {
    const now = Date.now();
    return {
      overdueRFICount: navRFIs.filter((r) =>
        r.date_required && new Date(r.date_required).getTime() < now &&
        !["Answered", "Closed"].includes(r.status)
      ).length,
      overdueDrawingCount: navDrawings.filter((d) =>
        d.due_date && new Date(d.due_date).getTime() < now && d.stage !== "Released"
      ).length,
      overdueDeliveryCount: navDeliveries.filter((d) =>
        d.scheduled_date && new Date(d.scheduled_date).getTime() < now && d.status !== "Delivered"
      ).length,
    };
  }, [navRFIs, navDrawings, navDeliveries]);

  const alertSummary = useMemo(() => {
    const unreadAlerts = [];
    let rfiAlertCount = 0;
    let coAlertCount = 0;

    for (const alert of allAlerts) {
      if (!alert.is_read && !alert.is_dismissed) {
        unreadAlerts.push(alert);
      }
      if (alert.is_dismissed) continue;
      if (alert.alert_type === "RFI Overdue" || alert.alert_type === "RFI_Overdue") {
        rfiAlertCount += 1;
      } else if (alert.alert_type === "CO Pending") {
        coAlertCount += 1;
      }
    }

    return {
      unreadAlerts,
      unreadCount: unreadAlerts.length,
      rfiAlertCount,
      coAlertCount,
    };
  }, [allAlerts]);

  const { unreadAlerts, unreadCount, rfiAlertCount, coAlertCount } = alertSummary;

  // Modules dropdown reads this object directly. Preserve exact keys/shape
  // ModulesDropdown consumes today.
  const alertCounts = useMemo(() => ({
    unread: unreadCount,
    rfi: rfiAlertCount,
    co: coAlertCount,
    drawings: overdueDrawingCount,
    deliveries: overdueDeliveryCount,
  }), [unreadCount, rfiAlertCount, coAlertCount, overdueDrawingCount, overdueDeliveryCount]);

  const markAllReadMut = useMutation({
    mutationFn: async () => {
      const unread = unreadAlerts;
      try {
        return await batchProcess(unread, (a) =>
          entities.Alert.update(a.id, { is_read: true })
        );
      } catch {
        // is_read column may not exist yet — silently degrade. Alerts page
        // surfaces the same condition; here we just don't break the bell.
        console.warn("[Layout] markAllRead failed — is_read column may not exist");
        return { succeeded: [], failed: unread };
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts-nav"] }),
  });

  const markAllRead = () => markAllReadMut.mutate();

  return {
    allAlerts,
    unreadAlerts,
    unreadCount,
    overdueRFICount,
    overdueDrawingCount,
    overdueDeliveryCount,
    alertCounts,
    markAllRead,
  };
}
