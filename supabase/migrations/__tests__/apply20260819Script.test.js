/**
 * The SQL-Editor bundle (supabase/scripts/apply-20260819-migrations.sql) exists
 * because the production database has no CLI access path. It is a concatenation
 * of three migration files plus a ledger insert, so it can silently rot if a
 * migration is edited and the bundle isn't regenerated. These assertions pin
 * the sync and the structural invariants that make it safe to paste.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..");
const script = fs.readFileSync(
  path.join(migrationsDir, "..", "scripts", "apply-20260819-migrations.sql"),
  "utf8",
);

const VERSIONS = [
  "20260819001000_org_member_default_project_access",
  "20260819002000_operational_alerts_engine",
  "20260819003000_project_workflow_templates",
];

describe("apply-20260819-migrations.sql", () => {
  it.each(VERSIONS)("contains %s verbatim", (name) => {
    const source = fs.readFileSync(path.join(migrationsDir, `${name}.sql`), "utf8");
    expect(script).toContain(source.trim());
  });

  it("records every bundled version in the migration ledger", () => {
    for (const name of VERSIONS) {
      const version = name.split("_")[0];
      expect(script).toContain(`'${version}'`);
    }
    expect(script).toMatch(/INSERT INTO supabase_migrations\.schema_migrations \(version\)/);
    expect(script).toMatch(/ON CONFLICT \(version\) DO NOTHING/);
  });

  it("guards the ledger write so a missing migrations schema can't abort the run", () => {
    expect(script).toMatch(/information_schema\.tables/);
    expect(script).toMatch(/table_schema = 'supabase_migrations'/);
  });

  it("keeps transactions balanced", () => {
    const begins = script.match(/^BEGIN;$/gm) ?? [];
    const commits = script.match(/^COMMIT;$/gm) ?? [];
    expect(begins.length).toBe(VERSIONS.length);
    expect(commits.length).toBe(begins.length);
  });

  it("balances every dollar-quoted body", () => {
    for (const tag of new Set(script.match(/\$[a-z]*\$/g) ?? [])) {
      const count = script.split(tag).length - 1;
      expect(count % 2, `${tag} is unbalanced`).toBe(0);
    }
  });

  it("uses a distinct dollar tag for the ledger block so it can't close a nested body", () => {
    expect(script).toContain("$ledger$");
  });

  it("warns that applying grants existing members read access", () => {
    expect(script).toMatch(/READ-ONLY/);
    expect(script).toMatch(/member_default_project_role = NULL/);
  });
});
