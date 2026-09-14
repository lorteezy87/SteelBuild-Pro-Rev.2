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
import type { SetPackage } from "@/pages/drawingSubmittalHub/types";

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

export interface IndexedRegisterRow {
  row: DrawingRegisterRow;
  setName: string | null;
  searchText: string;
  pkg: SetPackage | null;
}

export interface DrawingRegisterIndex {
  entries: IndexedRegisterRow[];
  setNames: string[];
  setCounts: ReadonlyMap<string, number>;
  unassignedCount: number;
}

/**
 * Build all dataset-scoped register lookups in one linear pass. Consumers keep
 * this object memoized by register/package identity, so filtering only scans
 * normalized strings and never repeats drawing-to-package joins.
 */
export function createDrawingRegisterIndex(
  rows: DrawingRegisterRow[],
  setPackages: SetPackage[] = [],
): DrawingRegisterIndex {
  const packageByDrawingId = new Map<string, SetPackage>();
  const packageBySetId = new Map<string, SetPackage>();
  for (const pkg of setPackages) {
    if (pkg.setId) packageBySetId.set(String(pkg.setId), pkg);
    for (const drawing of [...pkg.sheets, ...pkg.supersededSheets]) {
      if (drawing.id) packageByDrawingId.set(String(drawing.id), pkg);
    }
  }

  const names = new Set<string>();
  const setCounts = new Map<string, number>();
  let unassignedCount = 0;
  const entries = rows.map((row): IndexedRegisterRow => {
    const setName = (row.drawing_set_name || "").trim() || null;
    if (setName) {
      names.add(setName);
      setCounts.set(setName, (setCounts.get(setName) || 0) + 1);
    } else {
      unassignedCount += 1;
    }
    const pkg = packageByDrawingId.get(row.drawing_id)
      ?? (row.drawing_set_id ? packageBySetId.get(String(row.drawing_set_id)) : undefined)
      ?? null;
    return {
      row,
      setName,
      pkg,
      searchText: [
        row.sheet_number,
        row.sheet_title,
        row.discipline,
        row.drawing_set_name,
        row.current_status,
      ].map((value) => value || "").join("\n").toLowerCase(),
    };
  });

  return {
    entries,
    setNames: [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    setCounts,
    unassignedCount,
  };
}

export function filterIndexedRegisterRows(
  index: DrawingRegisterIndex,
  query: string,
  statusFilter: string,
  setFilter: string = "all",
): IndexedRegisterRow[] {
  const q = query.trim().toLowerCase();
  return index.entries.filter((entry) => {
    if (statusFilter !== "all" && entry.row.current_status !== statusFilter) return false;
    if (setFilter !== "all") {
      if (setFilter === SET_FILTER_NONE) {
        if (entry.setName) return false;
      } else if (entry.row.drawing_set_name !== setFilter) {
        return false;
      }
    }
    return !q || entry.searchText.includes(q);
  });
}

export function filterRegisterRows(
  rows: DrawingRegisterRow[],
  query: string,
  statusFilter: string,
  setFilter: string = "all",
): DrawingRegisterRow[] {
  return filterIndexedRegisterRows(
    createDrawingRegisterIndex(rows),
    query,
    statusFilter,
    setFilter,
  ).map((entry) => entry.row);
}

/** Unique non-empty set names from the register, sorted for the set filter dropdown. */
export function listDrawingSetNames(rows: DrawingRegisterRow[]): string[] {
  return createDrawingRegisterIndex(rows).setNames;
}

export interface IndexedRegisterSetGroup {
  /** Null = unassigned (no set name). */
  setName: string | null;
  rows: IndexedRegisterRow[];
}

/**
 * Group filtered rows by drawing_set_name. Named sets first (A–Z), unassigned last.
 * Within each group, preserve the input order (already sheet_number-sorted by the view).
 */
export function groupIndexedRegisterRowsBySet(
  rows: IndexedRegisterRow[],
): IndexedRegisterSetGroup[] {
  const map = new Map<string | null, IndexedRegisterRow[]>();
  for (const entry of rows) {
    const key = entry.setName;
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  const named = [...map.keys()].filter((k): k is string => k != null)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const out: IndexedRegisterSetGroup[] = named.map((setName) => ({ setName, rows: map.get(setName)! }));
  if (map.has(null)) out.push({ setName: null, rows: map.get(null)! });
  return out;
}

export interface RegisterSetGroup {
  /** Null = unassigned (no set name). */
  setName: string | null;
  rows: DrawingRegisterRow[];
}

export function groupRegisterRowsBySet(rows: DrawingRegisterRow[]): RegisterSetGroup[] {
  return groupIndexedRegisterRowsBySet(createDrawingRegisterIndex(rows).entries)
    .map((group) => ({
      setName: group.setName,
      rows: group.rows.map((entry) => entry.row),
    }));
}

export type RegisterDisplayRow =
  | { kind: "sheet"; entry: IndexedRegisterRow }
  | { kind: "group"; key: string; label: string; count: number; collapsed: boolean };

export function buildRegisterDisplayRows(
  rows: IndexedRegisterRow[],
  groupBySet: boolean,
  collapsed: ReadonlySet<string>,
): RegisterDisplayRow[] {
  if (!groupBySet) return rows.map((entry) => ({ kind: "sheet", entry }));

  const displayRows: RegisterDisplayRow[] = [];
  for (const group of groupIndexedRegisterRowsBySet(rows)) {
    const key = group.setName ?? SET_FILTER_NONE;
    const isCollapsed = collapsed.has(key);
    displayRows.push({
      kind: "group",
      key,
      label: group.setName || "Unassigned",
      count: group.rows.length,
      collapsed: isCollapsed,
    });
    if (!isCollapsed) {
      for (const entry of group.rows) displayRows.push({ kind: "sheet", entry });
    }
  }
  return displayRows;
}

export function firstVisibleDrawingByPackage(
  rows: IndexedRegisterRow[],
): ReadonlyMap<string, string> {
  const first = new Map<string, string>();
  for (const entry of rows) {
    if (entry.pkg && !first.has(entry.pkg.key)) {
      first.set(entry.pkg.key, entry.row.drawing_id);
    }
  }
  return first;
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
