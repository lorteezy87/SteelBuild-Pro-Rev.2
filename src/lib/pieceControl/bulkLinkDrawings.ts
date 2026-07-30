/**
 * Bulk link many pieces to one drawing set via link_piece_drawing_set RPC.
 */

export type LinkPieceDrawingSetFn = (
  pieceId: string,
  drawingSetId: string,
) => Promise<unknown>;

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
