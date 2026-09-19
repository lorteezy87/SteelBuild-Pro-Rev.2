import { describe, it, expect } from "vitest";
import { attachPageText, type PdfSheetRecord } from "@/lib/pdfSheetExtractor";
import { PAGE_TEXT_TRUNCATION_MARKER, isTruncatedPageText } from "@/lib/pageTextFormat";

describe("attachPageText", () => {
  it("gives each sheet the text of its OWN page", () => {
    const sheets: PdfSheetRecord[] = [
      { sheetNumber: "S-101", pdfPage: 1 },
      { sheetNumber: "S-102", pdfPage: 3 },
    ];
    const out = attachPageText(sheets, ["page one", "page two", "page three"]);
    expect(out[0].extractedText).toBe("page one");
    expect(out[1].extractedText).toBe("page three");
  });

  it("leaves extractedText ABSENT for a page past the harvest budget", () => {
    // The harvest loop stops at the character budget, so `pages` is shorter
    // than the PDF. Sheet 3 was never read — that is not an empty page.
    const sheets: PdfSheetRecord[] = [
      { sheetNumber: "S-101", pdfPage: 1 },
      { sheetNumber: "S-900", pdfPage: 9 },
    ];
    const out = attachPageText(sheets, ["page one"]);
    expect(out[0].extractedText).toBe("page one");
    expect("extractedText" in out[1]).toBe(false);
  });

  it("keeps an empty page as an EMPTY STRING, not absent", () => {
    // Read, and carried no text — evidence about the sheet, unlike absence.
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-101", pdfPage: 1 }];
    const out = attachPageText(sheets, [""]);
    expect(out[0].extractedText).toBe("");
  });

  it("leaves a sheet with an unusable page number alone", () => {
    for (const pdfPage of [0, -2, null, undefined, "two", 1.5]) {
      const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-101", pdfPage }];
      const out = attachPageText(sheets, ["page one"]);
      expect("extractedText" in out[0]).toBe(false);
    }
  });

  it("does not mutate its input", () => {
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-101", pdfPage: 1 }];
    attachPageText(sheets, ["page one"]);
    expect("extractedText" in sheets[0]).toBe(false);
  });

  it("tolerates missing sheets or pages", () => {
    expect(attachPageText(null, ["a"])).toEqual([]);
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-1", pdfPage: 1 }];
    expect(attachPageText(sheets, null)[0].extractedText).toBeUndefined();
  });
});

describe("isTruncatedPageText", () => {
  it("detects a page cut at the harvest cap", () => {
    expect(isTruncatedPageText(`NOTES${PAGE_TEXT_TRUNCATION_MARKER}`)).toBe(true);
  });

  it("is false for complete, empty and missing text", () => {
    expect(isTruncatedPageText("NOTES")).toBe(false);
    expect(isTruncatedPageText("")).toBe(false);
    expect(isTruncatedPageText(null)).toBe(false);
    expect(isTruncatedPageText(undefined)).toBe(false);
  });
});
