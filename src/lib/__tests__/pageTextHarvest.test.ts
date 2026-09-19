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

describe("attachPageText — callouts", () => {
  const calloutsByPage = [
    [{ targetSheetNumber: "S-401", text: "SEE S-401", coords: { x: 1, y: 2, width: 3, height: 4 } }],
    [{ targetSheetNumber: "S-101", text: "3/S-101", coords: { x: 5, y: 6, width: 7, height: 8 } }],
  ];

  it("gives each sheet the callouts found on its own page", () => {
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-101", pdfPage: 1 }];
    const out = attachPageText(sheets, ["page one"], calloutsByPage);
    expect(out[0].callouts).toEqual(calloutsByPage[0]);
  });

  it("drops a self-reference once the sheet number is known", () => {
    // Page 2 references S-101, and this IS S-101 — a bubble pointing at the
    // page you are already on, which would render a button going nowhere.
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S101", pdfPage: 2 }];
    const out = attachPageText(sheets, ["a", "b"], calloutsByPage);
    expect(out[0].callouts).toEqual([]);
  });

  it("keeps an empty ARRAY for a read page that referenced nothing", () => {
    // Distinct from absent: read-and-none is evidence, never-read is not.
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-101", pdfPage: 1 }];
    const out = attachPageText(sheets, ["page one"], [[]]);
    expect(out[0].callouts).toEqual([]);
  });

  it("leaves callouts ABSENT for a page that was never harvested", () => {
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-900", pdfPage: 9 }];
    const out = attachPageText(sheets, ["page one"], calloutsByPage);
    expect("callouts" in out[0]).toBe(false);
  });

  it("still attaches callouts when the page text is missing", () => {
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-102", pdfPage: 1 }];
    const out = attachPageText(sheets, [], calloutsByPage);
    expect(out[0].callouts).toEqual(calloutsByPage[0]);
    expect("extractedText" in out[0]).toBe(false);
  });

  it("is a no-op when no callouts were supplied", () => {
    const sheets: PdfSheetRecord[] = [{ sheetNumber: "S-101", pdfPage: 1 }];
    expect("callouts" in attachPageText(sheets, ["page one"])[0]).toBe(false);
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
