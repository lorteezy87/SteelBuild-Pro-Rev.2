import { describe, it, expect } from "vitest";
import { parseRealDistance, formatScaleFraction } from "../scaleParse";

describe("parseRealDistance", () => {
  it("returns NaN for empty / nullish input", () => {
    expect(Number.isNaN(parseRealDistance(""))).toBe(true);
    expect(Number.isNaN(parseRealDistance(null))).toBe(true);
    expect(Number.isNaN(parseRealDistance(undefined))).toBe(true);
  });

  it("parses bare numbers as inches", () => {
    expect(parseRealDistance("120")).toBe(120);
    expect(parseRealDistance("10.5")).toBe(10.5);
  });

  it('parses inches with " or in suffix', () => {
    expect(parseRealDistance('120"')).toBe(120);
    expect(parseRealDistance("120 in")).toBe(120);
    expect(parseRealDistance("120 inches")).toBe(120);
  });

  it("parses feet-only with ft suffix", () => {
    expect(parseRealDistance("10ft")).toBe(120);
    expect(parseRealDistance("10 feet")).toBe(120);
  });

  it("parses feet-and-inches in common construction formats", () => {
    expect(parseRealDistance("10'-0")).toBe(120);
    expect(parseRealDistance("10'0\"")).toBe(120);
    expect(parseRealDistance("10' 0")).toBe(120);
    expect(parseRealDistance("10'-6")).toBe(126);
  });

  it("handles fractional inches like 10'-6 1/2", () => {
    expect(parseRealDistance("10'-6 1/2\"")).toBe(126.5);
    expect(parseRealDistance("10'-6 1/4\"")).toBe(126.25);
  });

  it("returns NaN for unparseable garbage", () => {
    expect(Number.isNaN(parseRealDistance("hello"))).toBe(true);
    expect(Number.isNaN(parseRealDistance("abc 123 def"))).toBe(true);
  });
});

describe("formatScaleFraction", () => {
  it("matches standard architectural scales", () => {
    expect(formatScaleFraction(48)).toBe('1/4" = 1\'-0"');
    expect(formatScaleFraction(96)).toBe('1/8" = 1\'-0"');
    expect(formatScaleFraction(24)).toBe('1/2" = 1\'-0"');
    expect(formatScaleFraction(12)).toBe('1" = 1\'-0"');
    expect(formatScaleFraction(192)).toBe('1/16" = 1\'-0"');
  });

  it("snaps near-standard scales within 3% tolerance", () => {
    // 48 ± ~3% should still snap to 1/4" = 1'-0"
    expect(formatScaleFraction(47)).toBe('1/4" = 1\'-0"');
    expect(formatScaleFraction(49)).toBe('1/4" = 1\'-0"');
  });

  it("falls back to 1:X form for non-standard scales", () => {
    expect(formatScaleFraction(60)).toBe("1:60");
    expect(formatScaleFraction(100)).toBe("1:100");
  });
});
