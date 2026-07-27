/**
 * Bulk link many pieces to one drawing via existing link_piece_drawing RPC.
 */

export type LinkPieceDrawingFn = (
  pieceId: string,
  drawingId: string,
) => Promise<unknown>;

export async function linkPiecesToDrawing(
  pieceIds: string[],
  drawingId: string,
  linkPieceDrawing: LinkPieceDrawingFn,
): Promise<{ linked: number; errors: Array<{ pieceId: string; message: string }> }> {
  const uniqueIds = [...new Set(pieceIds.filter(Boolean))];
  let linked = 0;
  const errors: Array<{ pieceId: string; message: string }> = [];
  for (const pieceId of uniqueIds) {
    try {
      await linkPieceDrawing(pieceId, drawingId);
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
