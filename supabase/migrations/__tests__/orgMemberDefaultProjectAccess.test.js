import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260819001000_org_member_default_project_access.sql"),
  "utf8",
);

describe("org_member_default_project_access migration", () => {
  it("adds a constrained member_default_project_role column with viewer default", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS member_default_project_role text DEFAULT 'viewer'/i);
    expect(migration).toMatch(/CHECK \(\s*member_default_project_role IS NULL\s*OR member_default_project_role IN \('viewer', 'field', 'pm'\)\s*\)/i);
  });

  it("keeps the archive gate and initplan-safe auth.uid() in user_has_project_access", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.user_has_project_access/i);
    expect(migration).toMatch(/coalesce\(\s*p\.is_deleted\s*,\s*false\s*\)\s*=\s*false/i);
    // Every auth.uid() call is initplan-wrapped in (SELECT ...)
    const total = (migration.match(/auth\.uid\(\)/g) || []).length;
    const wrapped = (migration.match(/\(select auth\.uid\(\)\)/gi) || []).length;
    expect(total).toBeGreaterThan(0);
    expect(wrapped).toBe(total);
    // Org default grants visibility without a user_projects row
    expect(migration).toMatch(/o\.member_default_project_role IS NOT NULL/);
  });

  it("resolves roles as explicit row → org owner/admin → org default", () => {
    const roleFn = migration.slice(migration.indexOf("get_my_project_role"));
    const explicitIdx = roleFn.indexOf("FROM public.user_projects");
    const orgAdminIdx = roleFn.indexOf("om.role IN ('owner', 'admin')");
    const defaultIdx = roleFn.indexOf("o.member_default_project_role");
    expect(explicitIdx).toBeGreaterThan(-1);
    expect(orgAdminIdx).toBeGreaterThan(explicitIdx);
    expect(defaultIdx).toBeGreaterThan(orgAdminIdx);
  });

  it("lets the org default participate in the role ladder ONLY without an explicit row", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.user_has_project_role_at_least/i);
    expect(migration).toMatch(/NOT EXISTS \(SELECT 1 FROM explicit_role\)/);
    expect(migration).toMatch(/default_role/);
    // ladder unchanged
    expect(migration).toMatch(/VALUES \('viewer', 0\), \('field', 1\), \('pm', 2\), \('admin', 3\), \('owner', 3\)/);
  });

  it("pins search_path and SECURITY DEFINER on every replaced function", () => {
    const definerCount = (migration.match(/SECURITY DEFINER/g) || []).length;
    const searchPathCount = (migration.match(/SET search_path TO 'public'/g) || []).length;
    expect(definerCount).toBe(3);
    expect(searchPathCount).toBe(3);
  });
});
