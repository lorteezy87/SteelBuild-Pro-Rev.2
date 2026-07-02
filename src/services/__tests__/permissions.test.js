/**
 * permissions.test.js — RBAC gate (canPerform) decision matrix.
 *
 * canPerform is UI-gating only (the authoritative guard is workflowEngine),
 * but it still drives what users see, so its role × action × entity logic is
 * worth pinning down.
 */

import { describe, it, expect, vi } from "vitest";

// permissions.js imports the supabase client at module load; stub it so the
// pure logic can be tested without env vars or a real client.
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));

import { canPerform } from "../permissions";

describe("canPerform — action floors", () => {
  it("admin can do everything, including delete and void", () => {
    for (const action of ["create", "edit", "delete", "approve", "void", "export", "view", "bulk_delete"]) {
      expect(canPerform("admin", action)).toBe(true);
    }
  });

  it("viewer can only view", () => {
    expect(canPerform("viewer", "view")).toBe(true);
    expect(canPerform("viewer", "export")).toBe(false);
    expect(canPerform("viewer", "create")).toBe(false);
    expect(canPerform("viewer", "edit")).toBe(false);
    expect(canPerform("viewer", "delete")).toBe(false);
  });

  it("pm can create/edit/approve but not delete or void", () => {
    expect(canPerform("pm", "create")).toBe(true);
    expect(canPerform("pm", "edit")).toBe(true);
    expect(canPerform("pm", "approve")).toBe(true);
    expect(canPerform("pm", "bulk_update")).toBe(true);
    expect(canPerform("pm", "delete")).toBe(false);
    expect(canPerform("pm", "void")).toBe(false);
    expect(canPerform("pm", "bulk_delete")).toBe(false);
  });

  it("field can export and view but not create/edit generically", () => {
    expect(canPerform("field", "export")).toBe(true);
    expect(canPerform("field", "view")).toBe(true);
    expect(canPerform("field", "create")).toBe(false);
    expect(canPerform("field", "edit")).toBe(false);
  });
});

describe("canPerform — global user_profiles roles", () => {
  // usePermissions reads user_profiles.role, which only ever holds the GLOBAL
  // values 'admin' or 'user'. A regular 'user' must map to a productive,
  // PM-level rank — not deny-all (the old bug ranked 'user' at 99, hiding every
  // create/edit/delete control across the app).
  it("global 'user' can do normal PM-level work", () => {
    expect(canPerform("user", "view")).toBe(true);
    expect(canPerform("user", "create")).toBe(true);
    expect(canPerform("user", "edit")).toBe(true);
    expect(canPerform("user", "approve")).toBe(true);
    expect(canPerform("user", "export")).toBe(true);
    expect(canPerform("user", "create", "delivery")).toBe(true);
  });

  it("global 'user' is still blocked from destructive admin-only actions", () => {
    expect(canPerform("user", "delete")).toBe(false);
    expect(canPerform("user", "void")).toBe(false);
    expect(canPerform("user", "bulk_delete")).toBe(false);
    expect(canPerform("user", "void", "change_order")).toBe(false);
  });

  it("global 'admin' retains full control and 'owner' mirrors admin", () => {
    expect(canPerform("admin", "delete")).toBe(true);
    expect(canPerform("owner", "delete")).toBe(true);
    expect(canPerform("owner", "void", "change_order")).toBe(true);
  });
});

describe("canPerform — entity overrides", () => {
  it("field can create/edit deliveries, expenses, and RFIs via override", () => {
    expect(canPerform("field", "create", "delivery")).toBe(true);
    expect(canPerform("field", "edit", "delivery")).toBe(true);
    expect(canPerform("field", "create", "expense")).toBe(true);
    expect(canPerform("field", "edit", "expense")).toBe(true);
    expect(canPerform("field", "create", "rfi")).toBe(true);
    expect(canPerform("field", "edit", "rfi")).toBe(true);
  });

  it("override raises the bar where stricter (drawing delete needs pm)", () => {
    expect(canPerform("pm", "delete", "drawing")).toBe(true);
    expect(canPerform("field", "delete", "drawing")).toBe(false);
    expect(canPerform("pm", "approve", "change_order")).toBe(true);
    expect(canPerform("field", "approve", "change_order")).toBe(false);
    expect(canPerform("pm", "void", "change_order")).toBe(false);
    expect(canPerform("admin", "void", "change_order")).toBe(true);
  });

  it("budget_hour_item lets a pm delete (matches its pm-floor RLS)", () => {
    // budget_hour_items RLS = user_has_project_role_at_least(project_id,'pm')
    // for INSERT/UPDATE/DELETE, so a project PM must be able to delete (the
    // generic delete floor is admin — the override lowers it to pm).
    expect(canPerform("pm", "create", "budget_hour_item")).toBe(true);
    expect(canPerform("pm", "edit", "budget_hour_item")).toBe(true);
    expect(canPerform("pm", "delete", "budget_hour_item")).toBe(true);
    // field / viewer are still below the pm floor.
    expect(canPerform("field", "create", "budget_hour_item")).toBe(false);
    expect(canPerform("field", "delete", "budget_hour_item")).toBe(false);
    expect(canPerform("viewer", "delete", "budget_hour_item")).toBe(false);
    // owner/admin remain able to delete.
    expect(canPerform("admin", "delete", "budget_hour_item")).toBe(true);
    expect(canPerform("owner", "delete", "budget_hour_item")).toBe(true);
  });

  it("override only applies to its own entity:action, not other entities", () => {
    // field gets delivery:create via override, but not a generic widget:create
    expect(canPerform("field", "create", "widget")).toBe(false);
    // viewer is still denied even on overridden entities
    expect(canPerform("viewer", "create", "delivery")).toBe(false);
  });
});

describe("canPerform — defensive defaults", () => {
  it("unknown role is denied everything (including view)", () => {
    expect(canPerform("superuser", "view")).toBe(false);
    expect(canPerform(undefined, "view")).toBe(false);
    expect(canPerform(null, "create")).toBe(false);
  });

  it("unknown action falls back to an admin-only floor", () => {
    expect(canPerform("admin", "frobnicate")).toBe(true);
    expect(canPerform("pm", "frobnicate")).toBe(false);
    expect(canPerform("viewer", "frobnicate")).toBe(false);
  });
});
