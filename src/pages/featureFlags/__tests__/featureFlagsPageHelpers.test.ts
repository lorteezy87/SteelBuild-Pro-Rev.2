import { describe, expect, it } from "vitest";
import {
  coerceOverrides,
  countEnabledFlags,
  countOverrideEntries,
  isValidOverrideEmail,
  isValidFlagKey,
  mergeOverride,
  removeOverride,
} from "../featureFlagsPageHelpers";

describe("featureFlagsPageHelpers", () => {
  it("coerceOverrides and counts", () => {
    expect(coerceOverrides(null)).toEqual({});
    expect(coerceOverrides(["x"])).toEqual({});
    expect(coerceOverrides({ "A@x.com": true, bad: "no", "": true, ok: false })).toEqual({
      "a@x.com": true,
      ok: false,
    });
    const flags = [
      { enabled: true, user_overrides: { a: true, b: false } },
      { enabled: false, user_overrides: { c: true } },
      { enabled: true, user_overrides: null },
    ];
    expect(countEnabledFlags(flags)).toBe(2);
    expect(countOverrideEntries(flags)).toBe(3);
  });

  it("validators and override mutators", () => {
    expect(isValidOverrideEmail("x@y.com")).toBe(true);
    expect(isValidOverrideEmail("nope")).toBe(false);
    expect(isValidFlagKey("beta_flag_1")).toBe(true);
    expect(isValidFlagKey("Bad Key")).toBe(false);
    expect(mergeOverride({ a: true }, "B@x.com", false)).toEqual({ a: true, "b@x.com": false });
    expect(removeOverride({ a: true, b: false }, "a")).toEqual({ b: false });
  });
});

import { createEmptyFlagDraft, createEmptyOverrideDraft } from "../featureFlagsPageHelpers";

describe("flag drafts", () => {
  it("creates empty drafts", () => {
    expect(createEmptyFlagDraft().flag_key).toBe("");
    expect(createEmptyOverrideDraft().enabled).toBe(true);
  });
});

import { nextOverrideDrafts, nextNewFlagField } from "../featureFlagsPageHelpers";

describe("draft mutators", () => {
  it("patches new flag and override drafts", () => {
    expect(nextNewFlagField({ a: 1 }, "a", 2).a).toBe(2);
    const d = nextOverrideDrafts({}, "f1", { email: "a@b.com" });
    expect(d.f1.email).toBe("a@b.com");
    expect(d.f1.enabled).toBe(true);
  });
});
