/**
 * Post-import drawing links from CSV sheet_number hints.
 * Exact sheet match only; fail closed on ambiguity. Never writes during apply.
 */

export type ImportDrawingHintRow = {
  matched_piece_id?: string | null;
  resolution?: string | null;
  original_payload?: Record<string, unknown> | null;
  normalized_payload?: Record<string, unknown> | null;
};

export type DrawingSheetRef = {
  id: string;
  sheet_number?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  is_superseded?: boolean | null;
};

export type PieceDrawingLinkPlan = {
  links: Array<{ pieceId: string; drawingId: string; sheetNumber: string }>;
  skipped: Array<{ pieceId?: string; reason: string; detail?: string }>;
};

function normalizeSheetKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function sheetHintFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload || typeof payload !== "object") return "";
  for (const key of ["sheet_number", "drawing_sheet", "sheet", "drawing_no"]) {
    const raw = payload[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

export function collectAppliedPieceSheetHints(
  rows: ImportDrawingHintRow[],
): Array<{ pieceId: string; sheetNumber: string }> {
  const out: Array<{ pieceId: string; sheetNumber: string }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const pieceId = row.matched_piece_id ? String(row.matched_piece_id) : "";
    const resolution = String(row.resolution ?? "");
    if (!pieceId || (resolution !== "applied_create" && resolution !== "applied_update")) {
      continue;
    }
    const sheetNumber =
      sheetHintFromPayload(row.original_payload) ||
      sheetHintFromPayload(row.normalized_payload);
    if (!sheetNumber) continue;
    const key = `${pieceId}::${normalizeSheetKey(sheetNumber)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pieceId, sheetNumber });
  }
  return out;
}

export function planImportDrawingLinks(
  hints: Array<{ pieceId: string; sheetNumber: string }>,
  drawings: DrawingSheetRef[],
): PieceDrawingLinkPlan {
  const active = drawings.filter(
    (drawing) => !drawing.is_deleted && !drawing.deleted_at && !drawing.is_superseded,
  );
  const bySheet = new Map<string, DrawingSheetRef[]>();
  for (const drawing of active) {
    const key = normalizeSheetKey(drawing.sheet_number);
    if (!key) continue;
    if (!bySheet.has(key)) bySheet.set(key, []);
    bySheet.get(key)!.push(drawing);
  }

  const links: PieceDrawingLinkPlan["links"] = [];
  const skipped: PieceDrawingLinkPlan["skipped"] = [];
  const linkedPair = new Set<string>();

  for (const hint of hints) {
    const key = normalizeSheetKey(hint.sheetNumber);
    const matches = bySheet.get(key) ?? [];
    if (matches.length === 0) {
      skipped.push({
        pieceId: hint.pieceId,
        reason: "no_match",
        detail: hint.sheetNumber,
      });
      continue;
    }
    if (matches.length > 1) {
      skipped.push({
        pieceId: hint.pieceId,
        reason: "ambiguous",
        detail: hint.sheetNumber,
      });
      continue;
    }
    const drawing = matches[0];
    const pairKey = `${hint.pieceId}::${drawing.id}`;
    if (linkedPair.has(pairKey)) continue;
    linkedPair.add(pairKey);
    links.push({
      pieceId: hint.pieceId,
      drawingId: drawing.id,
      sheetNumber: hint.sheetNumber,
    });
  }

  return { links, skipped };
}

export type LinkPieceDrawingFn = (
  pieceId: string,
  drawingId: string,
) => Promise<unknown>;

export async function applyImportDrawingLinks(
  plan: PieceDrawingLinkPlan,
  linkPieceDrawing: LinkPieceDrawingFn,
): Promise<{ linked: number; errors: Array<{ pieceId: string; message: string }> }> {
  let linked = 0;
  const errors: Array<{ pieceId: string; message: string }> = [];
  for (const row of plan.links) {
    try {
      await linkPieceDrawing(row.pieceId, row.drawingId);
      linked += 1;
    } catch (error) {
      errors.push({
        pieceId: row.pieceId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { linked, errors };
}
