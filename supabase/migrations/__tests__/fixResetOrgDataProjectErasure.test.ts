import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260912034015_fix_reset_org_data_project_erasure.sql"),
  "utf8",
);

// Only the function body executes; everything after the closing $function$; is
// the NOT APPLIED commentary, which names things this migration must not do.
const body = migration.slice(
  migration.indexOf("CREATE OR REPLACE FUNCTION"),
  migration.indexOf("-- NOT APPLIED"),
);

describe("reset_org_data erasure fix", () => {
  it("calls hard_delete_project with both required arguments", () => {
    // The original bug: hard_delete_project(v_project) — one argument, 42883.
    expect(body).toMatch(/hard_delete_project\(\s*v_project\s*,\s*'[^']+'\s*\)/);
    expect(body).not.toMatch(/hard_delete_project\(\s*v_project\s*\)/);
  });

  it("passes a reason long enough to clear the 12-character check", () => {
    const call = body.match(/hard_delete_project\(\s*v_project\s*,\s*'([^']+)'\s*\)/);
    expect(call).not.toBeNull();
    expect(call![1].trim().length).toBeGreaterThanOrEqual(12);
  });

  it("archives each project before erasing it, clearing ARCHIVE_FIRST", () => {
    // hard_delete_project raises P0001 unless is_deleted is already true.
    const archive = body.match(/update\s+public\.projects[\s\S]*?set\s+is_deleted\s*=\s*true[\s\S]*?;/i);
    expect(archive).not.toBeNull();
    // The archive must come before the erase, not after.
    expect(body.indexOf("set is_deleted = true")).toBeLessThan(
      body.indexOf("hard_delete_project(v_project,"),
    );
  });

  it("does not weaken hard_delete_project's ARCHIVE_FIRST guard", () => {
    // The guard lives in hard_delete_project, which this migration must not
    // redefine or alter — it only satisfies the guard by archiving first.
    // ARCHIVE_FIRST is named in a comment here on purpose, so assert on the
    // definition, not on the string.
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function\s+public\.hard_delete_project/i);
    expect(migration).not.toMatch(/alter\s+function\s+public\.hard_delete_project/i);
    expect(migration.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(1);
  });

  it("keeps both authorization guards intact", () => {
    expect(body).toMatch(/user_org_role_at_least\(p_org_id,\s*'owner'\)/);
    expect(body).toMatch(/errcode\s*=\s*'42501'/);
    expect(body).toMatch(/Confirmation text does not match the organization name/);
    expect(body).toMatch(/errcode\s*=\s*'22023'/);
  });

  it("uses CREATE OR REPLACE so the authenticated EXECUTE grant survives", () => {
    // DROP + CREATE would reset proacl and silently revoke the RPC's grant.
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION public\.reset_org_data\(p_org_id uuid, p_confirmation text\)/);
    expect(migration).not.toMatch(/drop\s+function/i);
  });

  it("preserves the signature, security context and search_path", () => {
    expect(body).toMatch(/RETURNS jsonb/);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public'/);
  });

  it("keeps the audit write and the original return shape", () => {
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

  it("still cleans up invitations, note folders and vendors", () => {
    expect(body).toMatch(/delete from public\.organization_invitations/);
    expect(body).toMatch(/delete from public\.note_folders\b/);
    expect(body).toMatch(/delete from public\.vendors/);
  });

  it("touches no table definition and no other function", () => {
    expect(body).not.toMatch(/\bcreate\s+table\b/i);
    expect(body).not.toMatch(/\balter\s+table\b/i);
    expect(body).not.toMatch(/create\s+policy/i);
  });
});
