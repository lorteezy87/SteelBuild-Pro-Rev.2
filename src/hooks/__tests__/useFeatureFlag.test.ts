/**
 * Tests for resolveFlagsForEmail — the pure resolver used by useAllFlags.
 *
 * The hook itself just wraps this helper in a React Query — pinning behaviour
 * here means we can refactor the hook (e.g. swap caching strategies, add
 * Realtime, etc.) without breaking the override-precedence contract that
 * UI code depends on.
 */

import { describe, it, expect } from "vitest";
import { resolveFlagsForEmail, type FeatureFlagRow } from "../useFeatureFlag";

const rows: FeatureFlagRow[] = [
  { flag_key: "global_on",  enabled: true,  user_overrides: {} },
  { flag_key: "global_off", enabled: false, user_overrides: {} },
  {
    flag_key: "user_off_when_global_on",
    enabled: true,
    user_overrides: { "alice@example.com": false },
  },
  {
    flag_key: "user_on_when_global_off",
    enabled: false,
    user_overrides: { "bob@example.com": true },
  },
  {
    flag_key: "non_boolean_override_ignored",
    enabled: true,
    user_overrides: { "alice@example.com": "yes" },
  },
  {
    flag_key: "case_insensitive_override",
    enabled: false,
    user_overrides: { "Bob@Example.com": true },
  },
  {
    flag_key: "null_overrides_ok",
    enabled: true,
    user_overrides: null,
  },
];

describe("resolveFlagsForEmail", () => {
  it("falls back to enabled when no email is supplied", () => {
    const map = resolveFlagsForEmail(rows, null);
    expect(map.get("global_on")).toBe(true);
    expect(map.get("global_off")).toBe(false);
    // Overrides are skipped without an email
    expect(map.get("user_off_when_global_on")).toBe(true);
    expect(map.get("user_on_when_global_off")).toBe(false);
  });

  it("applies a per-user override that flips a global-on flag off", () => {
    const map = resolveFlagsForEmail(rows, "alice@example.com");
    expect(map.get("global_on")).toBe(true); // unrelated row
    expect(map.get("user_off_when_global_on")).toBe(false); // override wins
  });

  it("applies a per-user override that flips a global-off flag on", () => {
    const map = resolveFlagsForEmail(rows, "bob@example.com");
    expect(map.get("global_off")).toBe(false); // unrelated row
    expect(map.get("user_on_when_global_off")).toBe(true); // override wins
  });

  it("ignores non-boolean override values (falls back to enabled)", () => {
    const map = resolveFlagsForEmail(rows, "alice@example.com");
    expect(map.get("non_boolean_override_ignored")).toBe(true);
  });

  it("matches override emails case-insensitively", () => {
    const map = resolveFlagsForEmail(rows, "BOB@example.com");
    expect(map.get("case_insensitive_override")).toBe(true);
    expect(map.get("user_on_when_global_off")).toBe(true);
  });

  it("tolerates null/non-object user_overrides without crashing", () => {
    const map = resolveFlagsForEmail(rows, "alice@example.com");
    expect(map.get("null_overrides_ok")).toBe(true);
  });

  it("does not consult overrides for users without a matching key", () => {
    const map = resolveFlagsForEmail(rows, "carol@example.com");
    expect(map.get("user_off_when_global_on")).toBe(true);
    expect(map.get("user_on_when_global_off")).toBe(false);
  });

  it("skips rows missing a flag_key", () => {
    const bad: FeatureFlagRow[] = [
      ...rows,
      // @ts-expect-error testing runtime tolerance
      { enabled: true, user_overrides: {} },
      { flag_key: "", enabled: true, user_overrides: {} },
    ];
    const map = resolveFlagsForEmail(bad, null);
    expect(map.has("")).toBe(false);
    expect(map.size).toBe(rows.length);
  });

  it("treats a null `enabled` as false", () => {
    const map = resolveFlagsForEmail(
      [{ flag_key: "explicit_null", enabled: null, user_overrides: {} }],
      null,
    );
    expect(map.get("explicit_null")).toBe(false);
  });
});
