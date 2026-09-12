import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260912055243_hard_delete_project_dependency_ordered_deletes.sql"),
  "utf8",
);
const start = migration.indexOf("CREATE OR REPLACE FUNCTION");
const end = migration.indexOf("end $function$;") + "end $function$;".length;
const executable = migration.slice(start, end);
const body = executable.slice(executable.indexOf("AS $function$"));

describe("hard_delete_project deletes in dependency order", () => {
  it("no longer excludes tables that cascade from projects", () => {
    // The exclusion is what made the pieces delete unsatisfiable: model_elements,
    // piece_import_rows and piece_station_completions all cascade from projects
    // AND hold NO ACTION / RESTRICT keys into pieces, which IS deleted here.
    expect(body).not.toMatch(/confdeltype\s*=\s*'c'/);
    expect(body).not.toMatch(/not\s+exists\s*\([\s\S]{0,200}pg_constraint/i);
  });

  it("enumerates every project-scoped table, deterministically ordered", () => {
    expect(body).toMatch(/c\.column_name\s*=\s*'project_id'/);
    expect(body).toMatch(/c\.table_name not in \('projects', 'data_erasure_log'\)/);
    expect(body).toMatch(/order by c\.table_name/);
  });

  it("retries refused tables instead of trusting one pass", () => {
    expect(body).toMatch(/for v_pass in 1\.\.12 loop/);
    expect(body).toMatch(/v_blocked\s*:=\s*v_blocked\s*\|\|\s*v_table/);
    expect(body).toMatch(/v_pending\s*:=\s*v_blocked/);
  });

  it("catches all four ordering SQLSTATEs, not just foreign keys", () => {
    // drawings.drawing_set_id is ON DELETE SET NULL under a NOT NULL check, so
    // deleting drawing_sets too early raises 23514, not 23503.
    for (const code of [
      "foreign_key_violation",
      "restrict_violation",
      "check_violation",
      "not_null_violation",
    ]) {
      expect(body).toContain(code);
    }
  });

  it("stops when a pass makes no progress rather than spinning", () => {
    expect(body).toMatch(/exit when coalesce\(array_length\(v_blocked, 1\), 0\) = 0;/);
    expect(body).toMatch(/exit when v_blocked = v_pending;/);
  });

  it("gives leftovers one UNGUARDED attempt so a real cycle still raises", () => {
    const loopEnd = body.indexOf("exit when v_blocked = v_pending;");
    const finalPass = body.indexOf("foreach v_table in array coalesce(v_blocked");
    expect(finalPass).toBeGreaterThan(loopEnd);
    // the final pass must not sit inside a begin/exception block
    const tail = body.slice(finalPass, body.indexOf("delete from public.projects where id = p_project_id;"));
    expect(tail).not.toMatch(/exception/i);
  });

  it("deletes the project row only after the loop", () => {
    expect(body.indexOf("foreach v_table in array coalesce(v_blocked")).toBeLessThan(
      body.indexOf("delete from public.projects where id = p_project_id;"),
    );
  });

  it("keeps every authorization and safety guard", () => {
    expect(body).toMatch(/user_has_project_role_at_least\(p_project_id, 'admin'\)/);
    expect(body).toMatch(/errcode = '42501'/);
    expect(body).toMatch(/A written reason \(12\+ characters\) is required/);
    expect(body).toMatch(/errcode = '23514'/);
    expect(body).toMatch(/ARCHIVE_FIRST: archive the project before erasing it/);
    expect(body).toMatch(/errcode = 'P0001'/);
  });

  it("keeps the audit write, trigger toggle and flag restore", () => {
    expect(body).toMatch(/insert into public\.data_erasure_log/);
    expect(body).toMatch(/erasure_toggle_user_triggers\(v_tables, true\)/);
    expect(body).toMatch(/erasure_toggle_user_triggers\(v_tables, false, v_disabled\)/);
    expect(body).toMatch(/set_config\('steelbuild\.erasure_rpc', 'on', true\)/);
    expect(body).toMatch(/set_config\('steelbuild\.erasure_rpc', v_prev, true\)/);
    const reenable = body.indexOf("erasure_toggle_user_triggers(v_tables, false, v_disabled)");
    expect(body.indexOf("delete from public.projects where id = p_project_id;")).toBeLessThan(reenable);
  });

  it("preserves signature, security context and return shape", () => {
    expect(executable).toMatch(/public\.hard_delete_project\(p_project_id uuid, p_reason text\)/);
    expect(executable).toMatch(/RETURNS jsonb/);
    expect(executable).toMatch(/SECURITY DEFINER/);
    expect(executable).toMatch(/SET search_path TO ''/);
    expect(body).toMatch(/jsonb_build_object\('project_id', p_project_id, 'row_counts', v_counts\)/);
  });

  it("uses CREATE OR REPLACE and redefines nothing else", () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(migration).not.toMatch(/drop\s+function/i);
    for (const fn of ["reset_org_data", "hard_delete_organization", "erasure_toggle_user_triggers", "project_row_counts"]) {
      expect(executable).not.toMatch(new RegExp(`replace\\s+function\\s+public\\.${fn}\\b`, "i"));
    }
  });

  it("touches no table, policy or trigger definition", () => {
    expect(executable).not.toMatch(/\bcreate\s+table\b/i);
    expect(executable).not.toMatch(/\balter\s+table\b/i);
    expect(executable).not.toMatch(/create\s+policy/i);
    expect(executable).not.toMatch(/\b(create|drop)\s+trigger\b/i);
  });

  it("records the 8s statement_timeout wall it does not solve", () => {
    // The next person to read this must not assume a green migration means the
    // erasure is runnable from the browser. It is not, for this data set.
    const notApplied = migration.slice(migration.indexOf("-- NOT APPLIED"));
    expect(notApplied).toMatch(/statement_timeout/);
    expect(notApplied).toMatch(/8s/);
    expect(notApplied).toMatch(/149,913|model_elements/);
  });
});
