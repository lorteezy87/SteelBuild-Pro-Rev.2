import { describe, expect, it } from "vitest";
import {
  deltaDisplay,
  numOrZero,
  trimNumber,
  toggleStyle,
} from "../decimalFractionConverterHelpers";

describe("decimalFractionConverterHelpers", () => {
  it("formats delta and numbers", () => {
    expect(deltaDisplay(0.01234, "feet")).toContain("ft");
    expect(deltaDisplay(-0.5, "inches")).toContain('"');
    expect(numOrZero("")).toBe(0);
    expect(numOrZero("12.5")).toBe(12.5);
    expect(trimNumber(1.25)).toBe("1.25");
    expect(trimNumber(1)).toBe("1");
  });

  it("builds toggle styles", () => {
    expect(toggleStyle(true).background).toBe("var(--accent)");
    expect(toggleStyle(false).background).toBe("var(--bg-surface-low)");
  });
});

import {
  resolveFractionParts,
  validateFractionToDecimalInputs,
  formatFeetInchesPreview,
  numOrZero,
} from "../decimalFractionConverterHelpers";

describe("fraction-to-decimal pure helpers", () => {
  it("resolves custom vs common fraction", () => {
    expect(resolveFractionParts(true, "3", "8", { num: 1, den: 16 })).toEqual({ num: 3, den: 8 });
    expect(resolveFractionParts(false, "3", "8", { num: 1, den: 16 })).toEqual({ num: 1, den: 16 });
  });

  it("validates negative and custom fraction fields", () => {
    expect(validateFractionToDecimalInputs({
      feet: -1, inches: 0, customMode: false, customNum: "", customDen: "16", numOrZero,
    })).toContain("Negative feet / inches are not allowed.");
    expect(validateFractionToDecimalInputs({
      feet: 1, inches: 0, customMode: true, customNum: "1", customDen: "0", numOrZero,
    })).toContain("Denominator must be a positive number.");
  });

  it("formats preview", () => {
    expect(formatFeetInchesPreview(10, 2, { num: 1, den: 4 }, numOrZero)).toBe(`10'-2 1/4"`);
  });
});
