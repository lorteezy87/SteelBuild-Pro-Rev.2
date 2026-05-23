/**
 * useTaskLinkOptions — project-scoped option lists for linking a schedule
 * task to RFIs, change orders, and action items (the LINKS tab in
 * TaskDetailDrawer).
 *
 * Extracted from TaskDetailDrawer so the data fetching + option shaping live
 * behind a hook (testable in isolation, reusable by other link UIs) instead
 * of inline useQuery/base44 calls in the component.
 *
 * @param {string|null|undefined} projectId  Project to scope the lists to.
 * @param {boolean} enabled  Only fetch while truthy (e.g. the drawer is open).
 * @returns {{ rfiOptions: Option[], changeOrderOptions: Option[], actionItemOptions: Option[] }}
 *   where Option is { id, label, sublabel }.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const filterByProject = (entity, projectId) =>
  projectId ? entity.filter({ project_id: projectId }) : Promise.resolve([]);

// ── Pure option mappers (exported for direct unit testing) ──────────────
/** @typedef {{ id: string, label: string, sublabel: string }} Option */

export const toRfiOption = (r) => ({
  id: r.id,
  label: r.rfi_number || r.title || `RFI ${r.id?.slice(0, 6)}`,
  sublabel: r.title && r.rfi_number ? r.title : (r.status || ""),
});

export const toChangeOrderOption = (c) => ({
  id: c.id,
  label: c.co_number || c.title || `CO ${c.id?.slice(0, 6)}`,
  sublabel: c.title && c.co_number ? c.title : (c.status || ""),
});

export const toActionItemOption = (a) => ({
  id: a.id,
  label: a.title || a.description?.slice(0, 40) || `Item ${a.id?.slice(0, 6)}`,
  sublabel: a.status || "",
});

export function useTaskLinkOptions(projectId, enabled = true) {
  const active = !!projectId && !!enabled;
  const shared = { enabled: active, staleTime: 60 * 1000 };

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis-for-task-link", projectId],
    queryFn: () => filterByProject(base44.entities.RFI, projectId),
    ...shared,
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders-for-task-link", projectId],
    queryFn: () => filterByProject(base44.entities.ChangeOrder, projectId),
    ...shared,
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items-for-task-link", projectId],
    queryFn: () => filterByProject(base44.entities.ActionItem, projectId),
    ...shared,
  });

  const rfiOptions = useMemo(() => rfis.map(toRfiOption), [rfis]);
  const changeOrderOptions = useMemo(() => changeOrders.map(toChangeOrderOption), [changeOrders]);
  const actionItemOptions = useMemo(() => actionItems.map(toActionItemOption), [actionItems]);

  return { rfiOptions, changeOrderOptions, actionItemOptions };
}
