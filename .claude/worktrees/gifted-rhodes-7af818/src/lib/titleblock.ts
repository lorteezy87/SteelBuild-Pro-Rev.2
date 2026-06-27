import type { Json } from "@/types/supabase";

/**
 * Normalised rectangle marking a region inside a drawing-set's titleblock.
 *
 * Coordinates are in [0, 1] where (0, 0) is the page top-left and (1, 1)
 * is the page bottom-right. The rectangle applies to every sheet in the
 * set — steel detailers' titleblocks are uniform across the sheets of a
 * single set by convention.
 *
 * Schema lives in migration 057 with CHECK constraints that enforce the
 * shape; this type mirrors that shape on the client.
 */
export type TitleblockRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Type guard + parser. The Supabase types report titleblock_*_rect as
 * `Json | null` because Postgres JSONB has no narrower static shape;
 * this helper safely narrows it to a `TitleblockRect` (or `null` for
 * any malformed value, including the legitimate "not set" case).
 *
 * Use at every read site so a hand-edited row, a future schema change,
 * or a wire-format glitch can't crash the marker UI or the ingest
 * pipeline. Callers MUST tolerate `null` (= no template).
 */
export function parseTitleblockRect(value: Json | null | undefined): TitleblockRect | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const x = v.x;
  const y = v.y;
  const width = v.width;
  const height = v.height;
  if (
    typeof x !== "number" || typeof y !== "number" ||
    typeof width !== "number" || typeof height !== "number"
  ) {
    return null;
  }
  if (
    !Number.isFinite(x) || !Number.isFinite(y) ||
    !Number.isFinite(width) || !Number.isFinite(height)
  ) {
    return null;
  }
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return null;
  if (x + width > 1.0001 || y + height > 1.0001) return null;
  return { x, y, width, height };
}

/**
 * True when a drawing set has BOTH rectangles defined — the only state
 * the ingest pipeline considers "templated." Either-rect-only is treated
 * as not-yet-set so half-saved templates don't silently degrade to
 * mixed extraction sources.
 */
export function hasTitleblockTemplate(set: {
  titleblock_title_rect?: Json | null;
  titleblock_number_rect?: Json | null;
}): boolean {
  return (
    parseTitleblockRect(set.titleblock_title_rect) !== null &&
    parseTitleblockRect(set.titleblock_number_rect) !== null
  );
}
