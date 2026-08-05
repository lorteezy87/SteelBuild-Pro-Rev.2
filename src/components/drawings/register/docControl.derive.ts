/**
 * Pure derivations for the Doc Control views (canonical presentation re-skin, Slice 2c).
 *
 * No React, no network — these reshape the hooks' already-fetched read-models
 * into exactly what the on-skin panels render. Every value here is byte-identical
 * to what the legacy views (DrawingRegisterGrid / ReviewQueue / ImpactBoard /
 * TransmittalLog) compute inline today, so the conversion is behavior-preserving.
 * Independently typed + unit-tested so the panels stay strict-null / no-implicit-any
 * clean without pulling any JSX into the tests.
 */
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { DrawingReviewRow } from "@/hooks/useDrawingReviews";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import type { TransmittalRow } from "@/hooks/useTransmittals";

/** The six impact-board columns, in board order. Mirrors ImpactBoard's STATUSES. */
export const IMPACT_STATUSES = ["open", "in_review", "ready", "blocked", "resolved", "closed"] as const;
export type ImpactStatus = (typeof IMPACT_STATUSES)[number];

// ── Drawing Register grid ───────────────────────────────────────────────────

/**
 * Filter register rows by a free-text query + a release-status filter — the exact
 * predicate the legacy DrawingRegisterGrid `rows` memo runs. `statusFilter === "all"`
 * disables the status gate; the query matches sheet #, title, discipline, set, and
 * status (case-insensitive, trimmed).
 */
/** Sentinel for the set filter: rows with no drawing_set_name. */
export const SET_FILTER_NONE = "__none__";

export function filterRegisterRows(
  rows: DrawingRegisterRow[],
  query: string,
  statusFilter: string,
  setFilter: string = "all",
): DrawingRegisterRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (statusFilter !== "all" && r.current_status !== statusFilter) return false;
    if (setFilter !== "all") {
      if (setFilter === SET_FILTER_NONE) {
        if (r.drawing_set_name) return false;
      } else if ((r.drawing_set_name || "") !== setFilter) {
        return false;
      }
    }
    if (!q) return true;
    return [r.sheet_number, r.sheet_title, r.discipline, r.drawing_set_name, r.current_status]
      .some((v) => (v || "").toLowerCase().includes(q));
  });
}

/** Unique non-empty set names from the register, sorted for the set filter dropdown. */
export function listDrawingSetNames(rows: DrawingRegisterRow[]): string[] {
  const names = new Set<string>();
  for (const r of rows) {
    const n = (r.drawing_set_name || "").trim();
    if (n) names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export interface RegisterSetGroup {
  /** Null = unassigned (no set name). */
  setName: string | null;
  rows: DrawingRegisterRow[];
}

/**
 * Group filtered rows by drawing_set_name. Named sets first (A–Z), unassigned last.
 * Within each group, preserve the input order (already sheet_number-sorted by the view).
 */
export function groupRegisterRowsBySet(rows: DrawingRegisterRow[]): RegisterSetGroup[] {
  const map = new Map<string | null, DrawingRegisterRow[]>();
  for (const r of rows) {
    const key = (r.drawing_set_name || "").trim() || null;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  const named = [...map.keys()].filter((k): k is string => k != null)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const out: RegisterSetGroup[] = named.map((setName) => ({ setName, rows: map.get(setName)! }));
  if (map.has(null)) out.push({ setName: null, rows: map.get(null)! });
  return out;
}

// ── Review queue ────────────────────────────────────────────────────────────

/**
 * Rows that can be attached to a review/impact/transmittal: those with a tracked
 * current revision. Shared by ReviewQueue, ImpactBoard, and TransmittalLog (each
 * ran `register.filter(r => !!r.current_revision_id)` inline).
 */
export function attachableRegisterRows(register: DrawingRegisterRow[]): DrawingRegisterRow[] {
  return register.filter((r) => !!r.current_revision_id);
}

/** Filter reviews to pending-only when the toggle is on (legacy ReviewQueue `rows` memo). */
export function filterReviews(reviews: DrawingReviewRow[], pendingOnly: boolean): DrawingReviewRow[] {
  return pendingOnly ? reviews.filter((r) => r.decision === "pending") : reviews;
}

// ── Impact board ────────────────────────────────────────────────────────────

/**
 * Group impacts into the six board columns. Every column key is always present
 * (empty array when none) so the board renders a stable set of lanes — byte-identical
 * to ImpactBoard's `byStatus` memo. An impact whose status isn't one of the six is
 * kept under its own key (matches the legacy `m[im.status] ?? (m[im.status] = [])`),
 * so no row is silently dropped.
 */
export function groupImpactsByStatus(
  impacts: DrawingImpactRow[],
): Record<string, DrawingImpactRow[]> {
  const m: Record<string, DrawingImpactRow[]> = {};
  for (const s of IMPACT_STATUSES) m[s] = [];
  for (const im of impacts) (m[im.status] ?? (m[im.status] = [])).push(im);
  return m;
}

// ── Transmittal log ─────────────────────────────────────────────────────────

export interface TransmittalDisplay {
  /** The counterparty for this transmittal, resolved by direction. */
  party: string | null;
  /** The relevant date (received vs sent), resolved by direction. */
  date: string | null;
}

/**
 * Resolve a transmittal's display party + date from its direction — the exact
 * `t.direction === "incoming" ? received_from : sent_to` / `date_received : date_sent`
 * pick the legacy TransmittalLog row does inline.
 */
export function resolveTransmittalDisplay(t: TransmittalRow): TransmittalDisplay {
  const incoming = t.direction === "incoming";
  return {
    party: incoming ? t.received_from : t.sent_to,
    date: incoming ? t.date_received : t.date_sent,
  };
}
