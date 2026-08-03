/**
 * Collect piece ids created/updated by an applied import batch.
 * Import apply never writes work_package_id (Slice 1); callers assign via RPC.
 */

export type ImportRowPieceRef = {
  matched_piece_id?: string | null;
  resolution?: string | null;
  original_payload?: Record<string, unknown> | null;
  normalized_payload?: Record<string, unknown> | null;
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

function wpNumberFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload || typeof payload !== "object") return "";
  for (const key of ["wp_number", "work_package", "work_package_number", "wp"]) {
    const raw = payload[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

/**
 * Group applied piece ids by CSV wp_number hint for post-apply assign.
 */
export function collectAppliedPiecesByWpNumber(
  rows: ImportRowPieceRef[],
): Record<string, string[]> {
  const byWp: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const pieceId = row.matched_piece_id ? String(row.matched_piece_id) : "";
    const resolution = String(row.resolution ?? "");
    if (
      !pieceId ||
      (resolution !== "applied_create" && resolution !== "applied_update")
    ) {
      continue;
    }
    const wpNumber =
      wpNumberFromPayload(row.original_payload) ||
      wpNumberFromPayload(row.normalized_payload);
    if (!wpNumber) continue;
    const key = `${pieceId}::${wpNumber.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byWp[wpNumber]) byWp[wpNumber] = [];
    byWp[wpNumber].push(pieceId);
  }
  return byWp;
}
