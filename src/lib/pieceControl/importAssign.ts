/**
 * Collect piece ids created/updated by an applied import batch.
 * Import apply never writes work_package_id (Slice 1); callers assign via RPC.
 */

export type ImportRowPieceRef = {
  matched_piece_id?: string | null;
  resolution?: string | null;
};

export function collectAppliedPieceIds(rows: ImportRowPieceRef[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const pieceId = row.matched_piece_id ? String(row.matched_piece_id) : "";
    if (!pieceId || seen.has(pieceId)) continue;
    const resolution = String(row.resolution ?? "");
    if (resolution !== "applied_create" && resolution !== "applied_update") {
      continue;
    }
    seen.add(pieceId);
    ids.push(pieceId);
  }
  return ids;
}
