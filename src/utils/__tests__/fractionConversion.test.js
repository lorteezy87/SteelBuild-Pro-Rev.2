/**
 * Unit tests for fractionConversion.js
 *
 * Targets the specific cases called out in the spec plus round-trip
 * accuracy (decimal → ft-in-frac → decimal should land within the
 * rounding precision).
 */

import { describe, it, expect } from "vitest";
import {
  decimalFeetToFtIn,
  decimalInchesToFraction,
  ftInToDecimalFeet,
  ftInToDecimalInches,
  reduceFraction,
  roundingDelta,
} from "../fractionConversion";

describe("reduceFraction", () => {
  it("reduces 8/16 → 1/2", () => {
    expect(reduceFraction(8, 16)).toEqual({ num: 1, den: 2 });
  });
  it("reduces 4/16 → 1/4", () => {
    expect(reduceFraction(4, 16)).toEqual({ num: 1, den: 4 });
  });
  it("normalizes zero to 0/1", () => {
    expect(reduceFraction(0, 16)).toEqual({ num: 0, den: 1 });
  });
  it("returns null for zero/negative denominator", () => {
    expect(reduceFraction(1, 0)).toBeNull();
    expect(reduceFraction(1, -4)).toBeNull();
  });
  it("returns null for non-finite input", () => {
    expect(reduceFraction(NaN, 16)).toBeNull();
    expect(reduceFraction(1, Infinity)).toBeNull();
  });
});

describe("decimalFeetToFtIn", () => {
  it("12.375 ft → 12'-4 1/2\" at 1/16", () => {
    // 0.375 ft × 12 = 4.5" exactly
    expect(decimalFeetToFtIn(12.375, 16)).toBe('12\'-4 1/2"');
  });
  it("whole feet render with 0\"", () => {
    expect(decimalFeetToFtIn(8, 16)).toBe('8\'-0"');
  });
  it("0.5 ft → 0'-6\"", () => {
    expect(decimalFeetToFtIn(0.5, 16)).toBe('0\'-6"');
  });
  it("carries 12\" → next foot on round-up edge", () => {
    // 11.9999 ft × 12 = 143.9988". At 1/16 precision rounds to 144/16 =
    // 12'-0" exactly, so the output should be 12'-0\", not 11'-12\".
    expect(decimalFeetToFtIn(11.9999, 16)).toBe('12\'-0"');
  });
  it("rejects negative values", () => {
    expect(decimalFeetToFtIn(-1, 16)).toBeNull();
  });
  it("rejects non-finite", () => {
    expect(decimalFeetToFtIn(NaN, 16)).toBeNull();
  });
  it("rejects unsupported precisions", () => {
    expect(decimalFeetToFtIn(1, 3)).toBeNull();
  });
});

describe("decimalInchesToFraction", () => {
  it("0.125\" → 1/8\" at any precision ≥ 8", () => {
    expect(decimalInchesToFraction(0.125, 16)).toBe('1/8"');
    expect(decimalInchesToFraction(0.125, 8)).toBe('1/8"');
    expect(decimalInchesToFraction(0.125, 32)).toBe('1/8"');
  });
  it("0.333\" rounds to 5/16\" at 1/16 precision", () => {
    // 0.333 × 16 = 5.328 → round to 5 → 5/16"
    expect(decimalInchesToFraction(0.333, 16)).toBe('5/16"');
  });
  it("2.75\" → 2 3/4\"", () => {
    expect(decimalInchesToFraction(2.75, 16)).toBe('2 3/4"');
  });
  it("whole inch shows without fraction", () => {
    expect(decimalInchesToFraction(5, 16)).toBe('5"');
  });
  it("zero → 0\"", () => {
    expect(decimalInchesToFraction(0, 16)).toBe('0"');
  });
  it("carries to whole inch on round-up edge", () => {
    // 0.99999 × 16 = 15.999 → round to 16 → carry to 1"
    expect(decimalInchesToFraction(0.99999, 16)).toBe('1"');
  });
  it("rejects negative", () => {
    expect(decimalInchesToFraction(-0.5, 16)).toBeNull();
  });
});

describe("ftInToDecimalFeet", () => {
  it("12ft 4 1/2\" → 12.375", () => {
    expect(ftInToDecimalFeet(12, 4, 1, 2)).toBeCloseTo(12.375, 10);
  });
  it("0ft 6\" → 0.5", () => {
    expect(ftInToDecimalFeet(0, 6, 0, 1)).toBeCloseTo(0.5, 10);
  });
  it("0ft 0\" → 0", () => {
    expect(ftInToDecimalFeet(0, 0, 0, 1)).toBe(0);
  });
  it("handles null / empty components as 0", () => {
    expect(ftInToDecimalFeet(12, null, undefined, 1)).toBe(12);
    expect(ftInToDecimalFeet("", "", "", 1)).toBe(0);
  });
  it("rejects zero or negative denominator", () => {
    expect(ftInToDecimalFeet(1, 0, 1, 0)).toBeNull();
    expect(ftInToDecimalFeet(1, 0, 1, -4)).toBeNull();
  });
  it("rejects negative components", () => {
    expect(ftInToDecimalFeet(-1, 0, 0, 1)).toBeNull();
    expect(ftInToDecimalFeet(0, -1, 0, 1)).toBeNull();
  });
});

describe("ftInToDecimalInches", () => {
  it("12ft 4 1/2\" → 148.5 in", () => {
    expect(ftInToDecimalInches(12, 4, 1, 2)).toBeCloseTo(148.5, 10);
  });
  it("rejects bad denominator", () => {
    expect(ftInToDecimalInches(1, 0, 1, 0)).toBeNull();
  });
});

describe("roundingDelta", () => {
  it("0.333\" at 1/16 → small positive delta vs 5/16\" = 0.3125", () => {
    const d = roundingDelta(0.333, 16, "inches");
    expect(d).not.toBeNull();
    expect(d).toBeCloseTo(0.0205, 4);
  });
  it("exact tick returns 0", () => {
    expect(roundingDelta(0.5, 16, "inches")).toBeCloseTo(0, 10);
  });
  it("works in feet mode", () => {
    // 1 ft 0.01 in → not representable at 1/16, small delta
    const d = roundingDelta(1 + 0.01 / 12, 16, "feet");
    expect(d).not.toBeNull();
  });
});

describe("round-trip accuracy", () => {
  it("decimal → ft-in-frac → decimal lands within 1/(2·precision) in", () => {
    const precision = 16;
    const cases = [12.375, 8.0, 0.5, 100.0625, 7.333333];
    for (const src of cases) {
      const asStr = decimalFeetToFtIn(src, precision);
      // Accept three forms: F'-I", F'-I N/D", F'-N/D" (fraction-only)
      const m =
        asStr.match(/^(\d+)'-(\d+)\s+(\d+)\/(\d+)"$/) ||
        asStr.match(/^(\d+)'-(\d+)\/(\d+)"$/) ||
        asStr.match(/^(\d+)'-(\d+)"$/);
      expect(m, `parse of ${asStr}`).not.toBeNull();

      let feet, inches, num, den;
      if (m.length === 5) {
        // F'-I N/D"
        [, feet, inches, num, den] = m;
      } else if (m.length === 4) {
        // F'-N/D"
        [, feet, num, den] = m;
        inches = "0";
      } else {
        // F'-I"
        [, feet, inches] = m;
        num = "0"; den = "1";
      }
      const round = ftInToDecimalFeet(+feet, +inches, +num, +den);
      expect(Math.abs(round - src)).toBeLessThanOrEqual(1 / (precision * 12 * 2) + 1e-9);
    }
  });
});
