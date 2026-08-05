/** Pure piece list filters for PieceLogisticsControl. */

export function selectNonContainerPieces<T extends { is_container?: boolean | null }>(
  pieces: T[] | null | undefined,
): T[] {
  return (pieces ?? []).filter((piece) => !piece.is_container);
}
