import { describe, expect, it } from "vitest";
import { assignPdfPages } from "../pdfSheetExtractor";

describe("drawing page provenance", () => {
  it("preserves explicit pages when extracted rows are not in PDF order", () => {
    expect(assignPdfPages([{ sheetNumber: "S2", pdfPage: 2 }, { sheetNumber: "S1", pdfPage: 1 }], 2)
      .map(sheet => sheet.pdfPage)).toEqual([2, 1]);
  });
  it("allows multiple identified sheets on the same physical page", () => {
    expect(assignPdfPages([{ pdfPage: 1 }, { pdfPage: 1 }, { pdfPage: 1 }], 2)
      .map(sheet => sheet.pdfPage)).toEqual([1, 1, 1]);
  });
  it("leaves missing and out-of-range pages unresolved, never guessed", () => {
    expect(assignPdfPages([{ pdfPage: null }, { pdfPage: 99 }, { pdfPage: -1 }], 3)
      .map(sheet => sheet.pdfPage)).toEqual([null, null, null]);
  });
});
