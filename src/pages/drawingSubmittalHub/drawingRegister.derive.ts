/**
 * Pure derivations for the Drawing Register (command_ui re-skin, Slice 2a).
 *
 * No React, no network — reshapes `setPackages` (+ health / current-revision /
 * summary maps) into the per-set register row model, then filter + sort helpers.
 * Byte-identical to the legacy `rows` useMemo in drawingRegisterTable.tsx, so the
 * on-skin panel is behavior-preserving. Independently typed + unit-tested so it
 * stays strict-null / no-implicit-any clean. Mirrors drawingControlCenter.derive.ts.
 */
import { compareDrawingSetPackages, formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { effectiveDetailingState } from "@/lib/detailingPackageState";
import {
  currentRevisionForPackage,
  dueInfoFor,
  getSubmittalDueDate,
  isClosedPackage,
} from "./format";
import type { CurrentRevisionInfo, DueInfo } from "./types";

export interface DrawingRegisterRow {
  pkg: any;
  due: DueInfo;
  sheetCount: number;
  releasedCount: number;
  discipline: string;
  maxRev: string;
  dominantStage: string | null;
  /** Raw latest-submittal status — retained for the search filter ONLY (does not
   *  drive the Status cell, which renders from `effectiveState`). */
  status: string | null;
  effectiveState: string;
  done: boolean;
  late: boolean;
  health: any;
  locked: boolean;
  lockedReason: string | null;
  revSummary: any;
  setNo: string;
}

export interface BuildDrawingRegisterRowsInput {
  setPackages: any[];
  healthByKey?: Map<string, any>;
  currentRevByDrawingId?: Map<string, CurrentRevisionInfo>;
  summariesBySet?: Map<string, any>;
  /** submittal_workday_dues flag (resolved by the React caller; pure fn never
   *  reads the flag). Working-day due countdown when true. */
  workdayDues?: boolean;
}

/** Build the unfiltered/unsorted register row model — one row per drawing-set
 *  package. Pure over its inputs; mirrors the legacy `rows` map(). */
export function buildDrawingRegisterRows({
  setPackages,
  healthByKey,
  currentRevByDrawingId,
  summariesBySet,
  workdayDues = false,
}: BuildDrawingRegisterRowsInput): DrawingRegisterRow[] {
  const revMap = currentRevByDrawingId || new Map<string, CurrentRevisionInfo>();
  return (setPackages || []).map((pkg: any): DrawingRegisterRow => {
    const sheets: any[] = pkg.sheets || [];
    const submittals: any[] = pkg.submittals || [];
    const latestSubmittal = submittals.slice().sort((a, b) => (b.round_number || 1) - (a.round_number || 1))[0] || null;
    const sheetCount = sheets.length || (pkg.parent?.sheet_count ?? 0);
    // Per-sheet "released" count is DISPLAY ONLY (the n/total badge). It reads the
    // legacy columns to show progress but MUST NOT decide the package's
    // released/done state — that is submittal-governed below.
    const releasedCount = sheets.filter((d) => d.stage === "Released" || d.set_approval_status === "approved").length;
    // §20-21: the package's released/done state is the submittal authority, via the
    // SAME predicate as the hub's "Sets Released" KPI (isClosedPackage).
    const done = isClosedPackage(pkg);
    const effectiveState = effectiveDetailingState(pkg.parent, submittals, sheets);
    const due = dueInfoFor(getSubmittalDueDate(latestSubmittal), { closed: done, useWorkdays: workdayDues });
    const discipline = pkg.parent?.discipline || [...new Set(sheets.map((d) => d.discipline).filter(Boolean))][0] || "—";
    // §20-21: displayed Rev is a per-set rollup of the AUTHORITATIVE current
    // revision (drawing_revisions.is_current) — highest-version sheet code — with a
    // legacy-number then "—" fallback inside currentRevisionForPackage.
    const maxRev = currentRevisionForPackage(sheets, revMap);
    const stageCounts: Record<string, number> = {};
    for (const d of sheets) if (d.stage) stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
    const dominantStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return {
      pkg, due, sheetCount, releasedCount, discipline, maxRev, dominantStage,
      status: latestSubmittal?.status || null,
      effectiveState, done, late: !!due.overdue && !done,
      health: healthByKey?.get(pkg.key) || null,
      locked: !!pkg.parent?.is_locked,
      lockedReason: pkg.parent?.locked_reason || null,
      revSummary: pkg.setId ? (summariesBySet?.get(String(pkg.setId)) || null) : null,
      setNo: pkg.parent ? formatDrawingSetNumber(pkg.parent) : "TBD",
    };
  });
}

/** Case-insensitive search over name / setNo / discipline / status. Pure. */
export function filterDrawingRegisterRows(rows: DrawingRegisterRow[], search: string): DrawingRegisterRow[] {
  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter((r) =>
    (r.pkg.name || "").toLowerCase().includes(q)
    || String(r.setNo).toLowerCase().includes(q)
    || (r.discipline || "").toLowerCase().includes(q)
    || (r.status || "").toLowerCase().includes(q),
  );
}

/** Sort by health (asc/desc, null score → 101 last) or, when null, by the
 *  canonical drawing-set package ordering. Returns a new array. Pure. */
export function sortDrawingRegisterRows(
  rows: DrawingRegisterRow[],
  sortByHealth: null | "asc" | "desc",
): DrawingRegisterRow[] {
  return rows.slice().sort((a, b) => {
    if (sortByHealth) {
      const sa = a.health?.score ?? 101;
      const sb = b.health?.score ?? 101;
      return sortByHealth === "asc" ? sa - sb : sb - sa;
    }
    return compareDrawingSetPackages(a.pkg.parent || a.pkg, b.pkg.parent || b.pkg);
  });
}
