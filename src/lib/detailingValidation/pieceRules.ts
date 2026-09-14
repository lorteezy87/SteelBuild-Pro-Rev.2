/** Donor piece checks adapted to Rev 2 actionable lots and both relationship authorities. */
import { selectActionableLeafPieces } from '@/lib/pieceControl/canonicalRollups';
import type { LeafSelectablePiece } from '@/lib/pieceControl/canonicalRollups';
import { pieceTotalWeightLbs } from '@/lib/pieceControl/tonnage';
import { VALIDATION_RULES } from '@/lib/detailingValidation/rules';
import type { DetailingFinding, ValidationRule, ValidationSheet, ValidationHold } from '@/lib/detailingValidation/rules';

export interface ValidationPiece extends LeafSelectablePiece {
  piece_mark: string;
  lot_code?: string | null;
  quantity: number;
  weight_each_lbs: number | null;
  weight_total_lbs: number | null;
  lifecycle_status: string;
}
export interface ValidationSet { id: string; set_name?: string | null; is_deleted?: boolean | null; deleted_at?: string | null }
export interface ValidationPieceDrawing { piece_id: string; drawing_id: string }
export interface ValidationPieceDrawingSet { piece_id: string; drawing_set_id: string }
interface Input {
  pieces: ValidationPiece[];
  sheets: readonly ValidationSheet[];
  sets: readonly ValidationSet[];
  holds: readonly ValidationHold[];
  pieceDrawings: readonly ValidationPieceDrawing[];
  pieceDrawingSets: readonly ValidationPieceDrawingSet[];
}

export function validateDetailingPieces(input: Input) {
  const leaves = selectActionableLeafPieces(input.pieces);
  const liveSheets = input.sheets.filter(sheet => !sheet.is_deleted && !sheet.deleted_at && !sheet.is_superseded);
  const sheetById = new Map(liveSheets.map(sheet => [sheet.id, sheet]));
  const sets = new Map(input.sets.filter(set => !set.is_deleted && !set.deleted_at).map(set => [set.id, set]));
  const sheetsBySet = new Map<string, string[]>();
  for (const sheet of liveSheets) {
    if (sheet.drawing_set_id && sets.has(sheet.drawing_set_id)) {
      sheetsBySet.set(sheet.drawing_set_id, [...(sheetsBySet.get(sheet.drawing_set_id) || []), sheet.id]);
    }
  }
  const sheetsByPiece = new Map<string, Set<string>>();
  const linkSheet = (pieceId: string, drawingId: string) => {
    if (!sheetById.has(drawingId)) return;
    const linked = sheetsByPiece.get(pieceId) || new Set<string>();
    linked.add(drawingId);
    sheetsByPiece.set(pieceId, linked);
  };
  for (const link of input.pieceDrawings) linkSheet(link.piece_id, link.drawing_id);
  for (const link of input.pieceDrawingSets) {
    for (const drawingId of sheetsBySet.get(link.drawing_set_id) || []) linkSheet(link.piece_id, drawingId);
  }
  const held = new Set(input.holds.filter(hold => hold.is_active).map(hold => hold.drawing_id));
  const findings: DetailingFinding[] = [];
  for (const piece of leaves) {
    const linked = [...(sheetsByPiece.get(piece.id) || [])];
    const setNames = [...new Set(linked.map(id => {
      const sheet = sheetById.get(id)!;
      return (sheet.drawing_set_id ? sets.get(sheet.drawing_set_id)?.set_name : null) || sheet.drawing_set_name;
    }).filter(Boolean))];
    const add = (rule: ValidationRule, detail?: string) => findings.push({
      id: `piece:${piece.id}:${rule}`, recordType: 'piece', recordId: piece.id,
      recordLabel: piece.lot_code ? `${piece.piece_mark} · ${piece.lot_code}` : piece.piece_mark,
      set: setNames.join(', ') || 'Unassigned', rule, ...VALIDATION_RULES[rule],
      ...(detail ? { detail } : {}), href: `/PieceRegister?view=register&piece=${encodeURIComponent(piece.id)}`,
    });
    const weight = pieceTotalWeightLbs(piece);
    if (!Number.isFinite(piece.quantity) || piece.quantity <= 0 || weight == null || !Number.isFinite(weight) || weight <= 0) add('piece_missing_quantity_or_weight');
    if (!linked.length) add('piece_unlinked');
    const heldCount = linked.filter(id => held.has(id)).length;
    if (piece.lifecycle_status === 'erected' && heldCount) {
      add('piece_erected_drawing_on_hold', `${heldCount} linked ${heldCount === 1 ? 'sheet is' : 'sheets are'} currently on hold. Review the erected lot with the field team; this does not establish when the hold began.`);
    }
  }
  findings.sort((a,b) => a.recordLabel.localeCompare(b.recordLabel, undefined, {numeric:true}));
  const errors = new Set(findings.map(f => f.recordId));
  return { findings, checked: leaves.length, errors: errors.size, warnings: 0, clear: leaves.length - errors.size };
}
