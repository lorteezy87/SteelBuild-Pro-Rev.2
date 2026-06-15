/**
 * viewerColoring.js — pure color logic for the 3D viewer's "Color by" modes.
 *
 * Extracted from Model3DTab so the mode→color mapping (especially manual Fab
 * status) is unit-testable without rendering three.js. Each builder turns a data
 * source into a GlobalId→value map; colorFnFor turns a mode + those maps into the
 * function the viewer paints with. Returning null = use the part's native IFC
 * color (see loadIfcGeometry.recolor).
 */
import { ELEMENT_STATUS_META } from "@/services/modelElementStatus";
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

/**
 * The color function the viewer paints with for a given mode. Returns a hex
 * string or null; null tells the viewer to use the part's native IFC color.
 */
export function colorFnFor(colorMode, { statusByGuid, seqByGuid, fabByGuid } = {}) {
  if (colorMode === "type") return (info) => TYPE_PALETTE[info.ifcType] || TYPE_PALETTE.other;
  if (colorMode === "sequence") return (info) => (info.guid ? seqColor(seqByGuid?.get(info.guid)) : null);
  if (colorMode === "status") return (info) => (info.guid ? (statusByGuid?.get(info.guid) ?? null) : null);
  if (colorMode === "fab") return (info) => (info.guid ? (FAB_STATUS_META[fabByGuid?.get(info.guid)]?.color ?? null) : null);
  return () => null; // "model" → native colors
}
