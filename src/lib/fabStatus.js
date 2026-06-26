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
