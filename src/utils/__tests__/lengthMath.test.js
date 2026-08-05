/**
 * Unit tests for lengthMath.js
 *
 * Covers the spec cases from C1: parseLength, formatLength, tick
 * constants, and decimal-feet/inches conversion helpers.
 */

import { describe, it, expect } from "vitest";
import {
  TICKS_PER_INCH,
  TICKS_PER_FOOT,
  parseLength,
  formatLength,
  ticksToDecimalFeet,
  ticksToDecimalInches,
  decimalFeetToTicks,
} from "../lengthMath";

// ── Constants ────────────────────────────────────────────────────────

describe("constants", () => {
  it("TICKS_PER_INCH === 32", () => {
    expect(TICKS_PER_INCH).toBe(32);
  });
  it("TICKS_PER_FOOT === 384", () => {
    expect(TICKS_PER_FOOT).toBe(384);
  });
});

// ── parseLength ──────────────────────────────────────────────────────

describe("parseLength", () => {
  // Spec: parseLength("12'6 1/2\"") === 4816
  // 12*384 + 6*32 + 16 = 4608 + 192 + 16 = 4816
  it("parses apostrophe-quote form  12'6 1/2\"  → 4816", () => {
    expect(parseLength("12'6 1/2\"")).toBe(4816);
  });

  it("parses dash-separated form  12-6-1/2  → 4816", () => {
    expect(parseLength("12-6-1/2")).toBe(4816);
  });

  it("parses space-separated form  12 6 1/2  → 4816", () => {
    expect(parseLength("12 6 1/2")).toBe(4816);
  });

  // Spec: bare "150" → Math.round(150*32)
  it("treats bare integer as inches: 150 → 4800", () => {
    expect(parseLength("150")).toBe(Math.round(150 * 32));
  });

  // Spec: "6.5\"" → Math.round(6.5*32)
  it('parses decimal inches with explicit "  6.5" → 208', () => {
    expect(parseLength('6.5"')).toBe(Math.round(6.5 * 32));
  });

  // Spec: "8.25ft" → Math.round(8.25*384)
  it("parses decimal feet suffix: 8.25ft → Math.round(8.25*384)", () => {
    expect(parseLength("8.25ft")).toBe(Math.round(8.25 * 384));
  });

  // Spec: "abc" and "" → null
  it("returns null for unparseable string", () => {
    expect(parseLength("abc")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseLength("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseLength(null)).toBeNull();
  });

  // Additional sanity cases
  it("parses bare feet: 12' → 4608", () => {
    expect(parseLength("12'")).toBe(12 * 384);
  });

  it("parses whole feet+inches without fraction: 8'4\" → 8*384+4*32", () => {
    expect(parseLength(`8'4"`)).toBe(8 * 384 + 4 * 32);
  });

  it("handles negative lengths: -6' → -2304", () => {
    expect(parseLength("-6'")).toBe(-6 * 384);
  });
});

// ── formatLength ─────────────────────────────────────────────────────

describe("formatLength", () => {
  // Spec: formatLength(4816,16) contains "12'" and "6 1/2\""
  it("formats 4816 ticks at 1/16 → contains 12' and 6 1/2\"", () => {
    const result = formatLength(4816, 16);
    expect(result).toContain("12'");
    expect(result).toContain(`6 1/2"`);
  });

  // Spec: formatLength(6*32+1, 16) contains "6\""
  // 6*32+1 = 193 ticks, at 1/16 precision rounds to 6" (nearest 2-tick step)
  it("formats 6*32+1 ticks at 1/16 → contains 6\"", () => {
    const result = formatLength(6 * 32 + 1, 16);
    expect(result).toContain(`6"`);
  });

  it("formats 0 ticks → 0'-0\"", () => {
    const result = formatLength(0, 16);
    expect(result).toBe("0'-0\"");
  });

  it("returns — for null", () => {
    expect(formatLength(null)).toBe("—");
  });

  it("returns — for NaN", () => {
    expect(formatLength(NaN)).toBe("—");
  });

  it("defaults precisionDen to 16", () => {
    // Same as explicit 16
    expect(formatLength(4816)).toBe(formatLength(4816, 16));
  });

  it("round-trips: parseLength → formatLength gives recognizable result", () => {
    const ticks = parseLength("12'6 1/2\"");
    const str = formatLength(ticks, 16);
    expect(str).toBe("12'-6 1/2\"");
  });
});

// ── Conversion helpers ───────────────────────────────────────────────

describe("ticksToDecimalFeet", () => {
  it("ticksToDecimalFeet(384) === 1", () => {
    expect(ticksToDecimalFeet(384)).toBe(1);
  });

  it("ticksToDecimalFeet(0) === 0", () => {
    expect(ticksToDecimalFeet(0)).toBe(0);
  });

  it("ticksToDecimalFeet(192) === 0.5 (half a foot)", () => {
    expect(ticksToDecimalFeet(192)).toBe(0.5);
  });
});

describe("ticksToDecimalInches", () => {
  it("ticksToDecimalInches(32) === 1", () => {
    expect(ticksToDecimalInches(32)).toBe(1);
  });

  it("ticksToDecimalInches(0) === 0", () => {
    expect(ticksToDecimalInches(0)).toBe(0);
  });

  it("ticksToDecimalInches(16) === 0.5 (half an inch)", () => {
    expect(ticksToDecimalInches(16)).toBe(0.5);
  });
});

describe("decimalFeetToTicks", () => {
  it("decimalFeetToTicks(1) === 384", () => {
    expect(decimalFeetToTicks(1)).toBe(384);
  });

  it("decimalFeetToTicks(0) === 0", () => {
    expect(decimalFeetToTicks(0)).toBe(0);
  });

  it("decimalFeetToTicks(0.5) === 192", () => {
    expect(decimalFeetToTicks(0.5)).toBe(192);
  });

  it("decimalFeetToTicks(12.5) rounds correctly", () => {
    expect(decimalFeetToTicks(12.5)).toBe(Math.round(12.5 * 384));
  });
});
