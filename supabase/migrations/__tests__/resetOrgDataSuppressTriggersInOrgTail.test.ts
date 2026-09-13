import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260912052502_reset_org_data_suppress_triggers_in_org_tail.sql"),
  "utf8",
);
const start = migration.indexOf("CREATE OR REPLACE FUNCTION");
const executable = migration.slice(start, migration.indexOf("\n$function$;") + "\n$function$;".length);
const body = executable.slice(executable.indexOf("AS $function$"));

const tailTables = [
  "organization_invitations",
  "note_folder_audit_events",
  "note_folder_mutation_receipts",
  "note_folder_migrations",
  "note_folders",
  "vendors",
];

describe("reset_org_data suppresses triggers around the org-level tail", () => {
  it("names every table the tail deletes from", () => {
    const decl = body.slice(body.indexOf("v_tables"), body.indexOf("begin"));
    for (const table of tailTables) {
      expect(decl).toContain(`'${table}'`);
      expect(body).toMatch(new RegExp(`delete from public\\.${table}\\b`));
    }
  });

  it("turns the erasure flag on before toggling, because the toggle refuses otherwise", () => {
    // erasure_toggle_user_triggers raises 42501 unless steelbuild.erasure_rpc is 'on'.
    const setOn = body.indexOf("set_config('steelbuild.erasure_rpc', 'on', true)");
    const disable = body.indexOf("erasure_toggle_user_triggers(v_tables, true)");
    expect(setOn).toBeGreaterThan(-1);
    expect(disable).toBeGreaterThan(-1);
    expect(setOn).toBeLessThan(disable);
  });

  it("suppresses before the first tail delete and restores after the last", () => {
    const disable = body.indexOf("erasure_toggle_user_triggers(v_tables, true)");
    const reenable = body.indexOf("erasure_toggle_user_triggers(v_tables, false, v_disabled)");
    const firstDelete = body.indexOf("delete from public.organization_invitations");
    const lastDelete = body.indexOf("delete from public.vendors");
    expect(disable).toBeLessThan(firstDelete);
    expect(lastDelete).toBeLessThan(reenable);
  });

  it("restores the flag to what it found rather than clearing it", () => {
    expect(body).toMatch(/v_prev\s+text\s*:=\s*coalesce\(current_setting\('steelbuild\.erasure_rpc',\s*true\),\s*''\)/);
    expect(body).toMatch(/set_config\('steelbuild\.erasure_rpc',\s*v_prev,\s*true\)/);
    const reenable = body.indexOf("erasure_toggle_user_triggers(v_tables, false, v_disabled)");
    expect(reenable).toBeLessThan(body.indexOf("set_config('steelbuild.erasure_rpc', v_prev, true)"));
  });

  it("re-enables from the list the disable call returned", () => {
    // Passing a hand-written list instead would silently leave triggers off.
    expect(body).toMatch(/v_disabled\s*:=\s*public\.erasure_toggle_user_triggers\(v_tables,\s*true\)/);
    expect(body).toMatch(/erasure_toggle_user_triggers\(v_tables,\s*false,\s*v_disabled\)/);
  });

  it("does not weaken enforce_vendor_guards instead", () => {
    expect(executable).not.toMatch(/function\s+public\.enforce_vendor_guards/i);
    expect(executable).not.toMatch(/drop\s+trigger/i);
    expect(executable).not.toMatch(/alter\s+table[^;]*trigger/i);
  });

  it("keeps all four earlier fixes", () => {
    // 42883 arity + 23514 reason, P0001 ARCHIVE_FIRST, 55006 cursor lifetime.
    expect(body).toMatch(/hard_delete_project\(\s*v_project\s*,\s*'[^']{12,}'\s*\)/);
    expect(body).toMatch(/set\s+is_deleted\s*=\s*true/i);
    expect(body.indexOf("set is_deleted = true")).toBeLessThan(body.indexOf("hard_delete_project(v_project,"));
    expect(body).toMatch(/select\s+array_agg\(id\)\s+into\s+v_project_ids/i);
    expect(body).toMatch(/foreach\s+v_project\s+in\s+array\s+coalesce\(v_project_ids,\s*'\{\}'::uuid\[\]\)/i);
    expect(body).not.toMatch(/for\s+v_project\s+in\s+select[\s\S]{0,120}from\s+public\.projects/i);
  });

  it("keeps both authorization guards", () => {
    expect(body).toMatch(/user_org_role_at_least\(p_org_id,\s*'owner'\)/);
    expect(body).toMatch(/errcode\s*=\s*'42501'/);
    expect(body).toMatch(/Confirmation text does not match the organization name/);
    expect(body).toMatch(/errcode\s*=\s*'22023'/);
  });

  it("preserves signature, security context, audit write and return shape", () => {
    expect(executable).toMatch(/RETURNS jsonb/);
    expect(executable).toMatch(/SECURITY DEFINER/);
    expect(executable).toMatch(/SET search_path TO 'public'/);
    expect(executable).toMatch(/public\.reset_org_data\(p_org_id uuid, p_confirmation text\)/);
    expect(body).toMatch(/insert into public\.account_deletions/);
    for (const key of ["projects_deleted", "vendors_deleted", "note_folders_deleted", "invitations_deleted"]) {
      expect(body).toContain(`'${key}'`);
    }
  });

  it("locks down EXECUTE grants to authenticated only", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.reset_org_data\(uuid,\s*text\)\s+FROM PUBLIC,\s*anon,\s*authenticated,\s*service_role;/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.reset_org_data\(uuid,\s*text\)\s+TO authenticated;/i,
    );
  });

  it("uses CREATE OR REPLACE and redefines nothing else", () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(migration).not.toMatch(/drop\s+function/i);
    for (const fn of ["hard_delete_project", "hard_delete_organization", "erasure_toggle_user_triggers", "project_row_counts"]) {
      expect(executable).not.toMatch(new RegExp(`replace\\s+function\\s+public\\.${fn}\\b`, "i"));
    }
  });

  it("touches no table definition", () => {
    expect(executable).not.toMatch(/\bcreate\s+table\b/i);
    expect(executable).not.toMatch(/\balter\s+table\b/i);
    expect(executable).not.toMatch(/create\s+policy/i);
  });

  it("records the hard_delete_organization 55006 landmine it deliberately left alone", () => {
    const notApplied = migration.slice(migration.indexOf("-- NOT APPLIED"));
    expect(notApplied).toMatch(/hard_delete_organization/);
    expect(notApplied).toMatch(/55006/);
  });
});
