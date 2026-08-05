/** Pure helpers for Punchlist page shell. */
/** @deprecated Prefer `@/pages/shared/filterLiveRecords` — re-export kept for local imports. */
export { filterLiveRecords } from "@/pages/shared/filterLiveRecords";

/** @deprecated Prefer `@/pages/shared/nextFilterToggle`. */
export { nextFilterToggle } from "@/pages/shared/nextFilterToggle";

export type PunchItemLike = {
  status?: string | null;
  category?: string | null;
  priority?: string | null;
  [k: string]: unknown;
};

export function filterPunchlist(
  punchlist: PunchItemLike[],
  opts: { filterStatus: string; filterCategory: string; filterPriority: string },
): PunchItemLike[] {
  return (punchlist || []).filter((item) => {
    const statusMatch = opts.filterStatus === "all" || item.status === opts.filterStatus;
    const categoryMatch = opts.filterCategory === "all" || item.category === opts.filterCategory;
    const priorityMatch = opts.filterPriority === "all" || item.priority === opts.filterPriority;
    return statusMatch && categoryMatch && priorityMatch;
  });
}

export function computePunchlistStats(punchlist: PunchItemLike[]) {
  const stats = {
    total: punchlist.length,
    open: punchlist.filter((i) => i.status === "Open").length,
    inProgress: punchlist.filter((i) => i.status === "In Progress").length,
    completed: punchlist.filter((i) => i.status === "Completed").length,
    onHold: punchlist.filter((i) => i.status === "On Hold").length,
    critical: punchlist.filter((i) => i.priority === "Critical").length,
  };
  const completionRate =
    punchlist.length > 0 ? Math.round((stats.completed / punchlist.length) * 100) : 0;
  return { ...stats, completionRate };
}

/** @deprecated Prefer shared selectionHelpers. */
export { toggleIdInList } from "@/pages/shared/selectionHelpers";

export const PUNCHLIST_STATUSES = [
  "Open",
  "In Progress",
  "Completed",
  "On Hold",
  "Deferred",
] as const;

export const PUNCHLIST_CATEGORIES = [
  "Structural",
  "Connections",
  "Painting/Coating",
  "Hardware",
  "Fit-Up",
  "Cleanup",
  "Documentation",
  "Other",
] as const;

export const PUNCHLIST_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

export function punchlistCommandSubtitle(
  completionRate: number,
  criticalCount: number,
): string {
  return `${completionRate}% complete · ${criticalCount} critical · close-out checklist`;
}

export function createEmptyPunchlistFilters(): {
  filterStatus: string;
  filterCategory: string;
  filterPriority: string;
} {
  return {
    filterStatus: "all",
    filterCategory: "all",
    filterPriority: "all",
  };
}
