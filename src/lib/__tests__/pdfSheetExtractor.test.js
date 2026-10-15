import { describe, it, expect } from "vitest";
import { assignPdfPages, validatePdfPage } from "../pdfSheetExtractor";

describe("validatePdfPage", () => {
  it("accepts positive integers", () => {
    expect(validatePdfPage(1)).toBe(1);
    expect(validatePdfPage(42)).toBe(42);
    expect(validatePdfPage(100)).toBe(100);
  });

  it("accepts numeric strings the LLM might emit", () => {
    expect(validatePdfPage("3")).toBe(3);
    expect(validatePdfPage("12")).toBe(12);
  });

  it("rejects zero and negatives", () => {
    expect(validatePdfPage(0)).toBeNull();
    expect(validatePdfPage(-1)).toBeNull();
    expect(validatePdfPage("-5")).toBeNull();
  });

  it("rejects non-integers", () => {
    expect(validatePdfPage(1.5)).toBeNull();
    expect(validatePdfPage("3.7")).toBeNull();
  });

  it("rejects null, undefined, empty, NaN, and non-numeric strings", () => {
    expect(validatePdfPage(null)).toBeNull();
    expect(validatePdfPage(undefined)).toBeNull();
    expect(validatePdfPage("")).toBeNull();
    expect(validatePdfPage(NaN)).toBeNull();
    expect(validatePdfPage("abc")).toBeNull();
  });
});

describe("assignPdfPages", () => {
  it("preserves explicit mappings rather than inferring them from row count", () => {
    expect(assignPdfPages([{ pdfPage: 2 }, { pdfPage: 1 }], 2).map(s => s.pdfPage)).toEqual([2, 1]);
  });
  it("preserves valid shared pages without inventing unused pages", () => {
    expect(assignPdfPages([{ pdfPage: 1 }, { pdfPage: 1 }, { pdfPage: 1 }], 2).map(s => s.pdfPage)).toEqual([1, 1, 1]);
  });
  it("leaves out-of-range values unresolved even when row and page counts match", () => {
    expect(assignPdfPages([{ pdfPage: 7 }, { pdfPage: 8 }], 2).map(s => s.pdfPage)).toEqual([null, null]);
  });
  it("retains other sheet fields without mutating the input", () => {
    const sheet = Object.freeze({ sheetNumber: "S-101", sheetTitle: "Foundation Plan", discipline: "Structural", pdfPage: 99 });
    expect(assignPdfPages([sheet], 1)).toEqual([{ ...sheet, pdfPage: null }]);
    expect(sheet.pdfPage).toBe(99);
  });
  it("retains drawing-index page mappings", () => {
    expect(assignPdfPages([2,4,5,7,9].map(pdfPage => ({ pdfPage })), 10).map(s => s.pdfPage)).toEqual([2,4,5,7,9]);
  });
  it("coerces numeric-string page values", () => {
    expect(assignPdfPages([{ pdfPage: "3" }, { pdfPage: "5" }], 10).map(s => s.pdfPage)).toEqual([3,5]);
  });
  it.each([null, undefined, -3, "abc", 0, 1.5, 99])("does not invent provenance for invalid page %s", pdfPage => {
    expect(assignPdfPages([{ pdfPage: 2 }, { pdfPage }], 10).map(s => s.pdfPage)).toEqual([2,null]);
  });
  it("handles empty and non-array inputs", () => {
    expect(assignPdfPages([], 5)).toEqual([]);
    expect(assignPdfPages(null, 5)).toEqual([]);
    expect(assignPdfPages(undefined, 5)).toEqual([]);
  });
  it.each([0, NaN])("retains positive mappings when page count is unknown (%s)", count => {
    expect(assignPdfPages([{ pdfPage: 3 }, { pdfPage: 7 }], count).map(s => s.pdfPage)).toEqual([3,7]);
  });
  it("keeps the single-page mapping", () => {
    expect(assignPdfPages([{ pdfPage: 1 }], 1)).toEqual([{ pdfPage: 1 }]);
  });
});
