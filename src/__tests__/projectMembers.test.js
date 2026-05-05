/**
 * projectMembers.test.js — pure-helper coverage for src/lib/projectMembers.js.
 *
 * The page component has its own smoke test in __tests__/components/.
 * This file just exercises the predicates so future changes (renaming a
 * role, adding a new one) trip CI before they reach production.
 */

import { describe, it, expect } from "vitest";
import {
  ALL_ROLES,
  ASSIGNABLE_ROLES,
  DEFAULT_ROLE,
  formatRole,
  getRoleOptions,
  isCurrentUser,
  isValidEmail,
} from "@/lib/projectMembers";

describe("projectMembers — role tables", () => {
  it("ALL_ROLES matches the DB CHECK constraint (079_user_project_roles)", () => {
    expect(ALL_ROLES).toEqual(["owner", "admin", "pm", "field", "viewer"]);
  });

  it("ASSIGNABLE_ROLES excludes 'owner'", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("owner");
    // every assignable role is still a valid DB role
    for (const r of ASSIGNABLE_ROLES) {
      expect(ALL_ROLES).toContain(r);
    }
  });

  it("DEFAULT_ROLE matches the DB column default ('pm')", () => {
    expect(DEFAULT_ROLE).toBe("pm");
    expect(ASSIGNABLE_ROLES).toContain(DEFAULT_ROLE);
  });
});

describe("projectMembers — formatRole", () => {
  it("returns Title Case label for known roles", () => {
    expect(formatRole("owner")).toBe("Owner");
    expect(formatRole("admin")).toBe("Admin");
    expect(formatRole("pm")).toBe("PM");
    expect(formatRole("field")).toBe("Field");
    expect(formatRole("viewer")).toBe("Viewer");
  });

  it("returns em-dash for null / undefined / empty", () => {
    expect(formatRole(null)).toBe("—");
    expect(formatRole(undefined)).toBe("—");
    expect(formatRole("")).toBe("—");
  });

  it("falls through unknown roles unchanged so they don't crash the table", () => {
    expect(formatRole("custom_role")).toBe("custom_role");
  });
});

describe("projectMembers — isCurrentUser", () => {
  it("returns true when ids match", () => {
    expect(isCurrentUser("u-1", "u-1")).toBe(true);
  });

  it("returns false when ids differ", () => {
    expect(isCurrentUser("u-1", "u-2")).toBe(false);
  });

  it("returns false when either side is null/undefined/empty", () => {
    expect(isCurrentUser(null, "u-1")).toBe(false);
    expect(isCurrentUser("u-1", null)).toBe(false);
    expect(isCurrentUser(undefined, undefined)).toBe(false);
    expect(isCurrentUser("", "u-1")).toBe(false);
    expect(isCurrentUser("u-1", "")).toBe(false);
  });
});

describe("projectMembers — getRoleOptions", () => {
  it("returns the assignable roles for a typical (admin) row", () => {
    const opts = getRoleOptions("admin");
    expect(opts.map((o) => o.value)).toEqual(["admin", "pm", "field", "viewer"]);
  });

  it("prepends an existing 'owner' role so the value can still render", () => {
    const opts = getRoleOptions("owner");
    expect(opts[0]).toEqual({ value: "owner", label: "Owner" });
    // and the rest of the assignable roles still follow
    expect(opts.slice(1).map((o) => o.value)).toEqual(ASSIGNABLE_ROLES);
  });

  it("does not duplicate when the current role is already assignable", () => {
    const opts = getRoleOptions("pm");
    const values = opts.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("tolerates a null currentRole without throwing", () => {
    const opts = getRoleOptions(null);
    expect(opts.map((o) => o.value)).toEqual(ASSIGNABLE_ROLES);
  });
});

describe("projectMembers — isValidEmail", () => {
  it("accepts strings containing @", () => {
    expect(isValidEmail("foo@bar.com")).toBe(true);
    expect(isValidEmail("  foo@bar.com  ")).toBe(true);
  });

  it("rejects empties / non-strings / strings without @", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(123)).toBe(false);
  });
});
