/**
 * rasterCompare — the canvas half of revision compare: no React, no queries,
 * no knowledge of where the two pages came from.
 *
 * Extracted from RevisionCompareModal so the GC document viewer can compare two
 * issuances of the same sheet without growing a second copy of the compositing
 * rules. The two surfaces must never disagree about what "removed" looks like:
 * a PM who learns red-means-gone on a shop drawing will read a GC addendum the
 * same way, and a drifted copy would invert that on one of them.
 *
 * The compositing trick: "lighten" keeps the per-channel max, so black ink
 * becomes the tint and white paper stays white. Multiplying a red-tinted OLD
 * with a blue-tinted NEW leaves shared linework dark, old-only linework red and
 * new-only linework blue.
 */

export type CompareMode = "overlay" | "wipe" | "side";

export interface CompareOffset {
  x: number;
  y: number;
}

/** Content present only in the OLD revision — i.e. removed. */
export const OLD_TINT = "#FF4D4D";
/** Content present only in the NEW revision — i.e. added. */
export const NEW_TINT = "#2F81F7";
/** The wipe handle. Canvas can't read CSS custom properties, so this is literal. */
const WIPE_DIVIDER = "#F59E0B";
const PAPER = "#FFFFFF";

/** A rasterized page: anything with intrinsic pixel dimensions that drawImage accepts. */
export type Raster = HTMLCanvasElement;

/**
 * Tint dark linework toward `color` while keeping paper white.
 *
 * Returns a new canvas; `src` is not modified, because the caller re-composites
 * on every mode/offset change and would otherwise tint an already-tinted page.
 */
export function tintCanvas(src: Raster, color: string): Raster {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "lighten";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

/** Draw one raster into a canvas at its native size. Used by side-by-side. */
export function drawRaster(canvas: HTMLCanvasElement | null, raster: Raster | null): void {
  if (!canvas || !raster) return;
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.getContext("2d")?.drawImage(raster, 0, 0);
}

export interface ComposeArgs {
  canvas: HTMLCanvasElement | null;
  oldRaster: Raster | null;
  newRaster: Raster | null;
  mode: Exclude<CompareMode, "side">;
  /** Pixel nudge applied to the NEW layer, for sheets whose title block shifted. */
  offset: CompareOffset;
  /** 0–100. Left of the split shows NEW, right shows OLD. */
  wipePct: number;
}

/**
 * Composite the two rasters into one visible canvas.
 *
 * Sized to the larger of the two pages on each axis: a reissued sheet printed
 * at a different scale must not be silently cropped to the older one's extents,
 * which would hide a change rather than show it.
 */
export function composeCompare({
  canvas,
  oldRaster,
  newRaster,
  mode,
  offset,
  wipePct,
}: ComposeArgs): void {
  if (!canvas || !oldRaster || !newRaster) return;
  const W = Math.max(oldRaster.width, newRaster.width);
  const H = Math.max(oldRaster.height, newRaster.height);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  if (mode === "overlay") {
    ctx.drawImage(tintCanvas(oldRaster, OLD_TINT), 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(tintCanvas(newRaster, NEW_TINT), offset.x, offset.y);
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  // wipe: OLD underneath, NEW on top clipped to the left wipePct%.
  ctx.drawImage(oldRaster, 0, 0);
  const split = Math.round((wipePct / 100) * W);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, split, H);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, split, H);
  ctx.drawImage(newRaster, offset.x, offset.y);
  ctx.restore();
  ctx.fillStyle = WIPE_DIVIDER;
  ctx.fillRect(split - 1, 0, 2, H);
}
