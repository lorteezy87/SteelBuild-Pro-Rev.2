/**
 * Pure derivations for the Submittal Register (command_ui re-skin, Slice 2b).
 *
 * No React, no network — reshapes the submittal `rows` read-model into the
 * filtered/sorted list + the KPI counts the register renders. Every value here
 * is byte-identical to what `Submittals.tsx` computes inline today (the
 * `filtered` and `stats` useMemos), so the on-skin conversion is
 * behavior-preserving. Independently typed + unit-tested so it stays strict-null
 * / no-implicit-any clean. Mirrors drawingRegister.derive.ts / drawingControlCenter.derive.ts.
 */
import { daysBetween } from "@/lib/dateMath";
import { compareSubmittalsByDrawingSet } from "./format";
import type { DrawingSetsById, Submittal } from "./types";

/**
 * KPI cards filter by GROUPED status (matching their stat counts); the status
 * dropdown filters by an EXACT status. These group keys expand to the same
 * status sets the counts use — keeping "Pending/Approved" cards and the filter
 * in lockstep (fixes "Pending/Approved show nothing" and "Rejected counts 2 but
 * lists 1"). Must stay in sync with `computeSubmittalStats`.
 */
export const STATUS_GROUPS: Record<string, string[]> = {
  __pending: ["Submitted", "Under Review"],
  __approved: ["Approved", "Approved as Noted", "Released for Fabrication"],
  __rejected: ["Rejected", "Revise and Resubmit"],
};

/** Statuses that are terminal for the overdue tally — a past required_date on
 *  one of these does NOT count as overdue (the cycle is closed). */
const OVERDUE_EXEMPT_STATUSES = ["Approved", "Approved as Noted", "Released for Fabrication", "Void"];

export interface SubmittalFilterState {
  filterStatus: string;
  filterBIC: string;
  search: string;
}

export interface SubmittalStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  overdue: number;
}

/**
 * Apply the status (grouped-or-exact) + ball-in-court + free-text filters.
 * Pure over its inputs; mirrors the legacy `filtered` memo's filter passes.
 */
export function filterSubmittals(rows: Submittal[], f: SubmittalFilterState): Submittal[] {
  let list = rows;
  if (f.filterStatus !== "all") {
    const group = STATUS_GROUPS[f.filterStatus];
    list = group
      ? list.filter((r) => group.includes(r.status ?? ""))
      : list.filter((r) => r.status === f.filterStatus);
  }
  if (f.filterBIC !== "all") list = list.filter((r) => r.ball_in_court === f.filterBIC);
  if (f.search.trim()) {
    const q = f.search.toLowerCase();
    list = list.filter((r) =>
      (r.submittal_number || "").toLowerCase().includes(q) ||
      (r.title || "").toLowerCase().includes(q) ||
      (r.spec_section || "").toLowerCase().includes(q),
    );
  }
  return list;
}

/**
 * Sort by drawing-set package order (then submittal number). Returns a new
 * array; mirrors the legacy `filtered` memo's `.slice().sort(...)`. Pure.
 */
export function sortSubmittals(rows: Submittal[], drawingSetsById: DrawingSetsById): Submittal[] {
  return rows
    .slice()
    .sort((a, b) => compareSubmittalsByDrawingSet(a, b, drawingSetsById));
}

/**
 * Filter then sort — the exact composition the page's `filtered` memo performs.
 * Pure over its inputs.
 */
export function filterAndSortSubmittals(
  rows: Submittal[],
  f: SubmittalFilterState,
  drawingSetsById: DrawingSetsById,
): Submittal[] {
  return sortSubmittals(filterSubmittals(rows, f), drawingSetsById);
}

/**
 * KPI counts. `today` is a YYYY-MM-DD local date string (the caller passes
 * `localToday()`); overdue = a past required_date on a non-terminal submittal,
 * byte-identical to the legacy `daysUntil(required_date) < 0` check (daysBetween
 * from today is the same sign as daysUntil when `today` is local-today).
 */
export function computeSubmittalStats(rows: Submittal[], today: string): SubmittalStats {
  const total = rows.length;
  const pending = rows.filter((r) => ["Submitted", "Under Review"].includes(r.status ?? "")).length;
  // Matches the useSubmittals hook's `approved` definition — anything past the
  // BFA gate counts (Approved / Approved as Noted / Released for Fab).
  const approved = rows.filter((r) =>
    r.status === "Approved" ||
    r.status === "Approved as Noted" ||
    r.status === "Released for Fabrication",
  ).length;
  const rejected = rows.filter((r) => ["Rejected", "Revise and Resubmit"].includes(r.status ?? "")).length;
  const overdue = rows.filter((r) => {
    if (!r.required_date) return false;
    if (OVERDUE_EXEMPT_STATUSES.includes(r.status ?? "")) return false;
    return daysBetween(today, r.required_date) < 0;
  }).length;
  return { total, pending, approved, rejected, overdue };
}
