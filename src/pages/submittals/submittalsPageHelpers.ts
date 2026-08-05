/**
 * Pure helpers for Submittals page shell (index maps / related RFIs).
 */
import type { DrawingSet, DrawingSetsById } from "./types";
import { findById } from "@/pages/shared/findById";
import { sortDrawingSetPackages } from "@/lib/drawingSetOrdering";

export function buildDrawingSetsById(
  drawingSets: Array<{ id?: string | null } & Partial<DrawingSet>>,
): DrawingSetsById {
  const map = new Map<string, DrawingSet>();
  for (const set of drawingSets || []) {
    if (set?.id) map.set(set.id, set as DrawingSet);
  }
  return map;
}

/** Sets not already linked and not deleted, ordered for the picker. */
export function filterAvailableDrawingSets<
  T extends { id?: string | null; is_deleted?: boolean | null },
>(allSets: T[] | null | undefined, linkedIds: string[] | null | undefined): T[] {
  const value = linkedIds || [];
  return sortDrawingSetPackages(
    (allSets || []).filter((set) => !value.includes(set.id as string) && !set.is_deleted),
  );
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

/** @deprecated Prefer findById from shared. */
export function findRowById<T extends { id?: string | null }>(
  rows: T[],
  id: string | null | undefined,
): T | null {
  return findById(rows, id);
}

/** @deprecated Prefer `@/pages/shared/selectionHelpers`. */
export { toggleSelectionId, toggleSelectAllVisible } from "@/pages/shared/selectionHelpers";

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
export const NON_OVERDUE_STATUSES = new Set([
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

export type SubmittalFormSeed = {
  id?: string | null;
  submittal_number?: string | null;
  title?: string | null;
  submittal_type?: string | null;
  discipline?: string | null;
  spec_section?: string | null;
  revision?: string | null;
  round_number?: number | null;
  submitted_date?: string | null;
  required_date?: string | null;
  status?: string | null;
  ball_in_court?: string | null;
  submitted_by?: string | null;
  reviewer?: string | null;
  notes?: string | null;
  drawing_set_ids?: string[] | null;
  split_reason?: string | null;
};

/** Initial form values for SubmittalFormModal (create or edit). */
export function buildSubmittalFormState(initial: SubmittalFormSeed | null | undefined) {
  const seed = initial || {};
  return {
    submittal_number: seed.submittal_number || "",
    title: seed.title || "",
    submittal_type: seed.submittal_type || "Shop Drawing",
    discipline: seed.discipline || "",
    spec_section: seed.spec_section || "",
    revision: seed.revision || "0",
    round_number: seed.round_number || 1,
    submitted_date: seed.submitted_date || "",
    required_date: seed.required_date || "",
    status: seed.status || "Draft",
    ball_in_court: seed.ball_in_court || "EOR",
    submitted_by: seed.submitted_by || "",
    reviewer: seed.reviewer || "",
    notes: seed.notes || "",
    drawing_set_ids: Array.isArray(seed.drawing_set_ids) ? seed.drawing_set_ids : [],
  };
}

/** Toggle a drawing type in the create-form multi-select list. */
export function toggleDrawingTypeInList(
  prev: string[],
  drawingType: string,
): string[] {
  return prev.includes(drawingType)
    ? prev.filter((x) => x !== drawingType)
    : [...prev, drawingType];
}

/** Whether the form is a spin-off create (parent present, no existing id). */
export function isSubmittalSpinOffCreate(
  parentSubmittal: { id?: string | null } | null | undefined,
  initial: { id?: string | null } | null | undefined,
): boolean {
  return Boolean(parentSubmittal) && !initial?.id;
}

/** True when status warrants a resubmittal-styled new-round CTA. */
export function isResubmitStatus(status: string | null | undefined): boolean {
  return status === "Revise and Resubmit" || status === "Rejected";
}

/** Next round number from rounds list or submittal total_rounds fallback. */
export function computeNextRoundNumber(
  rounds: Array<{ round_number?: number | null }> | null | undefined,
  totalRoundsFallback?: number | null,
): number {
  const list = rounds || [];
  const lastRoundNum = list.length
    ? list[list.length - 1].round_number || list.length
    : totalRoundsFallback || 0;
  return (lastRoundNum || 0) + 1;
}

/**
 * Build field patch for SubmittalDetail: empty string → null; skip no-ops.
 * Returns null when nothing should write.
 */
export function buildSubmittalFieldPatch(
  current: Record<string, unknown> | null | undefined,
  field: string,
  value: unknown,
): Record<string, unknown> | null {
  if (!current) return null;
  if ((current[field] ?? "") === (value ?? "")) return null;
  return { [field]: value === "" ? null : value };
}

/** Immutable form field patch for SubmittalFormModal. */
export function nextSubmittalFormField<T extends Record<string, unknown>>(
  prev: T,
  field: keyof T | string,
  value: unknown,
): T {
  return { ...prev, [field]: value };
}

