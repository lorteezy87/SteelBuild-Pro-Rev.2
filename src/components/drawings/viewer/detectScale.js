/**
 * detectScale.js — Best-effort scale extraction from a drawing's title block.
 *
 * Strategy: scan the text layer of every PDF page via pdfjs getTextContent(),
 * concatenate all strings, and regex for the common architectural /
 * structural scale notations. Most engineer-produced drawings carry a
 * "SCALE:" line in the title block with real PDF text (not just a
 * rasterized image), so the text layer captures it.
 *
 * Returns: { scale, label, page, source } on match, or null.
 *   scale  = real_inches_per_pdf_inch — the factor to store in
 *            drawings.markup_scale.
 *   label  = human-readable notation we recognized (e.g. "1/4\" = 1'-0\"").
 *   page   = 1-based page number where we found the match.
 *   source = the literal substring that matched, so the user can verify.
 *
 * NULL result means:
 *   - the PDF has no text layer (scan-only), OR
 *   - no recognizable scale string was found, OR
 *   - the drawing explicitly says NTS / NOT TO SCALE
 *
 * Limitations:
 *   - Only US customary (feet-inch) architectural scales. Metric (1:100,
 *     1:50) matched in a lighter path at the bottom — flagged as lower
 *     confidence and prefixed with "1:" label.
 *   - Doesn't handle title-block images (raster scales). No OCR here;
 *     that's a Phase 2 feature if needed.
 *   - If the drawing has multiple scales per sheet (plan at 1/4, detail
 *     at 1/2), we pick the FIRST match found — usually the dominant one.
 *     Users can still Calibrate manually to override.
 */

// Ordered largest-to-smallest so the first regex match captures the
// correct architectural scale. Each entry maps a printed notation to the
// real-inches-per-pdf-inch factor.
const ARCH_SCALES = [
  { re: /\b3(?:\s*\/\s*)?"\s*=\s*1\s*'\s*-?\s*0\s*"/i,          scale: 4,   label: `3" = 1'-0"` },
  { re: /\b1\s*1\s*\/\s*2\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,       scale: 8,   label: `1 1/2" = 1'-0"` },
  { re: /\b1\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,                    scale: 12,  label: `1" = 1'-0"` },
  { re: /\b3\s*\/\s*4\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,           scale: 16,  label: `3/4" = 1'-0"` },
  { re: /\b1\s*\/\s*2\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,           scale: 24,  label: `1/2" = 1'-0"` },
  { re: /\b3\s*\/\s*8\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,           scale: 32,  label: `3/8" = 1'-0"` },
  { re: /\b1\s*\/\s*4\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,           scale: 48,  label: `1/4" = 1'-0"` },
  { re: /\b3\s*\/\s*16\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,          scale: 64,  label: `3/16" = 1'-0"` },
  { re: /\b1\s*\/\s*8\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,           scale: 96,  label: `1/8" = 1'-0"` },
  { re: /\b3\s*\/\s*32\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,          scale: 128, label: `3/32" = 1'-0"` },
  { re: /\b1\s*\/\s*16\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,          scale: 192, label: `1/16" = 1'-0"` },
  { re: /\b1\s*\/\s*32\s*"\s*=\s*1\s*'\s*-?\s*0\s*"/i,          scale: 384, label: `1/32" = 1'-0"` },
];

// Metric fallback — any "1:NNN" with NNN between 5 and 5000 counts as a
// scale claim. Much lower confidence because it could be referencing
// anything (revision ratios, key maps, etc.).
const METRIC_RE = /\bSCALE\b[^a-z0-9]{0,10}1\s*:\s*(\d{1,5})\b/i;

// NTS / NOT TO SCALE — if we see this we return null explicitly rather
// than letting a stray match through. Also don't want to trigger on
// legitimate uses of the word "not" elsewhere.
const NTS_RE = /\b(?:not\s+to\s+scale|\bNTS\b)\b/i;

/**
 * Scan all pages of the PDF for a scale notation.
 *
 * @param {pdfjsLib.PDFDocumentProxy} pdfDoc
 * @param {number} maxPages   Cap pages scanned (default all) — title blocks
 *                            are usually on page 1, so we almost never need
 *                            to go deep.
 * @returns {Promise<{ scale, label, page, source, confidence } | null>}
 */
export async function detectScaleFromPdf(pdfDoc, maxPages = undefined) {
  if (!pdfDoc || typeof pdfDoc.getPage !== "function") return null;
  const totalPages = pdfDoc.numPages || 0;
  const pagesToScan = Math.min(totalPages, maxPages ?? totalPages);

  for (let p = 1; p <= pagesToScan; p++) {
    let text = "";
    try {
      const page = await pdfDoc.getPage(p);
      const content = await page.getTextContent();
      text = (content.items || [])
        .map((it) => it.str || "")
        .join(" ")
        .replace(/\s+/g, " ");
    } catch {
      continue; // page has no extractable text (rasterized)
    }
    if (!text) continue;

    // Explicit NTS = bail without a match. Still check subsequent pages
    // in case THIS page is NTS but others aren't.
    const ntsHit = NTS_RE.test(text);
    if (ntsHit && ARCH_SCALES.every((s) => !s.re.test(text))) {
      continue;
    }

    for (const s of ARCH_SCALES) {
      const m = text.match(s.re);
      if (m) {
        return {
          scale:      s.scale,
          label:      s.label,
          page:       p,
          source:     m[0],
          confidence: "high",
        };
      }
    }

    const metric = text.match(METRIC_RE);
    if (metric) {
      // Metric scales: "1:100" means 1 unit drawn = 100 real units.
      // If the drawing units are inches → markup_scale = 100. If the
      // drawing was produced in mm → that's still a ratio but 1 "page
      // inch" maps to 100 inches, which is often wrong for mm drawings.
      // Flag as low confidence; user can override via Calibrate.
      const ratio = parseInt(metric[1], 10);
      if (ratio >= 5 && ratio <= 5000) {
        return {
          scale:      ratio,
          label:      `1:${ratio}`,
          page:       p,
          source:     metric[0],
          confidence: "low",
        };
      }
    }
  }

  return null;
}
