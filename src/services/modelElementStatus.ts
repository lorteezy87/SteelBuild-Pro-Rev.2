/**
 * modelElementStatus.ts — per-element status for the 3D model integration.
 *
 * Pure + deterministic. No React, no Supabase. This is the "paint by numbers"
 * engine for the Detailing Control Center viewer: it maps every model element
 * (a steel member keyed by IFC GUID + piece mark) to ONE status bucket, derived
 * from the SAME readiness read-model the hub already renders
 * (lib/detailingReadiness.computeDetailingReadiness) — so the 3D coloring can
 * never disagree with the dashboard numbers (design doc §4: derive, don't store).
 *
 * Status precedence (first match wins):
 *   1. unmapped         — element resolves to no detailing package
 *   2. rfi_blocked      — the package itself is RFI-blocked
 *   3. behind_schedule  — the package's backward schedule is at risk
 *   4. erection_ready   — package erection-ready (terminal good state)
 *   5. fab_ready        — package fabrication-ready
 *   6. in_review        — package is in the submittal cycle (IFA…Released band)
 *   7. in_detailing     — drafting band (Not Started…Ready to Submit)
 */

import { DETAILING_STATE_ORDER } from "@/lib/detailingPackageState";

export type ElementStatusKey =
  | "unmapped"
  | "rfi_blocked"
  | "behind_schedule"
  | "erection_ready"
  | "fab_ready"
  | "in_review"
  | "in_detailing";

/** Render metadata per bucket (hex colors for viewer theming + chips). */
export const ELEMENT_STATUS_META: Record<ElementStatusKey, { label: string; color: string }> = {
  unmapped:        { label: "Unmapped",        color: "#64748b" },
  rfi_blocked:     { label: "RFI Hold",        color: "#ef4444" },
  behind_schedule: { label: "Behind Schedule", color: "#f97316" },
  erection_ready:  { label: "Erection Ready",  color: "#16a34a" },
  fab_ready:       { label: "Fab Ready",       color: "#22c55e" },
  in_review:       { label: "In Review",       color: "#3b82f6" },
  in_detailing:    { label: "In Detailing",    color: "#eab308" },
};

export interface ModelElementLike {
  id?: string | null;
  element_guid?: string | null;
  piece_mark?: string | null;
  drawing_id?: string | null;
  drawing_set_id?: string | null;
  is_deleted?: boolean | null;
  [key: string]: unknown;
}

/** The slice of computeDetailingReadiness output this engine consumes. */
export interface PackageReadinessLike {
  effectiveState?: string | null;
  fabricationReady?: boolean;
  erectionReady?: boolean;
  rfiBlocked?: boolean;
  /** The hub's at-risk flag for the package (derived from scheduleRisk). */
  atRisk?: boolean;
  [key: string]: unknown;
}

/** Trim/uppercase a piece mark for matching ("1b1 " -> "1B1"). */
export function normalizePieceMark(mark: unknown): string {
  return String(mark ?? "").trim().toUpperCase();
}

const IFA_IDX = DETAILING_STATE_ORDER.indexOf("IFA");

/**
 * Resolve one element's status bucket.
 *
 * @param element            the model_elements row
 * @param readinessBySetId   drawing_set_id -> readiness (hub-computed)
 * @param sheetSetIdByDrawingId  drawing_id -> drawing_set_id (for elements
 *                           linked to a sheet but not directly to a set)
 */
export function resolveElementStatus(
  element: ModelElementLike,
  readinessBySetId: Map<string, PackageReadinessLike>,
  sheetSetIdByDrawingId: Map<string, string> = new Map(),
): ElementStatusKey {
  const setId =
    (element.drawing_set_id as string | null) ||
    (element.drawing_id ? sheetSetIdByDrawingId.get(String(element.drawing_id)) ?? null : null);
  const readiness = setId ? readinessBySetId.get(String(setId)) : undefined;
  if (!readiness) return "unmapped";
  if (readiness.rfiBlocked) return "rfi_blocked";
  if (readiness.atRisk) return "behind_schedule";
  if (readiness.erectionReady) return "erection_ready";
  if (readiness.fabricationReady) return "fab_ready";
  const stateIdx = DETAILING_STATE_ORDER.indexOf(String(readiness.effectiveState ?? ""));
  return stateIdx >= IFA_IDX ? "in_review" : "in_detailing";
}

export interface ElementStatusSummary {
  /** Total non-deleted elements considered. */
  total: number;
  /** Elements per bucket. */
  counts: Record<ElementStatusKey, number>;
  /** IFC GUIDs per bucket — the viewer color-mapping input. */
  guidsByStatus: Record<ElementStatusKey, string[]>;
  /**
   * Normalized piece marks per bucket — the mark-keyed coloring fallback for
   * geometry whose GUID isn't on a roster row (CSV imports leave element_guid
   * NULL, and a CSV update touches only one part of a multi-part assembly). The
   * viewer resolves a part's GUID -> mark and falls back to this when the GUID
   * itself isn't in guidsByStatus.
   */
  marksByStatus: Record<ElementStatusKey, string[]>;
  /** Element ids per bucket (for list drill-downs). */
  idsByStatus: Record<ElementStatusKey, string[]>;
  /** % of elements that resolved to a package (mapping coverage). */
  mappedPct: number;
}

const BUCKETS: ElementStatusKey[] = [
  "unmapped", "rfi_blocked", "behind_schedule",
  "erection_ready", "fab_ready", "in_review", "in_detailing",
];

/**
 * Summarize a project's elements into bucket counts + GUID sets.
 * The GUID sets feed the viewer ("click Overdue -> paint these members red");
 * the counts feed the hub chips before any viewer exists.
 */
export function summarizeElementStatuses(
  elements: ModelElementLike[] | null | undefined,
  readinessBySetId: Map<string, PackageReadinessLike>,
  sheetSetIdByDrawingId: Map<string, string> = new Map(),
): ElementStatusSummary {
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<ElementStatusKey, number>;
  const guidsByStatus = Object.fromEntries(BUCKETS.map((b) => [b, [] as string[]])) as Record<ElementStatusKey, string[]>;
  const marksByStatus = Object.fromEntries(BUCKETS.map((b) => [b, [] as string[]])) as Record<ElementStatusKey, string[]>;
  const idsByStatus = Object.fromEntries(BUCKETS.map((b) => [b, [] as string[]])) as Record<ElementStatusKey, string[]>;

  let total = 0;
  for (const el of elements || []) {
    if (!el || el.is_deleted) continue;
    total += 1;
    const status = resolveElementStatus(el, readinessBySetId, sheetSetIdByDrawingId);
    counts[status] += 1;
    if (el.element_guid) guidsByStatus[status].push(String(el.element_guid));
    const mark = normalizePieceMark(el.piece_mark);
    if (mark) marksByStatus[status].push(mark);
    if (el.id) idsByStatus[status].push(String(el.id));
  }

  const mapped = total - counts.unmapped;
  return {
    total,
    counts,
    guidsByStatus,
    marksByStatus,
    idsByStatus,
    mappedPct: total > 0 ? Math.round((mapped / total) * 100) : 0,
  };
}
