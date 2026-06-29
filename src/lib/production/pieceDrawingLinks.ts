/**
 * pieceDrawingLinks.ts — pure piece-mark → drawing reference map.
 *
 * piece_production carries NO drawing reference column. The only place the
 * piece ↔ sheet relationship lives is model_elements, keyed by piece_mark, with
 * a `drawing_no` (shop/detail number, text) and a rarely-populated `drawing_id`
 * FK to drawings. This builds a normalized-mark lookup the Production Status page
 * uses to show an HONEST interim: the shop-drawing number as info, plus a real
 * sheet click-through ONLY when a drawing_id exists.
 *
 * IMPORTANT — this is deliberately conservative:
 *   • Matching is EXACT on the normalized piece mark (trim + uppercase). No fuzzy
 *     / substring matching — a wrong sheet link is worse than no link.
 *   • drawing_no does NOT generally match drawings.sheet_number (shop/detail
 *     numbers vs erection/GA numbers), so it is shown as plain info text, never a
 *     link. Only drawing_id resolves to a real DrawingViewer link.
 *
 * Pure: no React, no Supabase. Mirrors the normalizePieceMark contract used by
 * the 3D viewer's modelElementStatus engine so the two never disagree on keys.
 */

import { normalizePieceMark } from "@/services/modelElementStatus";

/** The slice of a model_elements row this map consumes. */
export interface ModelElementDrawingLike {
  piece_mark?: string | null;
  drawing_no?: string | null;
  drawing_id?: string | null;
  [key: string]: unknown;
}

/** Resolved drawing reference for one normalized piece mark. */
export interface PieceDrawingLink {
  /** Shop/detail drawing number (info text). Null when only an id is known. */
  drawingNo: string | null;
  /** drawings.id FK — present → a real DrawingViewer link is possible. */
  drawingId: string | null;
}

/** Normalize a possibly-empty drawing_no to a trimmed string or null. */
function cleanDrawingNo(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Build a map of normalized piece mark → { drawingNo, drawingId }.
 *
 * When a mark appears on multiple elements, prefer the entry that carries a
 * `drawing_id` (a real, clickable sheet link) over one that only has a
 * `drawing_no`. Among entries with a drawing_id, the first one wins; likewise
 * for drawing_no-only entries. Elements with neither a usable drawing_no nor a
 * drawing_id contribute no entry (so an absent mark stays absent).
 */
export function buildPieceDrawingMap(
  modelElements: ModelElementDrawingLike[] | null | undefined,
): Map<string, PieceDrawingLink> {
  const map = new Map<string, PieceDrawingLink>();
  if (!modelElements) return map;

  for (const el of modelElements) {
    if (!el) continue;
    const mark = normalizePieceMark(el.piece_mark);
    if (!mark) continue;

    const drawingId = el.drawing_id ? String(el.drawing_id) : null;
    const drawingNo = cleanDrawingNo(el.drawing_no);

    // Skip elements that carry no usable drawing reference at all — keeps the
    // coverage signal honest (an entry means "we know SOMETHING about this mark").
    if (!drawingId && !drawingNo) continue;

    const existing = map.get(mark);
    if (!existing) {
      map.set(mark, { drawingNo, drawingId });
      continue;
    }

    // Upgrade an existing drawing_no-only entry once a drawing_id appears.
    if (drawingId && !existing.drawingId) {
      map.set(mark, {
        drawingId,
        // Keep this element's drawing_no if it has one, else retain what we had.
        drawingNo: drawingNo ?? existing.drawingNo,
      });
      continue;
    }

    // Backfill a missing drawing_no on an existing entry when this element has one.
    if (drawingNo && !existing.drawingNo) {
      map.set(mark, { ...existing, drawingNo });
    }
  }

  return map;
}
