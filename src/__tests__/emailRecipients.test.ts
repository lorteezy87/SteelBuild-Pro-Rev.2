/**
 * emailRecipients.test.ts
 *
 * Unit tests for the email-send recipient validation/normalization helpers.
 * The module lives under supabase/functions/email-send/recipients.ts and has
 * zero Deno-specific imports, so Vitest loads it directly (same approach as
 * llmGateway.test.ts with the llm-proxy router).
 */

import { describe, it, expect } from "vitest";

import {
  isValidEmail,
  normalizeRecipients,
} from "../../supabase/functions/email-send/recipients";

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("first.last@sub.example.co")).toBe(true);
    expect(isValidEmail("tag+filter@example.com")).toBe(true);
  });

  it("trims surrounding whitespace before checking", () => {
    expect(isValidEmail("  a@b.com  ")).toBe(true);
  });

  it("rejects blanks, garbage, and addresses without a dotted domain", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("garbage")).toBe(false);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a @b.com")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(42)).toBe(false);
  });
});

describe("normalizeRecipients", () => {
  it("trims, drops blanks, and keeps valid addresses", () => {
    const { valid, invalid } = normalizeRecipients([" a@b.com ", "", "  "]);
    expect(valid).toEqual(["a@b.com"]);
    expect(invalid).toEqual([]);
  });

  it("separates invalid addresses (non-blank, non-email)", () => {
    const { valid, invalid } = normalizeRecipients(["good@x.com", "garbage", "a@b"]);
    expect(valid).toEqual(["good@x.com"]);
    expect(invalid).toEqual(["garbage", "a@b"]);
  });

  it("de-duplicates case-insensitively, keeping first occurrence", () => {
    const { valid } = normalizeRecipients(["A@B.com", "a@b.com", "c@d.com"]);
    expect(valid).toEqual(["A@B.com", "c@d.com"]);
  });

  it("returns empty lists for non-array input", () => {
    expect(normalizeRecipients(null)).toEqual({ valid: [], invalid: [] });
    expect(normalizeRecipients(undefined)).toEqual({ valid: [], invalid: [] });
    expect(normalizeRecipients("a@b.com")).toEqual({ valid: [], invalid: [] });
  });

  it("coerces non-string entries before validating", () => {
    const { valid, invalid } = normalizeRecipients([123, { x: 1 }]);
    expect(valid).toEqual([]);
    expect(invalid).toEqual(["123", "[object Object]"]);
  });
});
