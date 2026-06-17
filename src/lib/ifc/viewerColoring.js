/**
 * viewerColoring.js — pure color logic for the 3D viewer's "Color by" modes.
 *
 * Extracted from Model3DTab so the mode→color mapping (especially manual Fab
 * status) is unit-testable without rendering three.js. Each builder turns a data
 * source into a GlobalId→value map; colorFnFor turns a mode + those maps into the
 * function the viewer paints with. Returning null = use the part's native IFC
 * color (see loadIfcGeometry.recolor).
 */
import { ELEMENT_STATUS_META, normalizePieceMark } from "@/services/modelElementStatus";
import { FAB_STATUS_META } from "@/lib/fabStatus";

export const TYPE_PALETTE = { beam: "#3b82f6", column: "#f97316", plate: "#22c55e", member: "#a855f7", other: "#94a3b8" };
export const SEQ_PALETTE = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#eab308", "#ef4444", "#14b8a6", "#ec4899", "#8b5cf6", "#84cc16", "#06b6d4", "#f59e0b"];

/** Stable categorical color for a sequence/phase label. */
export function seqColor(seq) {
  if (seq == null || seq === "") return null;
  const s = String(seq);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SEQ_PALETTE[h % SEQ_PALETTE.length];
}

/** GlobalId → detailing-status color, excluding "unmapped" (those keep native). */
export function buildStatusByGuid(modelMapping) {
  const map = new Map();
  const byStatus = modelMapping?.guidsByStatus || {};
  for (const [status, guids] of Object.entries(byStatus)) {
    if (status === "unmapped") continue;
    const color = ELEMENT_STATUS_META[status]?.color;
    if (!color) continue;
    for (const guid of guids) map.set(guid, color);
  }
  return map;
}

/** GlobalId → erection sequence label, from the imported roster. */
export function buildSeqByGuid(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (r?.element_guid && r.sequence_number != null && r.sequence_number !== "") {
      map.set(r.element_guid, String(r.sequence_number));
    }
  }
  return map;
}

/** GlobalId → manual fab_status, from the imported roster. */
export function buildFabByGuid(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (r?.element_guid && r.fab_status) map.set(r.element_guid, r.fab_status);
  }
  return map;
}

// ── Mark-keyed fallbacks ────────────────────────────────────────────────
// The rendered meshes are keyed by IFC GlobalId, but only IFC-sourced roster
// rows carry a GUID. CSV-imported rows leave element_guid NULL, and a CSV update
// touches only one part of a multi-part assembly — so guid-keyed coloring skips
// the rest. These build mark-keyed maps and a GUID→mark bridge so the viewer can
// fall back to the part's piece mark when its GUID isn't directly colorable.

/** GlobalId → normalized piece mark, from roster rows that carry a GUID. The
 *  bridge that lets mark-keyed data color geometry the viewer only knows by GUID. */
export function buildMarkByGuid(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (r?.element_guid && r.piece_mark) map.set(r.element_guid, normalizePieceMark(r.piece_mark));
  }
  return map;
}

/** Normalized piece mark → erection sequence label (any row, GUID or not). */
export function buildSeqByMark(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const mark = normalizePieceMark(r?.piece_mark);
    if (mark && r.sequence_number != null && r.sequence_number !== "" && !map.has(mark)) {
      map.set(mark, String(r.sequence_number));
    }
  }
  return map;
}

/** Normalized piece mark → manual fab_status (any row, GUID or not). */
export function buildFabByMark(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const mark = normalizePieceMark(r?.piece_mark);
    if (mark && r.fab_status && !map.has(mark)) map.set(mark, r.fab_status);
  }
  return map;
}

/** Normalized piece mark → detailing-status color, excluding "unmapped". When an
 *  assembly's parts resolve to different statuses, the highest-precedence bucket
 *  wins (marksByStatus is precedence-ordered; first set wins). */
export function buildStatusByMark(modelMapping) {
  const map = new Map();
  const byStatus = modelMapping?.marksByStatus || {};
  for (const [status, marks] of Object.entries(byStatus)) {
    if (status === "unmapped") continue;
    const color = ELEMENT_STATUS_META[status]?.color;
    if (!color) continue;
    for (const mark of marks) {
      const mk = normalizePieceMark(mark);
      if (mk && !map.has(mk)) map.set(mk, color);
    }
  }
  return map;
}

/**
 * The color function the viewer paints with for a given mode. Returns a hex
 * string or null; null tells the viewer to use the part's native IFC color.
 *
 * GUID-keyed maps are primary (unchanged). When a part's GUID isn't in the
 * relevant map, we resolve its piece mark via markByGuid and consult the
 * mark-keyed fallback — so CSV rosters and the un-updated parts of an assembly
 * color too. Omitting the mark maps reproduces the original GUID-only behavior.
 */
export function colorFnFor(
  colorMode,
  { statusByGuid, seqByGuid, fabByGuid, markByGuid, statusByMark, seqByMark, fabByMark } = {},
) {
  if (colorMode === "type") return (info) => TYPE_PALETTE[info.ifcType] || TYPE_PALETTE.other;
  const markOf = (info) => (info.guid ? markByGuid?.get(info.guid) : undefined);
  if (colorMode === "sequence") {
    return (info) => {
      if (!info.guid) return null;
      return seqColor(seqByGuid?.get(info.guid) ?? seqByMark?.get(markOf(info)));
    };
  }
  if (colorMode === "status") {
    return (info) => {
      if (!info.guid) return null;
      return statusByGuid?.get(info.guid) ?? statusByMark?.get(markOf(info)) ?? null;
    };
  }
  if (colorMode === "fab") {
    return (info) => {
      if (!info.guid) return null;
      const fab = fabByGuid?.get(info.guid) ?? fabByMark?.get(markOf(info));
      return FAB_STATUS_META[fab]?.color ?? null;
    };
  }
  return () => null; // "model" → native colors
}
