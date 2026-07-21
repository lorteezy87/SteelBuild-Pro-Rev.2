import { describe, expect, it } from "vitest";

import {
  isValidEmail,
  normalizeRecipients,
} from "../../supabase/functions/email-send/recipients";

describe("isValidEmail", () => {
  it("accepts ordinary addresses and surrounding whitespace", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("first.last@sub.example.co")).toBe(true);
    expect(isValidEmail("tag+filter@example.com")).toBe(true);
    expect(isValidEmail("  a@b.com  ")).toBe(true);
  });

  it("rejects blanks, malformed addresses, and non-string input", () => {
    for (const value of [
      "",
      "   ",
      "garbage",
      "no-at-sign.com",
      "a@b",
      "a @b.com",
      null,
      undefined,
      42,
    ]) {
      expect(isValidEmail(value)).toBe(false);
    }
  });
});

describe("normalizeRecipients", () => {
  it("trims, drops blanks, and separates malformed addresses", () => {
    expect(normalizeRecipients([" a@b.com ", "", "  ", "garbage", "a@b"])).toEqual({
      valid: ["a@b.com"],
      invalid: ["garbage", "a@b"],
    });
  });

  it("de-duplicates case-insensitively and keeps the first occurrence", () => {
    expect(normalizeRecipients(["A@B.com", "a@b.com", "c@d.com"]).valid).toEqual([
      "A@B.com",
      "c@d.com",
    ]);
  });

  it("returns empty lists for non-array input", () => {
    expect(normalizeRecipients(null)).toEqual({ valid: [], invalid: [] });
    expect(normalizeRecipients(undefined)).toEqual({ valid: [], invalid: [] });
    expect(normalizeRecipients("a@b.com")).toEqual({ valid: [], invalid: [] });
  });

  it("coerces non-string entries before validation", () => {
    expect(normalizeRecipients([123, { x: 1 }])).toEqual({
      valid: [],
      invalid: ["123", "[object Object]"],
    });
  });
});
