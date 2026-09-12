import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260912045532_delivery_item_guard_honours_erasure_flag.sql"),
  "utf8",
);

// Everything before the CREATE and after the closing $function$; is prose. The
// NOT APPLIED block deliberately names things the migration must NOT do
// (walking the FK closure, adding a project_id column), so absence assertions
// have to run against the executable slice, not the whole file.
const start = migration.indexOf("CREATE OR REPLACE FUNCTION");
const executable = migration.slice(start, migration.indexOf("end $function$;") + "end $function$;".length);
const body = executable.slice(executable.indexOf("AS $function$"));

describe("enforce_delivery_item_guards honours the erasure flag", () => {
  it("reads the erasure flag with the same convention as the other guards", () => {
    expect(body).toMatch(/current_setting\('steelbuild\.erasure_rpc',\s*true\)/);
    expect(body).toMatch(/v_erasing\s+boolean\s*:=/);
  });

  it("returns early on erasure, before the parent-delivery lookup", () => {
    // The 23503 bug: the cascade fires this trigger after the parent deliveries
    // row is already gone, so the lookup can never succeed.
    const guard = body.indexOf("if v_erasing then");
    const lookup = body.indexOf("from public.deliveries where id =");
    expect(guard).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(lookup);
  });

  it("returns the right tuple for each operation on the erasure path", () => {
    expect(body).toMatch(/if v_erasing then\s*\n\s*if tg_op = 'DELETE' then return old; end if;\s*\n\s*return new;\s*\n\s*end if;/);
  });

  it("keeps every guard for ordinary traffic", () => {
    expect(body).toMatch(/raise exception 'delivery not found' using errcode = '23503'/);
    expect(body).toMatch(/Items are frozen once the delivery is received or cancelled/);
    expect(body).toMatch(/errcode = '42501'/);
    expect(body).toMatch(/piece must be a live lot of the delivery''s project/);
    expect(body).toMatch(/qty must be at least 1/);
    expect(body).toMatch(/errcode = '23514'/);
  });

  it("still honours the pre-existing delivery_rpc bypass", () => {
    // A different flag with a different meaning: it relaxes the frozen-status
    // check for the delivery RPCs. The erasure flag must not replace it.
    expect(body).toMatch(/current_setting\('steelbuild\.delivery_rpc',\s*true\)/);
    expect(body).toMatch(/and not v_rpc then/);
  });

  it("preserves the security context the trigger runs under", () => {
    expect(executable).toMatch(/RETURNS trigger/);
    expect(executable).toMatch(/LANGUAGE plpgsql/);
    expect(executable).toMatch(/SECURITY DEFINER/);
    expect(executable).toMatch(/SET search_path TO ''/);
  });

  it("uses CREATE OR REPLACE so the trigger stays attached", () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(executable).not.toMatch(/drop\s+function/i);
    expect(executable).not.toMatch(/create\s+trigger/i);
    expect(executable).not.toMatch(/drop\s+trigger/i);
    expect(executable).not.toMatch(/alter\s+table[^;]*trigger/i);
  });

  it("changes no table, policy or row", () => {
    expect(executable).not.toMatch(/\bcreate\s+table\b/i);
    expect(executable).not.toMatch(/\balter\s+table\b/i);
    expect(executable).not.toMatch(/create\s+policy/i);
    expect(executable).not.toMatch(/\b(insert\s+into|delete\s+from)\b/i);
  });

  it("redefines nothing else in the erasure chain", () => {
    for (const fn of [
      "hard_delete_project",
      "hard_delete_organization",
      "erasure_toggle_user_triggers",
      "project_row_counts",
      "reset_org_data",
    ]) {
      expect(executable).not.toMatch(new RegExp(`function\\s+public\\.${fn}\\b`, "i"));
    }
  });

  it("records the scope check that makes the narrow fix defensible", () => {
    // If a future reader widens this, they need to know the closure was walked
    // and delivery_items was the only hole -- not merely the next one found.
    expect(migration).toMatch(/delivery_items/);
    expect(migration).toMatch(/project_row_counts/);
    expect(migration).toMatch(/ON DELETE CASCADE/);
  });
});
