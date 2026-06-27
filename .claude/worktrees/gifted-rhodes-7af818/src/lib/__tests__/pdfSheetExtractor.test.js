import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assignPdfPages, validatePdfPage } from "../pdfSheetExtractor.js";

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
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("one-sheet-per-page (sheets.length === pageCount)", () => {
    it("ignores LLM pdfPage and assigns deterministically by index+1", () => {
      // Worst-case input: LLM returned pdfPage=1 for every sheet (the
      // exact bug we are guarding against). Deterministic override
      // should still produce 1, 2, 3 because the count matches.
      const sheets = [
        { sheetNumber: "S-101", pdfPage: 1 },
        { sheetNumber: "S-102", pdfPage: 1 },
        { sheetNumber: "S-103", pdfPage: 1 },
      ];
      const result = assignPdfPages(sheets, 3);
      expect(result.map(s => s.pdfPage)).toEqual([1, 2, 3]);
    });

    it("overrides even when the LLM emitted plausible-looking pages", () => {
      // The deterministic override is unconditional when counts match —
      // index ordering is the source of truth for sheet position in
      // this layout.
      const sheets = [
        { sheetNumber: "A201", pdfPage: 7 },
        { sheetNumber: "A202", pdfPage: 8 },
      ];
      const result = assignPdfPages(sheets, 2);
      expect(result.map(s => s.pdfPage)).toEqual([1, 2]);
    });

    it("preserves all other sheet fields", () => {
      const sheets = [
        { sheetNumber: "S-101", sheetTitle: "Foundation Plan", discipline: "Structural", pdfPage: 1 },
      ];
      const [r] = assignPdfPages(sheets, 1);
      expect(r.sheetNumber).toBe("S-101");
      expect(r.sheetTitle).toBe("Foundation Plan");
      expect(r.discipline).toBe("Structural");
      expect(r.pdfPage).toBe(1);
    });

    it("does not mutate the input array or its members", () => {
      const sheets = [{ sheetNumber: "S-101", pdfPage: 99 }];
      const before = JSON.stringify(sheets);
      assignPdfPages(sheets, 1);
      expect(JSON.stringify(sheets)).toBe(before);
    });
  });

  describe("drawing-index style (sheets.length !== pageCount)", () => {
    it("trusts the LLM's pdfPage when it is a valid positive integer", () => {
      // 5 sheets across a 10-page PDF — drawing index on page 1, sheets
      // on later pages. The LLM's pdfPage values are authoritative here
      // because index+1 would misalign.
      const sheets = [
        { sheetNumber: "S-101", pdfPage: 2 },
        { sheetNumber: "S-102", pdfPage: 4 },
        { sheetNumber: "S-103", pdfPage: 5 },
        { sheetNumber: "S-104", pdfPage: 7 },
        { sheetNumber: "S-105", pdfPage: 9 },
      ];
      const result = assignPdfPages(sheets, 10);
      expect(result.map(s => s.pdfPage)).toEqual([2, 4, 5, 7, 9]);
    });

    it("coerces numeric-string pdfPage to a number", () => {
      const sheets = [
        { sheetNumber: "S-101", pdfPage: "3" },
        { sheetNumber: "S-102", pdfPage: "5" },
      ];
      const result = assignPdfPages(sheets, 10);
      expect(result.map(s => s.pdfPage)).toEqual([3, 5]);
    });
  });

  describe("validation fallback", () => {
    it("falls back to 1 with a warning when pdfPage is invalid", () => {
      const sheets = [
        { sheetNumber: "S-101", pdfPage: 2 },
        { sheetNumber: "S-102", pdfPage: null },
        { sheetNumber: "S-103", pdfPage: -3 },
        { sheetNumber: "S-104", pdfPage: "abc" },
      ];
      const result = assignPdfPages(sheets, 10);
      expect(result.map(s => s.pdfPage)).toEqual([2, 1, 1, 1]);
      expect(warnSpy).toHaveBeenCalled();
      const firstCall = warnSpy.mock.calls[0][0];
      expect(firstCall).toMatch(/3 of 4 sheet\(s\) had invalid or out-of-range pdfPage/);
    });

    it("clamps pdfPage that exceeds pageCount to 1", () => {
      const sheets = [
        { sheetNumber: "S-101", pdfPage: 1 },
        { sheetNumber: "S-102", pdfPage: 99 }, // out of range
      ];
      const result = assignPdfPages(sheets, 5);
      expect(result.map(s => s.pdfPage)).toEqual([1, 1]);
      expect(warnSpy).toHaveBeenCalled();
    });

    it("does not warn when every pdfPage is valid", () => {
      const sheets = [
        { sheetNumber: "S-101", pdfPage: 2 },
        { sheetNumber: "S-102", pdfPage: 4 },
      ];
      assignPdfPages(sheets, 10);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("warns loudly when a multi-page PDF resolves every sheet to page 1", () => {
      // This is the original bug regressing — surface it.
      const sheets = [
        { sheetNumber: "S-101", pdfPage: null },
        { sheetNumber: "S-102", pdfPage: null },
        { sheetNumber: "S-103", pdfPage: null },
      ];
      // pageCount=10 ≠ sheets.length=3, so the deterministic override
      // doesn't fire; everything falls back to 1.
      const result = assignPdfPages(sheets, 10);
      expect(result.every(s => s.pdfPage === 1)).toBe(true);
      // Both warnings fired (per-sheet validation + the all-page-1 sanity check).
      const allMessages = warnSpy.mock.calls.map(c => c[0]).join("\n");
      expect(allMessages).toMatch(/multi-sheet pdf_page bug/);
    });
  });

  describe("edge cases", () => {
    it("handles an empty sheets array", () => {
      expect(assignPdfPages([], 5)).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("treats non-array input as empty", () => {
      expect(assignPdfPages(null, 5)).toEqual([]);
      expect(assignPdfPages(undefined, 5)).toEqual([]);
    });

    it("handles unknown pageCount (0 or NaN) by trusting + validating LLM values", () => {
      const sheets = [
        { sheetNumber: "S-101", pdfPage: 3 },
        { sheetNumber: "S-102", pdfPage: 7 },
      ];
      // Without a known pageCount we can't run the deterministic override
      // OR the upper-bound clamp; we just validate type/sign.
      expect(assignPdfPages(sheets, 0).map(s => s.pdfPage)).toEqual([3, 7]);
      expect(assignPdfPages(sheets, NaN).map(s => s.pdfPage)).toEqual([3, 7]);
    });

    it("handles a single-sheet single-page PDF", () => {
      const sheets = [{ sheetNumber: "S-101", pdfPage: 1 }];
      const result = assignPdfPages(sheets, 1);
      expect(result[0].pdfPage).toBe(1);
    });
  });
});
