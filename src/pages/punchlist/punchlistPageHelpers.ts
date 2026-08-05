/** Pure helpers for Punchlist page shell. */
export function filterLiveRecords<T extends { is_deleted?: boolean | null }>(rows: T[]): T[] {
  return (rows || []).filter((r) => !r.is_deleted);
}

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

export function toggleIdInList(prev: string[], id: string): string[] {
  return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
}
