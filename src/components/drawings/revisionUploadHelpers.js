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
