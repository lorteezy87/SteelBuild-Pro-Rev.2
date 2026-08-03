/**
 * Expand piece→drawing-set links (and legacy piece→sheet links) into the
 * sheet ids used by fab-release readiness.
 */

export type PieceDrawingSetLink = {
  piece_id: string;
  drawing_set_id: string;
  project_id?: string;
};

export type PieceDrawingSheetLink = {
  piece_id: string;
  drawing_id: string;
  project_id?: string;
};

export type ExpandableDrawing = {
  id: string;
  drawing_set_id?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  is_superseded?: boolean | null;
};

export function expandLinkedDrawingIdsForPieces(
  pieceIds: Iterable<string>,
  pieceDrawingSets: PieceDrawingSetLink[],
  pieceDrawings: PieceDrawingSheetLink[],
  drawings: ExpandableDrawing[],
): Set<string> {
  const scopeIds = new Set(pieceIds);
  const linked = new Set<string>();

  for (const relation of pieceDrawings) {
    if (scopeIds.has(relation.piece_id)) linked.add(relation.drawing_id);
  }

  const setIds = new Set<string>();
  for (const relation of pieceDrawingSets) {
    if (scopeIds.has(relation.piece_id)) setIds.add(relation.drawing_set_id);
  }
  if (setIds.size === 0) return linked;

  for (const drawing of drawings) {
    if (
      drawing.drawing_set_id &&
      setIds.has(drawing.drawing_set_id) &&
      !drawing.is_deleted &&
      !drawing.deleted_at &&
      !drawing.is_superseded
    ) {
      linked.add(drawing.id);
    }
  }
  return linked;
}

export function pieceHasDrawingLink(
  pieceId: string,
  pieceDrawingSets: PieceDrawingSetLink[],
  pieceDrawings: PieceDrawingSheetLink[],
): boolean {
  return (
    pieceDrawingSets.some((row) => row.piece_id === pieceId) ||
    pieceDrawings.some((row) => row.piece_id === pieceId)
  );
}
