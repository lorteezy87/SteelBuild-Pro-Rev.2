// ── drawingSetUploadHelpers — pure helpers for DrawingSetUploadModal ─────────
//
// Extracted from DrawingSetUploadModal.jsx so the byte formatter, the
// oversize-short-circuit extract router, and the child drawing-row builder are
// unit-testable in isolation. The modal keeps all state, wizard steps, and I/O
// orchestration (parent find-or-create, bulk insert + per-row fallback, audit
// logging, cache invalidation).
//
// Note: formatBytes is deliberately NOT shared with RevisionUploadModal — the
// two modals round byte sizes differently (this one shows a sub-KB "B" tier and
// 1-decimal KB; the revision modal rounds KB to whole numbers and has no "B"
// tier). See the drawingUploadUtils.js header for why they stay separate.

import { extractSheetsFromPdf, EMPTY_SET_META, parseFilename, validatePdfPage } from "@/lib/pdfSheetExtractor";
import { normalizeRevisionNumber } from "@/lib/drawingUploadUtils";
import { sheetReviewFlags } from "@/components/drawings/intakeReview";

// AI-extraction size ceiling (MB). Above this we skip the LLM round-trip and
// fall back to filename parsing. Shared by the file-queue UI and validateAndExtract.
export const MAX_PDF_SIZE_MB = 32;

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Router: short-circuit on oversize files (skip the LLM round-trip);
// otherwise delegate to the shared extractor. All the heavy lifting
// (columnar pdfjs text extraction, Anthropic tool-use schema,
// post-processing fixup, de-dup) lives in src/lib/pdfSheetExtractor.js
// so this modal and RevisionUploadModal share a single code path.
export async function validateAndExtract(file, options = {}) {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_PDF_SIZE_MB) {
    console.warn(`PDF too large (${sizeMB.toFixed(1)}MB). Using filename fallback.`);
    const parsed = parseFilename(file.name);
    return {
      setMeta: { ...EMPTY_SET_META },
      sheets: [{
        sheetNumber: parsed.sheetNumber,
        sheetTitle:  parsed.sheetNumber ? "" : file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "),
        discipline:  "Structural",
        sheetType:   "General",
        revision:    parsed.revision || "0",
        scale:       "",
        date:        "",
        _note:       "File too large for AI extraction." + (parsed.sheetNumber ? ` Sheet # "${parsed.sheetNumber}" extracted from filename.` : " Please fill in sheet details manually."),
      }],
      scanned:  false,
      tooLarge: true,
    };
  }
  return extractSheetsFromPdf(file, options);
}

/**
 * Build one child `drawings` row payload from a reviewed sheet + the upload
 * context. Pure — the modal maps it over the selected sheets. The
 * ai_extraction_status gate mirrors intakeReview.sheetReviewFlags so the
 * persisted status never disagrees with the review-screen badge; pdf_page
 * falls back to 1 (with a warning) when the extractor didn't surface a valid page.
 */
export function buildDrawingRecord({ sheet, fileResults, meta, activeProject, resolvedSetName, parentSetId, batchId, now }) {
  const sourceResult = fileResults.find(r => r.fileName === sheet.sourceFile);
  // Same signal the review screen shows (intakeReview.sheetReviewFlags) so
  // the persisted ai_extraction_status never disagrees with the badge — now
  // also catches an empty sheet number, not just bad-source rows.
  const needsReview = sheetReviewFlags(sheet, sourceResult).needsReview;
  // Validate pdf_page — must be a positive integer. Anything else
  // falls back to 1 with a warning so the user can hand-fix via
  // SheetFormModal. The extractor's assignPdfPages() should have
  // populated this correctly; if we're falling back here, something
  // upstream regressed.
  const validatedPage = validatePdfPage(sheet.pdfPage);
  if (validatedPage === null) {
    console.warn(
      `[DrawingSetUploadModal] Sheet "${sheet.sheetNumber || "?"}" has invalid pdfPage=${JSON.stringify(sheet.pdfPage)} — defaulting to 1.`,
    );
  }
  return {
    sheet_number:     sheet.sheetNumber || "",
    title:            sheet.sheetTitle  || "",
    project_id:       activeProject?.id,
    project_name:     activeProject?.name,
    drawing_set_id:   parentSetId,
    drawing_set_name: resolvedSetName, // kept for back-compat reads
    discipline:       sheet.discipline || meta.discipline,
    revision_number:  normalizeRevisionNumber(sheet.revision ?? meta.revision),
    stage:            meta.defaultStage || "Not Started",
    file_url:         sheet.sourceFileUrl,
    pdf_page:         validatedPage ?? 1,
    callouts:         Array.isArray(sheet.callouts) ? sheet.callouts : [],
    upload_batch_id:      batchId,
    upload_status:        "Uploaded",
    ai_extraction_status: needsReview ? "NeedsReview" : "Processed",
    ai_extraction_error:  sourceResult?.error || null,
    extracted_text:       sheet.extractedText || null,
    hyperlinks:           Array.isArray(sheet.hyperlinks) ? sheet.hyperlinks : [],
    last_extracted_at:    now,
    notes: [
      meta.notes,
      sheet.scale ? `Scale: ${sheet.scale}` : "",
      sheet._note || "",
    ].filter(Boolean).join(" · "),
  };
}
