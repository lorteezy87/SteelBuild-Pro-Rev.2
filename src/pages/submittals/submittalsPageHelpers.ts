/**
 * Pure helpers for Submittals page shell (index maps / related RFIs).
 */
import type { DrawingSet, DrawingSetsById } from "./types";

export function buildDrawingSetsById(
  drawingSets: Array<{ id?: string | null } & Partial<DrawingSet>>,
): DrawingSetsById {
  const map = new Map<string, DrawingSet>();
  for (const set of drawingSets || []) {
    if (set?.id) map.set(set.id, set as DrawingSet);
  }
  return map;
}

export type RoundLike = {
  submittal_id?: string | null;
  round_number?: number | null;
  [k: string]: unknown;
};

/** Group rounds by submittal_id, sorted by round_number ascending. */
export function buildRoundsBySubmittal<T extends RoundLike>(
  allRounds: T[],
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of allRounds || []) {
    const sid = r.submittal_id;
    if (!sid) continue;
    if (!map[sid]) map[sid] = [];
    map[sid].push(r);
  }
  for (const arr of Object.values(map)) {
    arr.sort((a, b) => (a.round_number || 1) - (b.round_number || 1));
  }
  return map;
}

export type SubmittalLinkLike = {
  drawing_set_ids?: string[] | null;
  linked_rfi_ids?: string[] | null;
};

export type RfiLinkLike = {
  id?: string | null;
  drawing_set_id?: string | null;
  [k: string]: unknown;
};

/**
 * RFIs on the same drawing set(s) as the submittal, excluding those already
 * manually linked via linked_rfi_ids.
 */
export function filterRelatedSetRfis<T extends RfiLinkLike>(
  submittal: SubmittalLinkLike | null | undefined,
  allRfis: T[],
): T[] {
  const setIds = Array.isArray(submittal?.drawing_set_ids) ? submittal!.drawing_set_ids! : [];
  if (!setIds.length) return [];
  const linkedManual = new Set(
    Array.isArray(submittal?.linked_rfi_ids) ? submittal!.linked_rfi_ids! : [],
  );
  return (allRfis || []).filter(
    (rfi) =>
      Boolean(rfi?.drawing_set_id) &&
      setIds.includes(rfi.drawing_set_id as string) &&
      !linkedManual.has(rfi.id as string),
  );
}


export function findRowById<T extends { id?: string | null }>(
  rows: T[],
  id: string | null | undefined,
): T | null {
  if (!id) return null;
  return (rows || []).find((r) => r.id === id) ?? null;
}

export type SpinOffParentLike = {
  discipline?: string | null;
  drawing_set_ids?: string[] | null;
};

/** Prefill seed when spinning off a child submittal from a parent. */
export function buildSpinOffInitial(
  parent: SpinOffParentLike | null | undefined,
): { discipline?: string; drawing_set_ids: string[] } {
  if (!parent) return { drawing_set_ids: [] };
  return {
    discipline: parent.discipline ?? undefined,
    drawing_set_ids: Array.isArray(parent.drawing_set_ids) ? parent.drawing_set_ids : [],
  };
}

export function toggleSelectionId(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Statuses that allow spinning off a child submittal. */
export const SPLIT_ELIGIBLE_STATUSES = new Set<string>([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
]);

export function isSplitEligibleStatus(status: string | null | undefined): boolean {
  return SPLIT_ELIGIBLE_STATUSES.has(status ?? "");
}

/** Closed-ish statuses that do not count as date-overdue for the detail panel. */
const NON_OVERDUE_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

export function isSubmittalDetailOverdue(
  status: string | null | undefined,
  requiredDate: string | null | undefined,
  daysUntilFn: (d: string) => number,
): boolean {
  if (!requiredDate) return false;
  if (NON_OVERDUE_STATUSES.has(status ?? "")) return false;
  return daysUntilFn(requiredDate) < 0;
}

/** Map risk aging tier to chip color tokens (detail panel). */
export function riskTierChipColor(tier: string | null | undefined): string {
  if (tier === "critical") return "var(--status-error)";
  if (tier === "urgent") return "var(--status-warning)";
  if (tier === "attention") return "var(--accent)";
  return "var(--text-muted)";
}
