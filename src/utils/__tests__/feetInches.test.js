/**
 * Unit tests for feetInches.js — the canonical measured-length formatter.
 *
 * The load-bearing case is the carry: rounding to 1/16ths must happen BEFORE
 * we decide whether the value is "under 12 inches", or 11.97" prints as 12"
 * instead of 1'-0".
 */

import { describe, it, expect } from "vitest";
import { formatFeetInches } from "../feetInches";

describe("formatFeetInches — bare inches under 12", () => {
  it("formats zero", () => {
    expect(formatFeetInches(0)).toBe('0"');
  });
  it("rounds sub-16th values away", () => {
    expect(formatFeetInches(0.01)).toBe('0"');
  });
  it("keeps a leading zero on sub-inch fractions", () => {
    expect(formatFeetInches(0.0625)).toBe('0 1/16"');
    expect(formatFeetInches(0.1875)).toBe('0 3/16"');
  });
  it("reduces 8/16 to 1/2", () => {
    expect(formatFeetInches(0.5)).toBe('0 1/2"');
  });
  it("formats whole inches without a fraction", () => {
    expect(formatFeetInches(5)).toBe('5"');
  });
  it("formats common shop fractions", () => {
    expect(formatFeetInches(6.5)).toBe('6 1/2"');
    expect(formatFeetInches(6.25)).toBe('6 1/4"');
    expect(formatFeetInches(2.75)).toBe('2 3/4"');
  });
});

describe("formatFeetInches — feet-inches at 12 and above", () => {
  it("formats the exact 12-inch boundary", () => {
    expect(formatFeetInches(12)).toBe(`1'-0"`);
  });
  it("formats feet with a fraction", () => {
    expect(formatFeetInches(12.5)).toBe(`1'-0 1/2"`);
  });
  it("formats a typical span", () => {
    expect(formatFeetInches(174)).toBe(`14'-6"`);
  });
});

describe("formatFeetInches — the carry bug", () => {
  it("does not carry below the rounding threshold", () => {
    expect(formatFeetInches(11.9)).toBe('11 7/8"');
  });
  it("carries into feet when rounding reaches 12 inches", () => {
    expect(formatFeetInches(11.96875)).toBe(`1'-0"`);
    expect(formatFeetInches(11.97)).toBe(`1'-0"`);
  });
  it("carries at a higher foot boundary", () => {
    expect(formatFeetInches(23.96875)).toBe(`2'-0"`);
  });
  it("never emits an inch component of 12 or more", () => {
    for (let ticks = 0; ticks <= 16 * 60; ticks++) {
      const out = formatFeetInches(ticks / 16);
      const m = out.match(/'-(\d+)/);
      if (m) expect(Number(m[1])).toBeLessThan(12);
    }
  });
});

describe("formatFeetInches — contracts", () => {
  it("returns the empty label for non-finite input, with no prefix", () => {
    expect(formatFeetInches(NaN, { prefix: "~" })).toBe("—");
    expect(formatFeetInches(Infinity)).toBe("—");
  });
  it("places the prefix outside the value", () => {
    expect(formatFeetInches(6.5, { prefix: "~" })).toBe('~6 1/2"');
  });
  it("signs negatives inside the prefix", () => {
    expect(formatFeetInches(-6.5)).toBe('-6 1/2"');
  });
  it("honours a coarser precision", () => {
    expect(formatFeetInches(6.5, { precision: 4 })).toBe('6 1/2"');
    expect(formatFeetInches(6.0625, { precision: 4 })).toBe('6"');
  });
  it("rejects a non-positive precision", () => {
    expect(formatFeetInches(6.5, { precision: 0 })).toBe("—");
  });
  it("coerces a string precision", () => {
    expect(formatFeetInches(6.5, { precision: "16" })).toBe('6 1/2"');
  });
  it("rejects a non-integer precision rather than mis-reducing the fraction", () => {
    expect(formatFeetInches(3.1, { precision: 16.5 })).toBe("—");
  });
  it("rejects a negative precision", () => {
    expect(formatFeetInches(6.5, { precision: -16 })).toBe("—");
  });
  it("does not print a negative zero", () => {
    expect(formatFeetInches(-0.01)).toBe('0"');
    expect(formatFeetInches(-0.03)).toBe('0"');
    expect(formatFeetInches(-0)).toBe('0"');
  });
  it("still signs a negative that survives rounding", () => {
    expect(formatFeetInches(-6.5)).toBe('-6 1/2"');
    expect(formatFeetInches(-0.0625)).toBe('-0 1/16"');
  });
});
