/**
 * Bulk link many pieces to one drawing set via link_piece_drawing_set RPC.
 *
 * The current relationship UI intentionally supports multiple sets per piece.
 * Use replacePiecesDrawingSet only for an explicit exclusive reassignment;
 * linkPiecesToDrawingSet keeps the additive multi-set behavior.
 */

export type LinkPieceDrawingSetFn = (
  pieceId: string,
  drawingSetId: string,
) => Promise<unknown>;

export type ReplacePieceDrawingSetFn = (
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

/** Assign one primary set per piece through one atomic server transaction. */
export async function replacePiecesDrawingSet(
  pieceIds: string[],
  drawingSetId: string,
  replacePieceDrawingSet: ReplacePieceDrawingSetFn,
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
      const result = await replacePieceDrawingSet(pieceId, drawingSetId);
      const record = result && typeof result === "object" && !Array.isArray(result)
        ? result as Record<string, unknown>
        : null;
      if (!record || record.piece_id !== pieceId || record.drawing_set_id !== drawingSetId
        || typeof record.unlinked_count !== "number" || !Number.isSafeInteger(record.unlinked_count)
        || record.unlinked_count < 0) {
        throw new Error("Drawing-set replacement returned incomplete evidence");
      }
      linked += 1;
      unlinked += record.unlinked_count;
    } catch (error) {
      errors.push({
        pieceId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { linked, unlinked, errors };
}
