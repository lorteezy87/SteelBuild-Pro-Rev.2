/**
 * revisionImpactBoard.ts — enrich computeRevisionImpact() change-revisions for
 * the Hub's Revision Impact board. Joins each changed sheet to its set's work
 * package, linked RFIs (open/all), fab-release-blocked state, and an
 * affected-piece count. Pure + deterministic (no React, no I/O).
 *
 * Affected pieces: `model_elements.drawing_set_id` is the EXACT link when
 * populated, but most rosters don't set it (the IFC import writes piece_mark +
 * sequence_number, not the set FK — verified 12/38,870 live). So we fall back to
 * matching the set's linked-WP sequence to `model_elements.sequence_number`, and
 * `null` (rendered "—") when neither resolves. `work_package_id` is unpopulated
 * live (0 rows), so it is not used.
 */

import { isRfiOpen } from "@/lib/entityPredicates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normRfi(x: any): string {
  return String(x ?? "").replace(/[-\s]/g, "").toLowerCase();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wpSequenceOf(wp: any): string | null {
  const v = wp?.sequence_number ?? wp?.erection_sequence ?? wp?.sequence ?? wp?.area_sequence ?? null;
  return v != null && v !== "" ? String(v) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isOpenRfi(r: any): boolean {
  return isRfiOpen(r);
}

export interface RevisionImpactSources {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawings?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawingSets?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workPackages?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rfis?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelElements?: any[];
}

export interface RevisionImpactRow {
  // ...spread from the computeRevisionImpact entry (revisionId, drawingId, sheetNumber,
  // revisionCode, issuedAt, drawingSetName, fabricated, delivered, inField, severity)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
  setName: string;
  wpNames: string[];
  rfiCount: number;
  openRfiCount: number;
  fabBlocked: boolean;
  affectedPieces: number | null;
}

/**
 * @param revisionImpact computeRevisionImpact() output (one entry per change-revision)
 */
export function buildRevisionImpactRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revisionImpact: any[] = [],
  sources: RevisionImpactSources = {},
): RevisionImpactRow[] {
  const { drawings = [], drawingSets = [], workPackages = [], rfis = [], modelElements = [] } = sources;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawingsById = new Map<string, any>();
  for (const d of drawings || []) if (d?.id) drawingsById.set(String(d.id), d);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setById = new Map<string, any>();
  for (const s of drawingSets || []) if (s?.id) setById.set(String(s.id), s);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wpById = new Map<string, any>();
  for (const w of workPackages || []) if (w?.id && !w.is_deleted) wpById.set(String(w.id), w);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfiByNum = new Map<string, any>();
  for (const r of rfis || []) if (r && !r.is_deleted) rfiByNum.set(normRfi(r.rfi_number), r);

  // Piece-count indexes: exact (by set FK) + heuristic (by sequence).
  const elemBySet = new Map<string, number>();
  const elemBySeq = new Map<string, number>();
  for (const e of modelElements || []) {
    if (!e || e.is_deleted) continue;
    if (e.drawing_set_id) {
      const k = String(e.drawing_set_id);
      elemBySet.set(k, (elemBySet.get(k) || 0) + 1);
    }
    const seq = e.sequence_number != null && e.sequence_number !== "" ? String(e.sequence_number) : "";
    if (seq) elemBySeq.set(seq, (elemBySeq.get(seq) || 0) + 1);
  }

  return (revisionImpact || []).map((imp) => {
    const dwg = drawingsById.get(String(imp?.drawingId)) || null;
    const set = dwg?.drawing_set_id ? setById.get(String(dwg.drawing_set_id)) : null;
    const wpIds: string[] = (set?.linked_work_package_ids as string[]) || [];
    const wps = wpIds.map((id) => wpById.get(String(id))).filter(Boolean);
    const wpNames = wps.map((w) => w.wp_number || w.name || w.title).filter(Boolean);

    const nums = [...new Set(String(dwg?.linked_rfi_ids || "").split(/[,\s]+/).map(normRfi).filter(Boolean))];
    const linkedRfis = nums.map((n) => rfiByNum.get(n)).filter(Boolean);
    const openRfis = linkedRfis.filter(isOpenRfi);
    const fabBlocked = openRfis.some((r) => r.fab_hold === true);

    // Affected pieces: exact via drawing_set_id, else heuristic via WP sequence.
    let affectedPieces: number | null = null;
    const setId = set?.id ? String(set.id) : (dwg?.drawing_set_id ? String(dwg.drawing_set_id) : null);
    if (setId && elemBySet.has(setId)) {
      affectedPieces = elemBySet.get(setId) ?? null;
    } else {
      for (const w of wps) {
        const seq = wpSequenceOf(w);
        if (seq && elemBySeq.has(seq)) affectedPieces = (affectedPieces || 0) + (elemBySeq.get(seq) || 0);
      }
    }

    return {
      ...imp,
      setName: imp?.drawingSetName || set?.set_name || "—",
      wpNames,
      rfiCount: linkedRfis.length,
      openRfiCount: openRfis.length,
      fabBlocked,
      affectedPieces,
    };
  });
}
