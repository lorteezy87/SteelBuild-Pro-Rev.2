import { extractSheetsFromPdf, EMPTY_SET_META, parseFilename, validatePdfPage } from "@/lib/pdfSheetExtractor";
import { applyTitleblockRevisionOcr } from "@/lib/applyTitleblockRevisionOcr";
import { normalizeRevisionNumber } from "@/lib/drawingUploadUtils";
import { sheetReviewFlags } from "@/components/drawings/intakeReview";

export const MAX_PDF_SIZE_MB = 32;

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const result = await extractSheetsFromPdf(file, options);
  if (result?.sheets && options.titleblockTemplate?.revisionRect) {
    try {
      result.sheets = await applyTitleblockRevisionOcr(
        file,
        result.sheets,
        options.titleblockTemplate.revisionRect,
      );
    } catch (err) {
      console.warn("[validateAndExtract] revision OCR failed:", err?.message);
    }
  }
  return result;
}

export function buildDrawingRecord({ sheet, fileResults, meta, activeProject, resolvedSetName, parentSetId, batchId, now }) {
  const sourceResult = fileResults.find(r => r.fileName === sheet.sourceFile);
  const needsReview = sheetReviewFlags(sheet, sourceResult).needsReview;
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
    drawing_set_name: resolvedSetName,
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

export function makeProgressSteps(activeId, doneIds = [], warnings = {}) {
  return [
    { id: "upload",  label: "Uploading files to storage...",        done: doneIds.includes("upload")  },
    { id: "encode",  label: "Preparing PDF for AI reading...",       done: doneIds.includes("encode")  },
    { id: "extract", label: "✦ Claude is reading your drawing set...", detail: "Scanning title blocks and sheet index", done: doneIds.includes("extract"), warning: warnings["extract"] },
    { id: "parse",   label: "Building sheet list...",                done: doneIds.includes("parse")   },
    { id: "done",    label: null,                                    done: doneIds.includes("done")    },
  ];
}

export function mergeAiSetMetadata(prev, aggregateSetMeta = {}, defaultIssueDate) {
  const merged = { ...prev };
  const aiFilled = {};
  const tryFill = (prevKey, aiKey) => {
    const current = String(prev[prevKey] ?? "").trim();
    const aiVal = String(aggregateSetMeta[aiKey] ?? "").trim();
    const isDefault = prevKey === "issueDate" && current === defaultIssueDate;
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

export function normalizeSheetKey(value) {
  return String(value || "").toUpperCase().replace(/[-.\s]/g, "");
}

export function planExistingSetSheetReplace(existingLiveSheets = [], newRecords = []) {
  const byKey = new Map();
  for (const sheet of existingLiveSheets) {
    if (sheet?.is_superseded) continue;
    const key = normalizeSheetKey(sheet?.sheet_number);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, sheet);
  }

  const toUpdate = [];
  const toCreate = [];
  const claimed = new Set();

  for (const record of newRecords) {
    const key = normalizeSheetKey(record?.sheet_number);
    const existing = key ? byKey.get(key) : null;
    if (existing) {
      toUpdate.push({ existing, record });
      claimed.add(key);
    } else {
      toCreate.push(record);
    }
  }

  const toSupersede = [];
  for (const [key, sheet] of byKey) {
    if (!claimed.has(key)) toSupersede.push(sheet);
  }

  return { toUpdate, toCreate, toSupersede };
}
