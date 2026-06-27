/**
 * Tests for `roleAtLeast` — the pure rank helper used by useProjectRole and
 * by useAppSecurity. Mirrors the SQL `user_has_project_role_at_least` helper:
 *   - 'owner' is a synonym for 'admin' (level 3)
 *   - viewer < field < pm < admin = owner
 *   - null/undefined/unknown roles fall below 'viewer' so they never satisfy
 *     a non-trivial check.
 *
 * The hook itself wraps a Supabase RPC and is covered by integration; we
 * pin only the pure helper here.
 */

import { describe, it, expect } from "vitest";
import { roleAtLeast } from "../useProjectRole";

describe("roleAtLeast", () => {
  it("treats 'owner' as a synonym for 'admin'", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("owner", "pm")).toBe(true);
    expect(roleAtLeast("owner", "viewer")).toBe(true);
  });

  it("admin satisfies pm and below", () => {
    expect(roleAtLeast("admin", "pm")).toBe(true);
    expect(roleAtLeast("admin", "admin")).toBe(true);
    expect(roleAtLeast("admin", "field")).toBe(true);
  });

  it("pm does NOT satisfy admin", () => {
    expect(roleAtLeast("pm", "admin")).toBe(false);
  });

  it("viewer does NOT satisfy pm", () => {
    expect(roleAtLeast("viewer", "pm")).toBe(false);
  });

  it("null is below every threshold", () => {
    expect(roleAtLeast(null, "viewer")).toBe(false);
    expect(roleAtLeast(null, "admin")).toBe(false);
  });

  it("undefined is below every threshold", () => {
    expect(roleAtLeast(undefined, "viewer")).toBe(false);
  });

  it("unknown role names rank below viewer", () => {
    expect(roleAtLeast("garbage", "viewer")).toBe(false);
    expect(roleAtLeast("superuser", "admin")).toBe(false);
  });

  it("unknown threshold names are unsatisfiable", () => {
    // Defensive: if the caller passes an unknown threshold we should fail
    // closed rather than silently grant.
    expect(roleAtLeast("admin", "godmode")).toBe(false);
  });
});
