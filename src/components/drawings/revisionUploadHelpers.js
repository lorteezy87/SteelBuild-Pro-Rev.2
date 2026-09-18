import { extractSheetsFromPdf } from "@/lib/pdfSheetExtractor";
import { applyTitleblockRevisionOcr } from "@/lib/applyTitleblockRevisionOcr";

export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CHANGE_STYLE = {
  revised: { color: "var(--status-warning-bright)", label: "✎ REVISED", bg: "rgba(255,176,32,0.06)" },
  added:   { color: "var(--status-success-bright)", label: "+ ADDED",   bg: "rgba(0,214,143,0.06)" },
  removed: { color: "var(--status-error-bright)", label: "— REMOVED", bg: "rgba(255,61,61,0.05)" },
  ambiguous: { color: "var(--status-error-bright)", label: "! REVIEW", bg: "rgba(255,61,61,0.10)" },
  same:    { color: "var(--text-muted)", label: "≡ SAME", bg: "transparent" },
};

export async function extractRevisionSheets(file, options = {}) {
  const result = await extractSheetsFromPdf(file, options);
  if (result?.extractFailed) {
    const err = new Error(result.error || "AI extraction failed");
    err.extractFailed = true;
    throw err;
  }
  let sheets = Array.isArray(result?.sheets) ? result.sheets : [];
  // Hand the caller the parts of the extraction that are NOT sheets — cover-sheet
  // metadata and whether the PDF had a text layer at all. Document Control needs
  // both: without `scanned` it cannot tell a blank title-block box from a page it
  // was never able to read. Passed through a callback so the return contract of
  // this function (a sheets array) stays exactly as its callers expect.
  if (typeof options.onExtraction === "function") {
    try {
      options.onExtraction({
        setMeta: result?.setMeta ?? null,
        scanned: result?.scanned === true,
        pageCount: result?.pageCount ?? null,
      });
    } catch (err) {
      console.warn("[extractRevisionSheets] onExtraction callback failed:", err?.message);
    }
  }
  if (options.titleblockTemplate?.revisionRect) {
    try {
      sheets = await applyTitleblockRevisionOcr(
        file,
        sheets,
        options.titleblockTemplate.revisionRect,
      );
    } catch (err) {
      console.warn("[extractRevisionSheets] revision OCR failed:", err?.message);
    }
  }
  return sheets;
}

export function deriveVirtualSets(drawings, existingNames) {
  const byName = {};
  drawings.filter(d => d.drawing_set_name && !d.is_superseded).forEach(d => {
    if (!existingNames.has(d.drawing_set_name)) {
      if (!byName[d.drawing_set_name]) {
        byName[d.drawing_set_name] = {
          id: null,
          set_name: d.drawing_set_name,
          revision: d.revision_number != null ? String(d.revision_number) : "—",
          // `drawings` rows carry no issue_date / issued_by (those live on
          // drawing_sets); a virtual set has no parent row to read them from.
          issued_date: null,
          issued_by: "",
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
 * Merge the sheets found by FK (`drawing_set_id`) with legacy rows that only
 * carry `drawing_set_name`. FK rows win; a name-matched row is only kept when
 * it has NO FK at all (a row linked to a different set is a different set).
 */
export function mergeSetDrawings(byId = [], byName = []) {
  const seen = new Set((byId || []).map((d) => d?.id).filter(Boolean));
  const legacy = (byName || []).filter((d) => d && !d.drawing_set_id && !seen.has(d.id));
  return [...(byId || []), ...legacy];
}

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
