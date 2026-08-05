/**
 * Pure helpers for WorkPackages page shell.
 */

export type WpSignals = {
  phase?: string;
  status?: string;
  risk?: string;
};

export type EnrichedWp = {
  id: string;
  wp_number?: string | null;
  name?: string | null;
  project_name?: string | null;
  crew?: string | null;
  phase?: string | null;
  status?: string | null;
  notes?: string | null;
  _signals: WpSignals;
  [k: string]: unknown;
};

export function filterWorkPackages(
  enriched: EnrichedWp[],
  opts: {
    phaseFilter: string;
    statusFilter: string;
    riskFilter: string;
    search: string;
    seqFilter: unknown;
    matchesSequenceFilter: (wp: EnrichedWp, seq: unknown) => boolean;
    sortFn: (a: EnrichedWp, b: EnrichedWp) => number;
  },
): EnrichedWp[] {
  const q = opts.search.trim().toLowerCase();
  return (enriched || [])
    .filter((wp) => {
      if (opts.phaseFilter !== "all" && wp._signals.phase !== opts.phaseFilter) return false;
      if (opts.statusFilter !== "all" && wp._signals.status !== opts.statusFilter) return false;
      if (opts.riskFilter !== "all" && wp._signals.risk !== opts.riskFilter) return false;
      if (!opts.matchesSequenceFilter(wp, opts.seqFilter)) return false;
      if (!q) return true;
      return [
        wp.wp_number,
        wp.name,
        wp.project_name,
        wp.crew,
        wp.phase,
        wp.status,
        wp.notes,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    })
    .sort(opts.sortFn);
}

export function filterSelectedRows<T extends { id: string }>(
  rows: T[],
  selectedIds: Set<string>,
): T[] {
  return (rows || []).filter((r) => selectedIds.has(r.id));
}

export function nextSelectedIdsToggle(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function resolveProjectPercentComplete(
  selectedProject: { scope_complete_pct_override?: number | null } | null | undefined,
  workPackages: unknown[],
  calcWpProgress: (wps: unknown[]) => { pct: number | null },
): number | null {
  if (selectedProject?.scope_complete_pct_override != null) {
    return Number(selectedProject.scope_complete_pct_override);
  }
  return workPackages.length ? calcWpProgress(workPackages).pct : null;
}

export function formatWpNumber(n: number): string {
  return `WP-${String(n).padStart(3, "0")}`;
}
