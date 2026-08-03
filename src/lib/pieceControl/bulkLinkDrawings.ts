/**
 * Bulk link many pieces to one drawing set via link_piece_drawing_set RPC.
 *
 * Default shop workflow is exclusive assignment (one primary set). Use
 * replacePiecesDrawingSet for reassignment; linkPiecesToDrawingSet remains
 * additive for intentional multi-set links.
 */

export type LinkPieceDrawingSetFn = (
  pieceId: string,
  drawingSetId: string,
) => Promise<unknown>;

export type UnlinkPieceDrawingSetFn = (
  pieceId: string,
  drawingSetId: string,
) => Promise<unknown>;

export type PieceDrawingSetLinkRef = {
  piece_id: string;
  drawing_set_id: string;
};

export async function linkPiecesToDrawingSet(
  pieceIds: string[],
  drawingSetId: string,
  linkPieceDrawingSet: LinkPieceDrawingSetFn,
): Promise<{ linked: number; errors: Array<{ pieceId: string; message: string }> }> {
  const uniqueIds = [...new Set(pieceIds.filter(Boolean))];
  let linked = 0;
  const errors: Array<{ pieceId: string; message: string }> = [];
  for (const pieceId of uniqueIds) {
    try {
      await linkPieceDrawingSet(pieceId, drawingSetId);
      linked += 1;
    } catch (error) {
      errors.push({
        pieceId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { linked, errors };
}

/**
 * Assign drawing set exclusively: unlink every other set on the piece, then
 * link the target. Matches operator expectation when correcting a wrong set.
 */
export async function replacePiecesDrawingSet(
  pieceIds: string[],
  drawingSetId: string,
  existingLinks: PieceDrawingSetLinkRef[],
  linkPieceDrawingSet: LinkPieceDrawingSetFn,
  unlinkPieceDrawingSet: UnlinkPieceDrawingSetFn,
): Promise<{
  linked: number;
  unlinked: number;
  errors: Array<{ pieceId: string; message: string }>;
}> {
  const uniqueIds = [...new Set(pieceIds.filter(Boolean))];
  let linked = 0;
  let unlinked = 0;
  const errors: Array<{ pieceId: string; message: string }> = [];

  for (const pieceId of uniqueIds) {
    try {
      const others = existingLinks.filter(
        (row) => row.piece_id === pieceId && row.drawing_set_id !== drawingSetId,
      );
      for (const row of others) {
        await unlinkPieceDrawingSet(pieceId, row.drawing_set_id);
        unlinked += 1;
      }
      await linkPieceDrawingSet(pieceId, drawingSetId);
      linked += 1;
    } catch (error) {
      errors.push({
        pieceId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { linked, unlinked, errors };
}
