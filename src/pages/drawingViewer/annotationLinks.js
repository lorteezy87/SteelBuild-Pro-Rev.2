// Pure resolver for PDF-link annotations extracted from DrawingViewer.jsx.
//
// SECURITY-SENSITIVE: the external-URL branch validates the annotation's URL
// scheme to prevent `javascript:` (and other non-http) XSS via poisoned PDF
// link annotations. The URL/host validation below is byte-identical to the
// inline logic that previously lived in handleAnnotationClick — do NOT loosen,
// reorder, or "simplify" any check.
//
// The function is side-effect free: given an annotation (plus the loaded
// pdfDoc, totalPages, and project drawings list), it returns the resolved
// navigation target as a descriptor. The caller (handleAnnotationClick) is
// responsible for actually performing the navigation / window.open.
//
// Returns one of:
//   { type: "page", page }        — internal PDF destination resolved to a page
//   { type: "url", url }          — validated external http(s) URL (safe to open)
//   { type: "sheet", drawingId }  — cross-sheet reference matched to a drawing
//   { type: "none" }              — nothing actionable / rejected (e.g. unsafe URL)
//
// Decision order matches the original inline handler exactly:
//   1. Internal PDF destination (annot.dest) — named or explicit array.
//   2. External URL (annot.url) — scheme-validated.
//   3. Cross-sheet reference (annot.title / annot.unsafeUrl) — regex match.
export async function parseAnnotationLink(annot, { pdfDoc, totalPages, drawings }) {
  // 1. Internal PDF destination (page ref within the same document)
  if (annot.dest) {
    try {
      let pageNum = null;
      if (typeof annot.dest === "string") {
        // Named destination — resolve via the PDF document
        const dest = await pdfDoc.getDestination(annot.dest);
        if (dest) {
          const pageRef = dest[0];
          pageNum = await pdfDoc.getPageIndex(pageRef) + 1;
        }
      } else if (Array.isArray(annot.dest)) {
        // Explicit destination array [pageRef, ...]
        const pageRef = annot.dest[0];
        pageNum = await pdfDoc.getPageIndex(pageRef) + 1;
      }
      if (pageNum && pageNum >= 1 && pageNum <= totalPages) {
        return { type: "page", page: pageNum };
      }
    } catch { /* fall through to cross-sheet lookup */ }
  }

  // 2. External URL — C6 fix: validate scheme to prevent javascript: XSS
  if (annot.url) {
    try {
      const parsed = new URL(annot.url, window.location.origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return { type: "url", url: annot.url };
      }
    } catch { /* malformed URL — ignore */ }
    return { type: "none" };
  }

  // 3. Cross-sheet reference — try to match against sheet numbers in this project
  //    Common patterns: "S-201", "S201", "A/S201", "DETAIL 3/S-201"
  const refText = annot.title || annot.unsafeUrl || "";
  if (refText) {
    const match = refText.match(/([A-Z]{1,2}[-\s]?\d{3,4})/i);
    if (match) {
      const sheetRef = match[1].toUpperCase().replace(/\s+/g, "");
      const target = drawings.find(d => {
        const sn = (d.sheet_number || "").toUpperCase().replace(/[-\s]/g, "");
        return sn === sheetRef || sn === sheetRef.replace("-", "");
      });
      if (target) {
        return { type: "sheet", drawingId: target.id };
      }
    }
  }

  return { type: "none" };
}
