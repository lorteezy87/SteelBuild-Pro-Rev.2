import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260912062606_hard_delete_organization_cursor_and_note_folders.sql"),
  "utf8",
);
const start = migration.indexOf("CREATE OR REPLACE FUNCTION");
const executable = migration.slice(start, migration.indexOf("end $function$;") + "end $function$;".length);
const body = executable.slice(executable.indexOf("AS $function$"));

describe("hard_delete_organization: 55006 cursor + note_folders RESTRICT", () => {
  it("no longer holds a cursor over projects while erasing them", () => {
    expect(body).not.toMatch(/for\s+v_project\s+in\s+select[\s\S]{0,120}from\s+public\.projects/i);
    expect(body).toMatch(/select\s+array_agg\(id\)\s+into\s+v_project_ids/i);
    expect(body).toMatch(/foreach\s+v_project\s+in\s+array\s+coalesce\(v_project_ids,\s*'\{\}'::uuid\[\]\)/i);
    expect(body.indexOf("array_agg(id)")).toBeLessThan(body.indexOf("foreach v_project"));
  });

  it("still erases each project through hard_delete_project with the caller's reason", () => {
    expect(body).toMatch(/public\.hard_delete_project\(v_project,\s*p_reason\)/);
    expect(body).toMatch(/'row_counts'/);
  });

  it("clears the note_folder satellites before the folders themselves", () => {
    const satellites = [
      "note_folder_audit_events",
      "note_folder_mutation_receipts",
      "note_folder_migrations",
    ];
    for (const t of satellites) {
      expect(body).toMatch(new RegExp(`delete from public\\.${t}\\s+where org_id = p_org_id`));
      expect(body.indexOf(`delete from public.${t}`)).toBeLessThan(body.indexOf("for v_pass in 1..12 loop"));
    }
  });

  it("peels the folder tree leaf-first, because parent_folder_id is ON DELETE RESTRICT", () => {
    expect(body).toMatch(/for v_pass in 1\.\.12 loop/);
    expect(body).toMatch(/not exists \(select 1 from public\.note_folders c\s*\n\s*where c\.parent_folder_id = f\.id/);
    expect(body).toMatch(/get diagnostics v_removed = row_count/);
    expect(body).toMatch(/exit when v_removed = 0/);
  });

  it("keeps a final unguarded folder delete so a real blocker still raises", () => {
    const loopEnd = body.indexOf("exit when v_removed = 0;");
    const finalDelete = body.indexOf("delete from public.note_folders where org_id = p_org_id;");
    expect(finalDelete).toBeGreaterThan(loopEnd);
  });

  it("suppresses triggers on every table the tail touches", () => {
    const decl = body.slice(body.indexOf("v_tables text[]"), body.indexOf("begin"));
    for (const t of [
      "billing_events",
      "organization_invitations",
      "note_folder_audit_events",
      "note_folder_mutation_receipts",
      "note_folder_migrations",
      "note_folders",
      "vendors",
      "organization_members",
      "organizations",
    ]) {
      expect(decl).toContain(`'${t}'`);
    }
  });

  it("orders the tail so organizations goes last", () => {
    const orgDelete = body.indexOf("delete from public.organizations where id = p_org_id;");
    for (const t of ["billing_events", "organization_invitations", "note_folders", "vendors", "organization_members"]) {
      expect(body.indexOf(`delete from public.${t}`)).toBeLessThan(orgDelete);
    }
  });

  it("keeps every authorization and safety guard", () => {
    expect(body).toMatch(/user_org_role_at_least\(p_org_id, 'owner'\)/);
    expect(body).toMatch(/errcode = '42501'/);
    expect(body).toMatch(/A written reason \(12\+ characters\) is required/);
    expect(body).toMatch(/errcode = '23514'/);
    expect(body).toMatch(/ARCHIVE_FIRST:/);
    expect(body).toMatch(/errcode = 'P0001'/);
  });

  it("keeps both audit writes and restores the flag", () => {
    expect(body).toMatch(/insert into public\.data_erasure_log/);
    expect(body).toMatch(/insert into public\.account_deletions/);
    expect(body).toMatch(/set_config\('steelbuild\.erasure_rpc', 'on', true\)/);
    expect(body).toMatch(/set_config\('steelbuild\.erasure_rpc', v_prev, true\)/);
    expect(body).toMatch(/erasure_toggle_user_triggers\(v_tables, false, v_disabled\)/);
  });

  it("preserves signature, security context and return shape", () => {
    expect(executable).toMatch(/public\.hard_delete_organization\(p_org_id uuid, p_reason text\)/);
    expect(executable).toMatch(/RETURNS jsonb/);
    expect(executable).toMatch(/SECURITY DEFINER/);
    expect(executable).toMatch(/SET search_path TO ''/);
    expect(body).toMatch(/jsonb_build_object\('org_id', p_org_id, 'projects_erased', v_count\)/);
  });

  it("uses CREATE OR REPLACE and redefines nothing else", () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(migration).not.toMatch(/drop\s+function/i);
    for (const fn of ["hard_delete_project", "reset_org_data", "erasure_toggle_user_triggers"]) {
      expect(executable).not.toMatch(new RegExp(`replace\\s+function\\s+public\\.${fn}\\b`, "i"));
    }
  });

  it("touches no table, policy or trigger definition", () => {
    expect(executable).not.toMatch(/\bcreate\s+table\b/i);
    expect(executable).not.toMatch(/\balter\s+table\b/i);
    expect(executable).not.toMatch(/create\s+policy/i);
    expect(executable).not.toMatch(/\b(create|drop)\s+trigger\b/i);
  });

  it("records that account-delete is still undeployed, so the UI stays broken", () => {
    const notApplied = migration.slice(migration.indexOf("-- NOT APPLIED"));
    expect(notApplied).toMatch(/account-delete/);
    expect(notApplied).toMatch(/DeleteAccountZone/);
    expect(migration).toMatch(/reset_org_data shares the note_folders self-FK exposure/);
  });
});
