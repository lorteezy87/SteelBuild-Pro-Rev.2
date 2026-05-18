/**
 * pdfTitleblockText.js — extract the text inside a normalised rectangle
 * from a pdfjs page.
 *
 * Used by pdfSheetExtractor when a drawing set has a titleblock template
 * saved (slice 1 schema, slice 2 marker UI). The rectangle is in
 * normalised coords (0..1, top-left origin) covering the page; we walk
 * the page's text content and pick up every item whose centre falls
 * inside the rectangle, then concatenate in reading order.
 *
 * Why centre-of-item rather than full bounding-box overlap:
 *   The OCR rect a user draws around a sheet number is typically tight,
 *   and a glyph that pokes a millimetre outside the rect would otherwise
 *   be dropped. Using the centre point keeps a "near enough" character
 *   in the extraction without leaking adjacent text into the result.
 *
 * IMPORTANT — coordinate spaces:
 *   The user draws rects on a canvas rendered with the page's intrinsic
 *   rotation applied (via page.getViewport({ scale })). The normalised
 *   rect (0..1) is therefore in the ROTATED frame. This module must use
 *   the same rotation when de-normalising the rect AND when mapping text
 *   item positions. The old code used rotation=0 which broke on rotated
 *   pages (structural drawings commonly have page.rotate = 90).
 *
 * Return value:
 *   Concatenated text in reading order (top-down, then left-right).
 *   Trimmed of leading/trailing whitespace. Empty string when no text
 *   item falls inside the rect (likely a scanned/image-only page —
 *   caller should fall through to the LLM extraction path).
 */

/**
 * Extract text from a normalised rect on a pdfjs page.
 *
 * @param {import("pdfjs-dist").PDFPageProxy} page
 * @param {{x:number,y:number,width:number,height:number}} rect
 *   Normalised in [0, 1] with origin at the page top-left (as rendered
 *   with the page's intrinsic rotation).
 * @returns {Promise<string>}
 */
export async function extractTextFromRect(page, rect) {
  if (!page || !rect) return "";
  if (
    typeof rect.x !== "number" || typeof rect.y !== "number" ||
    typeof rect.width !== "number" || typeof rect.height !== "number"
  ) {
    return "";
  }

  // Use the viewport WITH the page's intrinsic rotation so the coordinate
  // space matches the canvas the user drew the rect on. The old code used
  // rotation: 0, which caused OCR to look at the wrong area on rotated
  // pages — structural drawings commonly have page.rotate = 90 (portrait
  // page displayed as landscape).
  const viewport = page.getViewport({ scale: 1 });
  const pageW = viewport.width;
  const pageH = viewport.height;

  const x0 = rect.x * pageW;
  const x1 = (rect.x + rect.width) * pageW;
  const y0 = rect.y * pageH;        // top of rect in top-down coords
  const y1 = (rect.y + rect.height) * pageH;

  const content = await page.getTextContent();
  if (!content?.items?.length) return "";

  // pdfjs items have `transform = [a, b, c, d, e, f]` in the PDF's raw
  // coordinate system (bottom-left origin, pre-rotation). We use the
  // viewport's convertToViewportPoint() to map them into the same rotated,
  // top-left-origin space that the normalised rect lives in. This handles
  // all four rotation cases (0, 90, 180, 270) automatically.
  const matches = [];
  for (const item of content.items) {
    if (!item?.str) continue;
    const str = String(item.str);
    if (!str.trim()) continue;
    const tx = item.transform;
    if (!tx) continue;

    // Text origin in PDF coordinate space (bottom-left).
    const xPdf = tx[4];
    const yPdf = tx[5];

    // Convert to viewport space (top-left origin, rotation applied).
    // convertToViewportPoint returns [viewX, viewY].
    const [vx, vy] = viewport.convertToViewportPoint(xPdf, yPdf);

    // Approximate item dimensions in viewport space. For rotation=0 and
    // rotation=180, width stays on the x-axis. For rotation=90/270,
    // width maps to the y-axis. We convert the far corner of the item
    // and compute the effective width/height from the two viewport points.
    const rawW = Number.isFinite(item.width) ? item.width : (str.length * 5);
    const rawH = Math.abs(tx[3]) || 10;
    const [vx2, vy2] = viewport.convertToViewportPoint(xPdf + rawW, yPdf + rawH);
    const w = Math.abs(vx2 - vx);
    const h = Math.abs(vy2 - vy);

    // Use the centre of the item for the inside-rect test; tight user
    // rectangles otherwise clip glyphs whose bbox barely touches the edge.
    const cx = Math.min(vx, vx2) + w / 2;
    const cy = Math.min(vy, vy2) + h / 2;

    if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
      matches.push({ x: Math.min(vx, vx2), y: Math.min(vy, vy2), str: str.trim() });
    }
  }

  if (matches.length === 0) return "";

  // Sort top-down then left-right. y-tolerance of 4 viewport units groups
  // items visually on the same line.
  matches.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
    return a.x - b.x;
  });

  return matches.map((m) => m.str).join(" ").replace(/\s+/g, " ").trim();
}
