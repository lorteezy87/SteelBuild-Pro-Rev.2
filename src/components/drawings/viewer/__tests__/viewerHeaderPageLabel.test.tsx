/**
 * The viewer header printed the sheet's STORED `pdf_page` while the toolbar
 * showed the page actually rendered. On a sheet whose stored page is wrong or
 * out of range (the loader clamps it), the header claimed "PDF 4" over a
 * rendering of page 1 — the wrong drawing with no indication, on a path that
 * feeds fabrication.
 *
 * The header must show what's on screen, and say so when the stored page
 * disagrees.
 */
import { describe, expect, it } from "vitest";
import { pageLabel, pageMismatch } from "../ViewerHeader";

const sheet = (pdfPage: number | null) => ({ id: "d1", sheet_number: "602E104", pdf_page: pdfPage });

describe("pageLabel", () => {
  it("shows the rendered page and total, not the stored pdf_page", () => {
    expect(pageLabel(sheet(4), 4, 8)).toBe("PDF 4 / 8");
  });

  it("surfaces the disagreement when the stored page isn't what's rendered", () => {
    expect(pageLabel(sheet(4), 1, 8)).toBe("PDF 1 / 8 · sheet says 4");
  });

  it("never claims a page the viewer isn't showing", () => {
    expect(pageLabel(sheet(4), 1, 8)).not.toBe("PDF 4 / 8");
    expect(pageLabel(sheet(99), 3, 8)).toMatch(/^PDF 3 \/ 8/);
  });

  it("omits the total for a single-page PDF", () => {
    expect(pageLabel(sheet(1), 1, 1)).toBe("PDF 1");
  });

  it("falls back to the stored page before the PDF reports one", () => {
    expect(pageLabel(sheet(3), undefined, undefined)).toBe("PDF 3");
    expect(pageLabel(sheet(null), undefined, undefined)).toBe("PDF 1");
  });

  it("treats a missing stored page as agreement", () => {
    expect(pageLabel(sheet(null), 2, 5)).toBe("PDF 2 / 5");
  });
});

describe("pageMismatch", () => {
  it("is true only when both pages are real and differ", () => {
    expect(pageMismatch(sheet(4), 1)).toBe(true);
    expect(pageMismatch(sheet(4), 4)).toBe(false);
    expect(pageMismatch(sheet(null), 1)).toBe(false);
    expect(pageMismatch(sheet(0), 1)).toBe(false);
    expect(pageMismatch(sheet(4), undefined)).toBe(false);
  });
});
