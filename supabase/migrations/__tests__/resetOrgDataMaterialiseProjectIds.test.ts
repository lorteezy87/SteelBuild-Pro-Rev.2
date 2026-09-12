import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260912042823_reset_org_data_materialise_project_ids.sql"),
  "utf8",
);
const body = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"));

describe("reset_org_data cursor-lifetime fix", () => {
  it("does not hold a cursor over projects while looping", () => {
    // The 55006 bug: `for v_project in select id from public.projects ... loop`
    // keeps a query live on the table hard_delete_project needs to ALTER.
    expect(body).not.toMatch(/for\s+v_project\s+in\s+select[\s\S]{0,120}from\s+public\.projects/i);
  });

  it("materialises the ids into an array before the loop", () => {
    expect(body).toMatch(/select\s+array_agg\(id\)\s+into\s+v_project_ids/i);
    expect(body).toMatch(/foreach\s+v_project\s+in\s+array\s+coalesce\(v_project_ids/i);
    expect(body.indexOf("array_agg(id)")).toBeLessThan(body.indexOf("foreach v_project"));
  });

  it("survives an organization with no projects", () => {
    // array_agg returns NULL over zero rows; FOREACH over NULL would error.
    expect(body).toMatch(/coalesce\(v_project_ids,\s*'\{\}'::uuid\[\]\)/);
  });

  it("keeps the two earlier fixes", () => {
    expect(body).toMatch(/hard_delete_project\(\s*v_project\s*,\s*'[^']{12,}'\s*\)/);
    expect(body).toMatch(/set\s+is_deleted\s*=\s*true/i);
    expect(body.indexOf("set is_deleted = true")).toBeLessThan(
      body.indexOf("hard_delete_project(v_project,"),
    );
  });

  it("keeps both authorization guards", () => {
    expect(body).toMatch(/user_org_role_at_least\(p_org_id,\s*'owner'\)/);
    expect(body).toMatch(/errcode\s*=\s*'42501'/);
    expect(body).toMatch(/Confirmation text does not match the organization name/);
    expect(body).toMatch(/errcode\s*=\s*'22023'/);
  });

  it("uses CREATE OR REPLACE and redefines nothing else", () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(1);
    expect(migration).not.toMatch(/drop\s+function/i);
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function\s+public\.hard_delete_project/i);
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function\s+public\.erasure_toggle_user_triggers/i);
  });

  it("preserves signature, security context, audit write and return shape", () => {
    expect(body).toMatch(/public\.reset_org_data\(p_org_id uuid, p_confirmation text\)/);
    expect(body).toMatch(/RETURNS jsonb/);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public'/);
    expect(body).toMatch(/insert into public\.account_deletions/);
    for (const key of [
      "projects_deleted",
      "vendors_deleted",
      "note_folders_deleted",
      "invitations_deleted",
    ]) {
      expect(body).toContain(`'${key}'`);
    }
  });

  it("touches no table definition", () => {
    expect(body).not.toMatch(/\bcreate\s+table\b/i);
    expect(body).not.toMatch(/\balter\s+table\b/i);
    expect(body).not.toMatch(/create\s+policy/i);
  });
});
