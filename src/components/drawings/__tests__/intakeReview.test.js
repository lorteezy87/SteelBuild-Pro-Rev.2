import { describe, it, expect } from "vitest";
import { sheetReviewFlags } from "@/components/drawings/intakeReview";

const goodSheet = { sheetNumber: "S-101", sheetTitle: "First Floor Plan" };
const goodSource = { fileName: "set.pdf", scanned: false, tooLarge: false, extractFailed: false };

describe("sheetReviewFlags", () => {
  it("clears a complete sheet from a clean extraction", () => {
    const r = sheetReviewFlags(goodSheet, goodSource);
    expect(r.needsReview).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("flags a sheet whose source PDF failed extraction", () => {
    const r = sheetReviewFlags(goodSheet, { ...goodSource, extractFailed: true });
    expect(r.needsReview).toBe(true);
    expect(r.reasons).toContain("extraction failed");
  });

  it("flags scanned and too-large sources", () => {
    expect(sheetReviewFlags(goodSheet, { ...goodSource, scanned: true }).reasons).toContain("scanned — manual entry");
    expect(sheetReviewFlags(goodSheet, { ...goodSource, tooLarge: true }).reasons).toContain("PDF too large");
  });

  it("flags a missing sheet number even from a clean source", () => {
    const r = sheetReviewFlags({ sheetNumber: "   ", sheetTitle: "Plan" }, goodSource);
    expect(r.needsReview).toBe(true);
    expect(r.reasons).toContain("missing sheet #");
  });

  it("adds a fallback-row reason only when a source flag didn't already explain it", () => {
    // _note alone (clean source) → its own reason
    expect(sheetReviewFlags({ sheetNumber: "S1", _note: "x" }, goodSource).reasons).toContain("needs manual entry");
    // _note + scanned → no duplicate manual-entry reason (scanned already covers it)
    const both = sheetReviewFlags({ sheetNumber: "S1", _note: "x" }, { ...goodSource, scanned: true });
    expect(both.reasons).toContain("scanned — manual entry");
    expect(both.reasons).not.toContain("needs manual entry");
  });

  it("accumulates multiple distinct reasons", () => {
    const r = sheetReviewFlags({ sheetNumber: "" }, { ...goodSource, extractFailed: true });
    expect(r.reasons).toEqual(expect.arrayContaining(["extraction failed", "missing sheet #"]));
  });

  it("does not throw on missing sheet / source", () => {
    expect(sheetReviewFlags(null, undefined).needsReview).toBe(true); // no sheet number → review
    expect(sheetReviewFlags({ sheetNumber: "S1" }, undefined).needsReview).toBe(false);
  });
});
