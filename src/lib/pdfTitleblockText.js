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
 *   Normalised in [0, 1] with origin at the page top-left.
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

  // Use the unrotated viewport at scale=1 as the canonical page coordinate
  // system. Width/height here are the page's native pdf-units size; we
  // multiply normalised rect coords against those to land in the same
  // space as the items we'll inspect.
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  const pageW = viewport.width;
  const pageH = viewport.height;

  const x0 = rect.x * pageW;
  const x1 = (rect.x + rect.width) * pageW;
  const y0 = rect.y * pageH;        // top of rect in top-down coords
  const y1 = (rect.y + rect.height) * pageH;

  const content = await page.getTextContent();
  if (!content?.items?.length) return "";

  // pdfjs items have `transform = [a, b, c, d, e, f]` in TEXT space, where
  // (e, f) is the text origin in PDF coords (BOTTOM-LEFT origin). The font
  // height comes from the absolute value of `d`. Width is supplied directly.
  const matches = [];
  for (const item of content.items) {
    if (!item?.str) continue;
    const str = String(item.str);
    if (!str.trim()) continue;
    const tx = item.transform;
    if (!tx) continue;
    const xPdf = tx[4];
    const yPdf = tx[5];
    const w = Number.isFinite(item.width) ? item.width : (str.length * 5);
    const h = Math.abs(tx[3]) || 10;

    // Convert from pdf bottom-left to viewport top-left.
    const xTop = xPdf;
    const yTop = pageH - yPdf;

    // Use the centre of the item for the inside-rect test; tight user
    // rectangles otherwise clip glyphs whose bbox barely touches the edge.
    const cx = xTop + w / 2;
    const cy = yTop - h / 2;

    if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
      matches.push({ x: xTop, y: yTop, str: str.trim() });
    }
  }

  if (matches.length === 0) return "";

  // Sort top-down then left-right. y-tolerance of 4 pdf units groups items
  // visually on the same line — same constant the columnar extractor uses.
  matches.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
    return a.x - b.x;
  });

  return matches.map((m) => m.str).join(" ").replace(/\s+/g, " ").trim();
}
