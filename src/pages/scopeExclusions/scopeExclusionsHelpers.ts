/**
 * Pure helpers for Scope & Exclusions page.
 */

export const SCOPE_TYPES = ["Scope", "Exclusion", "Clarification"] as const;

export const SCOPE_CATEGORIES = [
  "Structural",
  "Misc Metals",
  "Connections",
  "Coatings",
  "Erection",
  "Engineering",
  "Other",
] as const;

export type ScopeItemLike = {
  item_type?: string | null;
  category?: string | null;
  is_completed?: boolean | null;
  description?: string | null;
  notes?: string | null;
  added_by?: string | null;
  [k: string]: unknown;
};

export function filterScopeItems(
  scopeItems: ScopeItemLike[],
  opts: {
    filterType: string;
    filterCategory: string;
    search: string;
    hideCompleted: boolean;
  },
): ScopeItemLike[] {
  const q = opts.search.trim().toLowerCase();
  return (scopeItems || []).filter((item) => {
    const typeMatch = opts.filterType === "all" || item.item_type === opts.filterType;
    const categoryMatch = opts.filterCategory === "all" || item.category === opts.filterCategory;
    const completedMatch = !opts.hideCompleted || !item.is_completed;
    const searchMatch =
      !q
      || item.description?.toLowerCase().includes(q)
      || item.notes?.toLowerCase().includes(q)
      || item.added_by?.toLowerCase().includes(q)
      || item.category?.toLowerCase().includes(q);
    return typeMatch && categoryMatch && completedMatch && searchMatch;
  });
}

export function computeScopeStats(scopeItems: ScopeItemLike[]) {
  const list = scopeItems || [];
  return {
    total: list.length,
    scope: list.filter((i) => i.item_type === "Scope").length,
    exclusion: list.filter((i) => i.item_type === "Exclusion").length,
    clarification: list.filter((i) => i.item_type === "Clarification").length,
    completed: list.filter((i) => i.is_completed).length,
  };
}

export function commandBarSubtitle(stats: { completed: number }): string {
  return `Contract-defined scope · exclusions · clarifications${
    stats.completed > 0 ? ` · ${stats.completed} complete` : ""
  }`;
}

export function hasActiveScopeFilters(opts: {
  filterType: string;
  filterCategory: string;
  search: string;
  hideCompleted: boolean;
}): boolean {
  return (
    opts.filterType !== "all"
    || opts.filterCategory !== "all"
    || !!opts.search.trim()
    || opts.hideCompleted
  );
}

/** @deprecated Prefer toggleSelectionId. */
export { toggleSelectionId as nextSelectedIds } from "@/pages/shared/selectionHelpers";

export function bulkSuccessMessage(count: number, verb: "Updated" | "Deleted"): string {
  return `${verb} ${count} item${count === 1 ? "" : "s"}`;
}

export function completeTogglePatch(is_completed: boolean) {
  return {
    is_completed,
    completed_at: is_completed ? null as string | null : null, // filled by caller with ISO if needed
    ...(is_completed ? { in_progress: false, in_progress_at: null } : {}),
  };
}

/** Build complete-toggle mutation payload with timestamp. */
export function buildCompleteToggleData(is_completed: boolean, nowIso: string = new Date().toISOString()) {
  return {
    is_completed,
    completed_at: is_completed ? nowIso : null,
    ...(is_completed ? { in_progress: false, in_progress_at: null } : {}),
  };
}

export function buildInProgressToggleData(in_progress: boolean, nowIso: string = new Date().toISOString()) {
  return {
    in_progress,
    in_progress_at: in_progress ? nowIso : null,
  };
}

export function bulkMarkCompletePatch(nowIso: string = new Date().toISOString()) {
  return {
    is_completed: true,
    completed_at: nowIso,
    in_progress: false,
    in_progress_at: null,
  };
}

export function bulkMarkInProgressPatch(nowIso: string = new Date().toISOString()) {
  return { in_progress: true, in_progress_at: nowIso };
}

export function bulkClearInProgressPatch() {
  return { in_progress: false, in_progress_at: null };
}

export function bulkMarkIncompletePatch() {
  return { is_completed: false, completed_at: null };
}
