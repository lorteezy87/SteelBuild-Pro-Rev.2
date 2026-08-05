/**
 * Unit tests for measureLabel.js
 *
 * Two label modes:
 *   calibrated  → real feet-inches to the nearest 1/16"
 *   uncalibrated→ raw page inches, one decimal, "~" prefix
 *
 * pdfDist is in PDF points (1/72"). markup_scale is real_inches_per_pdf_inch.
 */

import { describe, it, expect } from "vitest";
import { formatMeasureLabel } from "../measureLabel";

const PT = 72; // one page inch

describe("formatMeasureLabel — calibrated", () => {
  it("converts page inches through the scale to feet-inches", () => {
    // 1 page inch at 1/8"=1'-0" (scale 96) = 96 real inches = 8'-0"
    expect(formatMeasureLabel(1 * PT, 96)).toBe(`8'-0"`);
  });
  it("renders bare inches under a foot", () => {
    // 0.5 page inch at 1"=1'-0" (scale 12) = 6 real inches
    expect(formatMeasureLabel(0.5 * PT, 12)).toBe('6"');
  });
  it("rounds to the nearest 1/16", () => {
    // 0.51 page inch at scale 12 = 6.12" → 6 2/16 = 6 1/8
    expect(formatMeasureLabel(0.51 * PT, 12)).toBe('6 1/8"');
  });
  it("carries into feet rather than printing 12 inches", () => {
    // 0.9975 page inch at scale 12 = 11.97" → 1'-0"
    expect(formatMeasureLabel(0.9975 * PT, 12)).toBe(`1'-0"`);
  });
});

describe("formatMeasureLabel — uncalibrated", () => {
  it("prefixes with ~ and stays decimal", () => {
    expect(formatMeasureLabel(8.3 * PT, null)).toBe('~8.3"');
  });
  it("does not round page inches to 16ths", () => {
    expect(formatMeasureLabel(2.25 * PT, null)).toBe('~2.3"');
  });
  it("rounds before banding on 12 inches (the boundary bug)", () => {
    // 11.97 page inches rounds to 12.0 → must read 1'-0.0", not 12.0"
    expect(formatMeasureLabel(11.97 * PT, null)).toBe(`~1'-0.0"`);
  });
  it("still renders large page distances as feet", () => {
    expect(formatMeasureLabel(14.5 * PT, null)).toBe(`~1'-2.5"`);
  });
  it("treats a zero scale as uncalibrated, not as a calibrated zero", () => {
    expect(formatMeasureLabel(1 * PT, 0)).toBe('~1.0"');
  });
  it("treats a non-numeric scale as uncalibrated", () => {
    expect(formatMeasureLabel(1 * PT, "0")).toBe('~1.0"');
    expect(formatMeasureLabel(1 * PT, NaN)).toBe('~1.0"');
  });
  it("rolls over correctly well past the first foot", () => {
    // 143.96 page inches → rounds to 144.0 → 12'-0.0"
    expect(formatMeasureLabel(143.96 * PT, null)).toBe(`~12'-0.0"`);
  });
});
