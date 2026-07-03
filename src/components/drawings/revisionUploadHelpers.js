// ── revisionUploadHelpers — pure helpers for RevisionUploadModal ─────────────
//
// Extracted from RevisionUploadModal.jsx so the byte formatter, the change-style
// map, the throwing PDF-extract wrapper, the virtual-set derivation, and the
// revision-history snapshot builder are unit-testable in isolation. The modal
// keeps all state, effects, and I/O orchestration.
//
// Note: formatBytes is deliberately NOT shared with DrawingSetUploadModal — the
// two modals round byte sizes differently (this one rounds KB to whole numbers,
// no sub-KB "B" tier; the set modal shows a "B" tier and 1-decimal KB). See the
// drawingUploadUtils.js header for why they intentionally stay separate.

import { extractSheetsFromPdf } from "@/lib/pdfSheetExtractor";

export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CHANGE_STYLE = {
  revised: { color: "var(--status-warning-bright)", label: "✎ REVISED", bg: "rgba(255,176,32,0.06)" },
  added:   { color: "var(--status-success-bright)", label: "+ ADDED",   bg: "rgba(0,214,143,0.06)" },
  removed: { color: "var(--status-error-bright)", label: "— REMOVED", bg: "rgba(255,61,61,0.05)" },
  same:    { color: "var(--text-muted)", label: "≡ SAME", bg: "transparent" },
};

// Extract every sheet from a revision PDF using the shared extractor
// (columnar pdfjs + Anthropic tool-use + post-processing fixup).
// Returns a flat `sheets` array so the comparison step can match on
// sheetNumber; swallow `extractFailed` cases so the caller can show an
// empty diff rather than crashing.
//
// `options.titleblockTemplate` (optional) lets the caller pass the
// drawing-set's saved {titleRect, numberRect} so the extractor does the
// per-page OCR override before falling back to the LLM. Coordinates are
// parsed inside the extractor — pass the raw JSON columns straight from
// the drawing_sets row.
export async function extractRevisionSheets(file, options = {}) {
  const result = await extractSheetsFromPdf(file, options);
  if (result?.extractFailed) {
    // Surface the failure; let the caller decide how to react.
    const err = new Error(result.error || "AI extraction failed");
    err.extractFailed = true;
    throw err;
  }
  return Array.isArray(result?.sheets) ? result.sheets : [];
}

/**
 * Build virtual drawing-set objects for any drawing_set_name present on
 * (non-superseded) drawings but NOT already in the real drawingSets list, so
 * the revision picker can offer sets that exist only as a name on child sheets.
 * `existingNames` is a Set of the real set_name strings.
 */
export function deriveVirtualSets(drawings, existingNames) {
  const byName = {};
  drawings.filter(d => d.drawing_set_name && !d.is_superseded).forEach(d => {
    if (!existingNames.has(d.drawing_set_name)) {
      if (!byName[d.drawing_set_name]) {
        byName[d.drawing_set_name] = {
          id: null,
          set_name: d.drawing_set_name,
          revision: d.revision_number != null ? String(d.revision_number) : "—",
          issued_date: d.issue_date || null,
          issued_by: d.issued_by || "",
          file_url: d.file_url || null,
          sheet_count: 0,
          revision_history: "[]",
        };
      }
      byName[d.drawing_set_name].sheet_count++;
    }
  });
  return Object.values(byName);
}

/**
 * Snapshot the drawing set's CURRENT revision into a history entry before the
 * new revision overwrites it. `disposition` ("superseded" | "reference") is
 * recorded as the entry status.
 */
export function buildRevisionSnapshot(selectedSet, disposition) {
  return {
    revisionLabel: selectedSet.revision,
    issueDate: selectedSet.issued_date,
    issuedBy: selectedSet.issued_by,
    fileUrl: selectedSet.file_url,
    sheetCount: selectedSet.sheet_count,
    notes: selectedSet.notes || "",
    uploadedAt: new Date().toISOString(),
    status: disposition,
  };
}
