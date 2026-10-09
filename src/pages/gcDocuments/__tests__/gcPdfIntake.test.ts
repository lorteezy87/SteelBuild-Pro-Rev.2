import { describe, expect, it } from "vitest";
import { gcPdfSheetRows, gcPdfSuggestions, validateGcPdfSheets, type GcPdfSheetDraft } from "../gcPdfIntake";
import type { PdfExtractionResult } from "@/lib/pdfSheetExtractor";

const row = (overrides: Partial<GcPdfSheetDraft> = {}): GcPdfSheetDraft => ({
  key: "s1",
  drawingNumber: "S-101",
  title: "Foundation",
  revision: "2",
  pdfPage: "2",
  source: "suggested",
  ...overrides,
});

describe("reviewed GC PDF page mapping", () => {
  it("withholds an invented page when extraction did not locate the sheet", () => {
    const result = { sheets: [{ sheetNumber: "S-101", sheetTitle: "Foundation" }] } as PdfExtractionResult;
    const suggestions = gcPdfSuggestions(result, 3);
    expect(suggestions[0].pdfPage).toBe("");
    expect(validateGcPdfSheets(suggestions, 3, "gc_drawing")).toMatch(/source page/i);
  });

  it("rejects duplicated GC numbers, repeated pages, and pages beyond the PDF", () => {
    expect(validateGcPdfSheets([row(), row({ key: "s2", drawingNumber: "s-101", pdfPage: "3" })], 3, "gc_drawing")).toMatch(/repeats/i);
    expect(validateGcPdfSheets([row(), row({ key: "s2", drawingNumber: "S-102", pdfPage: "2" })], 3, "gc_drawing")).toMatch(/mapped to more than one/i);
    expect(validateGcPdfSheets([row({ pdfPage: "4" })], 3, "gc_drawing")).toMatch(/between 1 and 3/i);
  });

  it("requires a sheet for a GC drawing but permits a document-only ASI", () => {
    expect(validateGcPdfSheets([], 3, "gc_drawing")).toMatch(/at least one reviewed sheet/i);
    expect(validateGcPdfSheets([], 3, "asi")).toBeNull();
    expect(gcPdfSheetRows([row({ source: "manual" })])[0]).toMatchObject({
      drawing_number: "S-101", pdf_page: 2, ai_extraction_status: "NeedsReview",
      metadata: { source_page_confirmed: true, titleblock_origin: "manual" },
    });
  });
});
