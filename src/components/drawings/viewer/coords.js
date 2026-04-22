/**
 * Coordinate helpers for the drawings viewer.
 *
 * We store markup in PDF user units (matching the callout convention from
 * migration 021). Rendering + hit-testing goes through a pdfjs `viewport`
 * object which handles scale + rotation in one place.
 *
 * All coords are origin-top-left in PDF space, which is what pdfjs returns
 * from `viewport.convertToPdfPoint()`.
 */

/**
 * Convert a PDF-space point to canvas-pixel coords.
 * Returns [x, y] in canvas pixels.
 */
export function pdfToCanvas(viewport, x, y) {
  if (!viewport) return [0, 0];
  return viewport.convertToViewportPoint(x, y);
}

/**
 * Convert a canvas-pixel point back to PDF-space coords.
 * Canvas pixels come from e.clientX - canvasRect.left (etc).
 */
export function canvasToPdf(viewport, cx, cy) {
  if (!viewport) return [0, 0];
  return viewport.convertToPdfPoint(cx, cy);
}

/**
 * Given a MouseEvent on the canvas/overlay, return the PDF-space coords.
 * The overlay SVG is the same size as the canvas so clientX/Y relative to
 * the overlay's bounding rect is equivalent to canvas pixels.
 */
export function eventToPdfPoint(e, containerEl, viewport) {
  if (!containerEl || !viewport) return [0, 0];
  const rect = containerEl.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  return canvasToPdf(viewport, cx, cy);
}

/**
 * Simplify a stroke by dropping points within `tol` PDF units of the
 * previous point. Keeps the first + last point.
 *
 * Pen strokes can accumulate hundreds of points on fast diagonal drags;
 * persisting all of them bloats the JSONB and slows SVG render. At 72 DPI,
 * a tolerance of 0.5pt is sub-pixel at 100% zoom — imperceptible.
 */
export function simplifyStroke(points, tol = 0.5) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  const out = [points[0]];
  const tolSq = tol * tol;
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    const cur = points[i];
    const dx = cur.x - last.x;
    const dy = cur.y - last.y;
    if (dx * dx + dy * dy >= tolSq) out.push(cur);
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Build an SVG `points` attribute string from an array of PDF-space points,
 * projected through the viewport.
 */
export function pointsToSvgAttr(points, viewport) {
  if (!points || !viewport) return "";
  return points
    .map((p) => {
      const [x, y] = pdfToCanvas(viewport, p.x, p.y);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Convert a PDF-space rectangle {x, y, w, h} into canvas-space {left, top,
 * width, height} suitable for CSS. Handles rotation via the viewport.
 */
export function pdfRectToCanvas(viewport, rect) {
  if (!viewport || !rect) return { left: 0, top: 0, width: 0, height: 0 };
  const tl = pdfToCanvas(viewport, rect.x, rect.y);
  const br = pdfToCanvas(viewport, rect.x + rect.w, rect.y + rect.h);
  const left = Math.min(tl[0], br[0]);
  const top = Math.min(tl[1], br[1]);
  const width = Math.abs(br[0] - tl[0]);
  const height = Math.abs(br[1] - tl[1]);
  return { left, top, width, height };
}

/**
 * Generate a short random id for new markup entries. Not a UUID — we just
 * need uniqueness within one drawing's markup array so React keys are
 * stable.
 */
export function newMarkupId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
