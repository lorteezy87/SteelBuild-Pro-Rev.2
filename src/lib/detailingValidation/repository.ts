import { supabase } from '@/lib/supabase';
import { validateDetailingPieces } from '@/lib/detailingValidation/pieceRules';
import type { ValidationPiece, ValidationSet, ValidationPieceDrawing, ValidationPieceDrawingSet } from '@/lib/detailingValidation/pieceRules';
import { validateDetailingSheets } from '@/lib/detailingValidation/rules';
import type { ValidationSheet, ValidationRevision, ValidationHold } from '@/lib/detailingValidation/rules';

// Piece Control tables are not yet in the generated database types. Keep their
// select contract local and typed instead of spreading an untyped client.
interface PieceEvidenceQuery<T> extends PromiseLike<{ data: T[] | null; error: unknown }> {
  select(columns: string): PieceEvidenceQuery<T>;
  eq(column: string, value: string | boolean): PieceEvidenceQuery<T>;
  order(column: string): PieceEvidenceQuery<T>;
  range(start: number, end: number): PieceEvidenceQuery<T>;
}
const pieceTable = <T>(name: 'pieces' | 'piece_drawings' | 'piece_drawing_sets') =>
  (supabase.from as unknown as (table: string) => PieceEvidenceQuery<T>)(name);

async function allRows<T>(page: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data) throw new Error('Validation evidence was not returned. Retry the check.');
    if (!data.length) return rows;
    rows.push(...data);
  }
}
/** Fresh, complete reads only when the user runs validation. No service role or writes. */
export async function runDetailingValidation(projectId: string) {
  if (!projectId) throw new Error('Select a project before running validation.');
  const [sheets, revisions, holds, pieces, sets, pieceDrawings, pieceDrawingSets] = await Promise.all([
    allRows<ValidationSheet>((start,end) => supabase.from('drawings')
      .select('id, sheet_number, title, revision_number, file_url, drawing_set_id, drawing_set_name, is_superseded, deleted_at')
      .eq('project_id', projectId).eq('is_deleted', false).order('id').range(start,end)),
    allRows<ValidationRevision>((start,end) => supabase.from('drawing_revisions')
      .select('drawing_id, is_current, revision_code, file_url')
      .eq('project_id', projectId).eq('is_current', true).order('id').range(start,end)),
    allRows<ValidationHold>((start,end) => supabase.from('drawing_holds')
      .select('drawing_id, is_active, reason').eq('project_id', projectId).eq('is_active', true).order('id').range(start,end)),
    allRows<ValidationPiece>((start,end) => pieceTable<ValidationPiece>('pieces')
      .select('id, piece_mark, lot_code, parent_piece_id, is_container, is_deleted, deleted_at, quantity, weight_each_lbs, weight_total_lbs, lifecycle_status')
      .eq('project_id', projectId).eq('is_deleted', false).order('id').range(start,end)),
    allRows<ValidationSet>((start,end) => supabase.from('drawing_sets').select('id, set_name, deleted_at')
      .eq('project_id', projectId).eq('is_deleted', false).order('id').range(start,end)),
    allRows<ValidationPieceDrawing>((start,end) => pieceTable<ValidationPieceDrawing>('piece_drawings')
      .select('piece_id, drawing_id').eq('project_id', projectId).order('piece_id').order('drawing_id').range(start,end)),
    allRows<ValidationPieceDrawingSet>((start,end) => pieceTable<ValidationPieceDrawingSet>('piece_drawing_sets')
      .select('piece_id, drawing_set_id').eq('project_id', projectId).order('piece_id').order('drawing_set_id').range(start,end)),
  ]);
  const sheetReport = validateDetailingSheets(sheets, revisions, holds);
  const pieceReport = validateDetailingPieces({ pieces, sheets, sets, holds, pieceDrawings, pieceDrawingSets });
  return {
    findings: [...sheetReport.findings, ...pieceReport.findings].sort((a,b) =>
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || a.recordType.localeCompare(b.recordType) || a.recordLabel.localeCompare(b.recordLabel, undefined, {numeric:true})),
    sheetsChecked: sheetReport.checked, piecesChecked: pieceReport.checked,
    checked: sheetReport.checked + pieceReport.checked,
    errors: sheetReport.errors + pieceReport.errors,
    warnings: sheetReport.warnings + pieceReport.warnings,
    clear: sheetReport.clear + pieceReport.clear,
    checkedAt: new Date().toISOString(),
  };
}
