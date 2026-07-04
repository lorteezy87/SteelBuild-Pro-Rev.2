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

// Build the processing-step list for the upload wizard's StepProcessing UI.
// Pure — the modal calls this with the current active step + the set of
// already-done step ids (and any warning flags) and renders the result.
// NOTE: `activeId` is accepted for call-site parity but the rendered active
// state is derived from currentStepId in StepProcessing, not from here.
export function makeProgressSteps(activeId, doneIds = [], warnings = {}) {
  return [
    { id: "upload",  label: "Uploading files to storage...",        done: doneIds.includes("upload")  },
    { id: "encode",  label: "Preparing PDF for AI reading...",       done: doneIds.includes("encode")  },
    { id: "extract", label: "✦ Claude is reading your drawing set...", detail: "Scanning title blocks and sheet index", done: doneIds.includes("extract"), warning: warnings["extract"] },
    { id: "parse",   label: "Building sheet list...",                done: doneIds.includes("parse")   },
    { id: "done",    label: null,                                    done: doneIds.includes("done")    },
  ];
}

/**
 * Merge AI-detected set metadata into the current meta state. Pure — the modal
 * passes the previous meta, the aggregated AI set metadata, and the default
 * issue date, and applies the returned `merged` via setMeta and `aiFilled`
 * via setAiFilledFields.
 *
 * Only fills fields the user left blank; never overwrites user input. Today's
 * default issue date and a "0"/empty revision are both treated as "blank" so
 * the AI value can win.
 *
 * @returns {{ merged: object, aiFilled: Record<string, boolean> }}
 */
export function mergeAiSetMetadata(prev, aggregateSetMeta = {}, defaultIssueDate) {
  const merged = { ...prev };
  const aiFilled = {};
  const tryFill = (prevKey, aiKey) => {
    const current = String(prev[prevKey] ?? "").trim();
    const aiVal = String(aggregateSetMeta[aiKey] ?? "").trim();
    // Treat today's default issueDate as "blank" so AI can overwrite it
    const isDefault = prevKey === "issueDate" && current === defaultIssueDate;
    // Treat "0" revision as "blank" so AI can overwrite it
    const isDefaultRev = prevKey === "revision" && (current === "0" || current === "");
    if (aiVal && (!current || isDefault || isDefaultRev)) {
      merged[prevKey] = aiVal;
      aiFilled[prevKey] = true;
    }
  };
  tryFill("setName",    "setName");
  tryFill("setNumber",  "setNumber");
  tryFill("setNumber",  "drawingSetNumber");
  tryFill("revision",   "revision");
  tryFill("issueDate",  "issueDate");
  tryFill("issuedBy",   "issuedBy");
  tryFill("discipline", "discipline");
  return { merged, aiFilled };
}

/**
 * Detect the multi-sheet-same-page regression: a source PDF with >1 page whose
 * every extracted sheet ended up with pdf_page=1 (the original bug). Pure — it
 * groups the built records by source file and returns the offending groups so
 * the caller can log a loud per-file warning. Returns an array of
 * { sourceFile, sheetCount, pageCount } — one entry per regressing PDF.
 *
 * @param {Array} selectedSheets the reviewed sheets in insert order
 * @param {Array} records        the built drawing records, index-aligned with selectedSheets
 * @param {Array} fileResults    the per-file upload results (source of pageCount)
 */
export function detectMultiSheetSamePageRegression(selectedSheets, records, fileResults = []) {
  const recordsBySource = new Map();
  selectedSheets.forEach((sheet, i) => {
    const key = sheet.sourceFile || "?";
    if (!recordsBySource.has(key)) recordsBySource.set(key, []);
    recordsBySource.get(key).push(records[i]);
  });
  const regressions = [];
  for (const [sourceFile, group] of recordsBySource) {
    if (group.length <= 1) continue;
    const fileResult = fileResults.find(r => r.fileName === sourceFile);
    const pageCount = fileResult?.pageCount;
    if (Number.isFinite(pageCount) && pageCount > 1 && group.every(r => r.pdf_page === 1)) {
      regressions.push({ sourceFile, sheetCount: group.length, pageCount });
    }
  }
  return regressions;
}
