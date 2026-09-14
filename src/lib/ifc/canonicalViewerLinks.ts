/** Display inference must never become authority for a Piece Control write. */
import { normalizePieceMark } from '@/services/modelElementStatus';
import { selectActionableLeafPieces } from '@/lib/pieceControl/canonicalRollups';
import type { ViewerCanonicalPiece, ViewerRosterRow } from './viewerSelection';

export function buildCanonicalViewerLinks(rows: ViewerRosterRow[] = [], pieces: ViewerCanonicalPiece[] = []) {
  const leaves = selectActionableLeafPieces(pieces.map(piece => ({ ...piece, parent_piece_id: piece.parent_piece_id ?? null, deleted_at: piece.deleted_at ?? null, is_container: !!piece.is_container, is_deleted: !!piece.is_deleted })));
  const byId = new Map(leaves.map(piece => [piece.id, piece]));
  const byMark = new Map<string, ViewerCanonicalPiece[]>();
  for (const piece of leaves) {
    const mark = normalizePieceMark(piece.piece_mark);
    if (mark) byMark.set(mark, [...(byMark.get(mark) || []), piece]);
  }
  const live = rows.filter(row => !row.is_deleted && !row.deleted_at);
  const direct = new Map<string, ViewerCanonicalPiece>();
  const blockedGuids = new Set<string>();
  const provenMarks = new Set<string>();
  for (const row of live) {
    const piece = row.piece_id ? byId.get(row.piece_id) : undefined;
    const guid = row.element_guid;
    if (!guid || !row.piece_id) continue;
    if (!piece || (direct.has(guid) && direct.get(guid)?.id !== piece.id)) blockedGuids.add(guid);
    if (piece) direct.set(guid, piece);
  }
  for (const guid of blockedGuids) direct.delete(guid);
  for (const row of live) {
    if (row.element_guid && blockedGuids.has(row.element_guid)) continue;
    const piece = row.piece_id ? byId.get(row.piece_id) : undefined;
    const mark = normalizePieceMark(row.piece_mark);
    if (piece && mark && normalizePieceMark(piece.piece_mark) === mark) provenMarks.add(mark);
  }
  const display = new Map(direct);
  const marksByGuid = new Map<string, Set<string>>();
  for (const row of live) {
    if (!row.element_guid) continue;
    const marks = marksByGuid.get(row.element_guid) || new Set<string>();
    marks.add(normalizePieceMark(row.piece_mark));
    marksByGuid.set(row.element_guid, marks);
  }
  for (const [guid, marks] of marksByGuid) {
    if (display.has(guid) || blockedGuids.has(guid) || marks.size !== 1) continue;
    const mark = [...marks][0];
    const lots = byMark.get(mark) || [];
    if (provenMarks.has(mark) && lots.length === 1) display.set(guid, lots[0]);
  }
  return { direct, display, blockedGuids };
}
