import type { GcDocType } from "@/lib/gcDocuments/gcDocTypes";
import type { PdfExtractionResult } from "@/lib/pdfSheetExtractor";

/** Editable suggestions only. A machine read is never a GC sheet of record. */
export interface GcPdfSheetDraft {
  key: string;
  drawingNumber: string;
  title: string;
  revision: string;
  pdfPage: string;
  source: "suggested" | "manual";
}

export function gcPdfSuggestions(result: PdfExtractionResult, pageCount: number): GcPdfSheetDraft[] {
  return result.sheets.map((sheet, index) => {
    const page = Number(sheet.pdfPage);
    return {
      key: `suggested-${index}`,
      drawingNumber: String(sheet.sheetNumber ?? "").trim(),
      title: String(sheet.sheetTitle ?? "").trim(),
      revision: String(sheet.revision ?? "").trim(),
      pdfPage: Number.isInteger(page) && page >= 1 && page <= pageCount ? String(page) : "",
      source: "suggested" as const,
    };
  });
}

export function validateGcPdfSheets(
  sheets: readonly GcPdfSheetDraft[],
  pageCount: number | null,
  docType: GcDocType,
): string | null {
  if (!Number.isInteger(pageCount) || !pageCount || pageCount < 1) return "The PDF page count could not be verified. Choose a readable file.";
  if ((docType === "gc_drawing" || docType === "revision") && sheets.length === 0) {
    return "Drawing issuances need at least one reviewed sheet. Add a sheet from its source page.";
  }
  const numbers = new Set<string>();
  const pages = new Set<number>();
  for (const [index, sheet] of sheets.entries()) {
    const number = sheet.drawingNumber.trim();
    const page = Number(sheet.pdfPage);
    if (!number) return `Sheet ${index + 1} needs the GC's own drawing number.`;
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      return `Sheet ${index + 1} needs a source page between 1 and ${pageCount}.`;
    }
    const key = number.toUpperCase();
    if (numbers.has(key)) return `The incoming PDF repeats ${number}. Resolve the duplicate before saving.`;
    if (pages.has(page)) return `PDF page ${page} is mapped to more than one sheet. Resolve the mapping before saving.`;
    numbers.add(key);
    pages.add(page);
  }
  return null;
}

export function gcPdfSheetRows(sheets: readonly GcPdfSheetDraft[]): Array<Record<string, unknown>> {
  return sheets.map((sheet) => ({
    drawing_number: sheet.drawingNumber.trim(),
    title: sheet.title.trim() || null,
    revision: sheet.revision.trim() || null,
    pdf_page: Number(sheet.pdfPage),
    upload_status: "Uploaded",
    ai_extraction_status: sheet.source === "suggested" ? "Processed" : "NeedsReview",
    metadata: { intake_source: "reviewed_gc_pdf", source_page_confirmed: true, titleblock_origin: sheet.source },
  }));
}
