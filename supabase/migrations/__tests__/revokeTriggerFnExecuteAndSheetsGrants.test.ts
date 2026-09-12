import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260912023827_revoke_trigger_fn_execute_and_sheets_grants.sql"),
  "utf8",
);

// Only the statements between BEGIN; and COMMIT; execute. Everything after
// COMMIT; is the NOT APPLIED commentary, which names objects (billing_config,
// planner_action_events) that this migration must NOT touch — so assertions
// about what is *absent* have to run against this slice, not the whole file.
const executable = migration.slice(
  migration.indexOf("\nBEGIN;"),
  migration.indexOf("\nCOMMIT;"),
);

const triggerFunctions = [
  "public.enforce_signoff_void_rules()",
  "public.log_submittal_activity()",
  "public.piece_station_completion_refresh_wp()",
  "public.pieces_projection_after_change()",
  "public.sync_gc_drawing_set_counts()",
];

const sheetsTables = ["public.sheets_config", "public.sheets_doc", "public.sheets_doc_backup"];

describe("trigger-function EXECUTE lockdown + sheets_* grant removal", () => {
  it("has a single executable transaction", () => {
    expect(executable.length).toBeGreaterThan(0);
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it("denies direct execution for all five SECURITY DEFINER trigger functions", () => {
    for (const identity of triggerFunctions) {
      expect(executable).toContain(`'${identity}'`);
    }
    expect(executable).toMatch(
      /revoke all on function %s from public, anon, authenticated, service_role/i,
    );
  });

  it("never grants execute back to PUBLIC or anon", () => {
    expect(executable).not.toMatch(/grant\s+execute\s+on\s+function/i);
    expect(executable).not.toMatch(/\bgrant\b[^;]*\bto\s+(?:public|anon)\b/i);
  });

  it("strips anon and authenticated from the sheets_* tables", () => {
    for (const table of sheetsTables) {
      expect(executable).toContain(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated;`);
    }
  });

  it("leaves service_role on the sheets_* tables — sheets-api is the legitimate caller", () => {
    // A REVOKE naming service_role on these tables would break the live
    // SteelBuild Sheets endpoint, whose source is not in this repo.
    const tableRevokes = executable.match(/REVOKE ALL ON TABLE[^;]+;/gi) ?? [];
    expect(tableRevokes).toHaveLength(sheetsTables.length);
    for (const stmt of tableRevokes) {
      expect(stmt).not.toMatch(/service_role/i);
    }
  });

  it("creates no RLS policy, so it cannot introduce an auth_rls_initplan violation", () => {
    expect(executable).not.toMatch(/create\s+policy/i);
    expect(executable).not.toMatch(/auth\.uid\(\)/i);
  });

  it("changes no function body, table, column or row", () => {
    expect(executable).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(executable).not.toMatch(/\bcreate\s+table\b/i);
    expect(executable).not.toMatch(/\balter\s+table\b/i);
    expect(executable).not.toMatch(/\b(insert\s+into|update\s+\w|delete\s+from|drop\s+)/i);
  });

  it("does not touch billing while the S&H Steel IP conflict is unresolved", () => {
    // Asserted against the executable slice only: the NOT APPLIED block names
    // billing_config in prose deliberately, to explain why it is excluded.
    expect(executable).not.toMatch(/billing/i);
    expect(migration).toMatch(/billing_config/); // the exclusion must stay documented
  });

  it("guards every object so a Rev 2-only replay cannot abort on repo/live drift", () => {
    for (const identity of triggerFunctions) {
      expect(executable).toContain(`'${identity}'`);
    }
    expect(executable).toMatch(/to_regprocedure\(v_identity\) IS NULL/);
    for (const table of sheetsTables) {
      expect(executable).toContain(`to_regclass('${table}') IS NULL`);
    }
    const notices = executable.match(/RAISE NOTICE 'skip \(absent, repo\/live drift\)/g) ?? [];
    expect(notices).toHaveLength(1 + sheetsTables.length); // one loop + one per table
  });

  it("reloads the PostgREST schema cache after changing ACLs", () => {
    expect(executable).toMatch(/NOTIFY pgrst, 'reload schema'/);
  });

  it("does not repeat the search_path pinning already shipped in 20260911062832", () => {
    expect(executable).not.toMatch(/set\s+search_path/i);
    expect(migration).toMatch(/20260911062832_pin_workflow_helper_search_paths\.sql/);
  });
});
