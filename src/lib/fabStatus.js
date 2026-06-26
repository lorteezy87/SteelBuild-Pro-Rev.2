/**
 * fabStatus.js — the manual fabrication-status vocabulary for the 3D viewer.
 *
 * A hand-set, coarse fab stage per piece (model_elements.fab_status), distinct
 * from the detailing-readiness engine (services/modelElementStatus). Used by the
 * viewer's "Fab" color mode + the click-to-assign control.
 */
export const FAB_STATUS_META = {
  not_started:    { label: "Not Started",    color: "#64748b" },
  in_fabrication: { label: "In Fabrication", color: "#3b82f6" },
  fabricated:     { label: "Fabricated",     color: "#22c55e" },
  shipped:        { label: "Shipped",        color: "#f59e0b" },
  erected:        { label: "Erected",        color: "#16a34a" },
};

/** Stages in shop order — drives the assign buttons + legend. */
export const FAB_STATUS_ORDER = ["not_started", "in_fabrication", "fabricated", "shipped", "erected"];

/**
 * Resolve the piece mark(s) to assign a fab status to for the current viewer
 * selection. Fab status is keyed on piece_mark (whole-assembly), so we turn the
 * selection into marks:
 *  - the clicked piece's LIVE IFC mark (read straight from the model, so it's
 *    always in sync with what's rendered), plus
 *  - any roster marks for the rest of a multi-selection.
 *
 * Preferring the live mark is what lets assignment keep working when the
 * rendered model's GlobalIds don't line up with the saved roster — e.g. a
 * re-exported model (Tekla regenerates GUIDs but marks are stable) or a part the
 * roster import skipped. Without it, a GUID-only lookup comes back empty and the
 * UI wrongly says "select a piece first" even though a piece is selected.
 *
 * @param {object} args
 * @param {{ assemblyMark?: string, partMark?: string }|null} [args.picked]  clicked piece's live marks
 * @param {string[]} [args.selectedGuids]  GlobalIds of the selected meshes
 * @param {Map<string, string>} [args.guidToMark]  roster GlobalId → piece_mark
 * @returns {string[]} distinct piece marks (Assembly preferred over Part)
 */
export function resolveFabMarks({ picked, selectedGuids = [], guidToMark } = {}) {
  const marks = new Set();
  const live = picked && (picked.assemblyMark || picked.partMark);
  if (live) marks.add(String(live));
  for (const guid of selectedGuids) {
    const mark = guidToMark?.get?.(guid);
    if (mark) marks.add(String(mark));
  }
  return [...marks];
}

/**
 * Decide what a "Set fab status" click should target, given the current viewer
 * selection and the requested scope. This is the pure core of the per-piece vs
 * whole-assembly fix: it returns EITHER a guid-scoped or a mark-scoped target so
 * the caller's DB write + optimistic recolor stay in lockstep.
 *
 * Scope "piece" (default — per-piece): target ONLY the selected GlobalIds that
 * exist in the saved roster (so the DB `.in("element_guid", …)` actually hits a
 * row). Only the clicked piece(s) change — a same-mark sibling is untouched.
 *
 * Fallback: if NONE of the selected GUIDs are in the roster — a CSV-only roster
 * (element_guid is NULL) or a re-exported Tekla model whose GUIDs regenerated
 * while marks stayed stable — per-piece can't target by GUID, so we fall back to
 * marks (via resolveFabMarks) and flag it (`fellBackToMark`) so the UI can say
 * the change hit the whole mark. We never silently no-op a guid-less assign.
 *
 * Scope "assembly" (whole-assembly): always mark-scoped (resolveFabMarks) — flips
 * every part sharing the clicked mark, the original behavior.
 *
 * @param {object} args
 * @param {"piece"|"assembly"} [args.scope]  default "piece"
 * @param {{ assemblyMark?: string, partMark?: string }|null} [args.picked]
 * @param {string[]} [args.selectedGuids]  GlobalIds of selected meshes
 * @param {Map<string, string>} [args.guidToMark]  roster GlobalId → piece_mark
 * @returns {{ mode: "guid", guids: string[], marks: [] }
 *          | { mode: "mark", guids: [], marks: string[], fellBackToMark?: boolean }
 *          | { mode: "none", guids: [], marks: [] }}
 *   mode "none" = nothing targetable (no selection / no mark + not in roster).
 */
export function resolveFabAssignment({
  scope = "piece",
  picked,
  selectedGuids = [],
  guidToMark,
} = {}) {
  if (scope === "assembly") {
    const marks = resolveFabMarks({ picked, selectedGuids, guidToMark });
    return marks.length
      ? { mode: "mark", guids: [], marks }
      : { mode: "none", guids: [], marks: [] };
  }
  // Per-piece: keep only GUIDs the roster actually knows (a real model_elements
  // row exists to update). De-dupe while preserving order.
  const guids = [];
  const seen = new Set();
  for (const guid of selectedGuids) {
    if (guid && guidToMark?.has?.(guid) && !seen.has(guid)) {
      seen.add(guid);
      guids.push(guid);
    }
  }
  if (guids.length) return { mode: "guid", guids, marks: [] };
  // No selected GUID is in the roster → can't scope by GUID. Fall back to mark
  // so a CSV-roster / re-exported-model piece is still assignable, and flag it.
  const marks = resolveFabMarks({ picked, selectedGuids, guidToMark });
  return marks.length
    ? { mode: "mark", guids: [], marks, fellBackToMark: true }
    : { mode: "none", guids: [], marks: [] };
}

/**
 * Summarize a project's model elements by their own fab_status (the populated,
 * hand-set/imported fab stage). Distinct from the detailing-readiness engine.
 * `counts` is keyed by FAB_STATUS_ORDER; unknown/blank statuses count toward
 * `total` only. `pct` = % of non-deleted elements with a known fab status.
 */
export function summarizeFabStatus(elements) {
  const counts = Object.fromEntries(FAB_STATUS_ORDER.map((s) => [s, 0]));
  let total = 0;
  let withFabStatus = 0;
  for (const el of Array.isArray(elements) ? elements : []) {
    if (!el || el.is_deleted) continue;
    total += 1;
    const s = el.fab_status;
    if (s && Object.prototype.hasOwnProperty.call(counts, s)) {
      counts[s] += 1;
      withFabStatus += 1;
    }
  }
  return { counts, withFabStatus, total, pct: total > 0 ? Math.round((withFabStatus / total) * 100) : 0 };
}
