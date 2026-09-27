import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..");
const FILE = "20260927160000_account_deletion_releases_authorship.sql";
const migration = fs.readFileSync(path.join(migrationsDir, FILE), "utf8");

// (table, column, action) rows of the migration's VALUES list.
const rows = [...migration.matchAll(/\('(\w+)',\s*'(\w+)',\s*'(set_null|keep_id)'\)/g)].map(
  ([, table, column, action]) => ({ table, column, action }),
);
const key = (t: string, c: string) => `${t}.${c}`;

describe("account deletion: foreign keys to auth.users", () => {
  it("replaces 16 authorship keys with ON DELETE SET NULL and drops 11 audit keys", () => {
    expect(rows).toHaveLength(27);
    expect(new Set(rows.map((r) => key(r.table, r.column))).size).toBe(27);
    expect(rows.filter((r) => r.action === "set_null")).toHaveLength(16);
    expect(rows.filter((r) => r.action === "keep_id")).toHaveLength(11);
  });

  it("keeps the uuid on audit and sign-off records (owner decision), never clearing them", () => {
    const keepId = rows.filter((r) => r.action === "keep_id").map((r) => key(r.table, r.column));
    for (const audit of [
      "fab_release_log.released_by",
      "fab_release_overrides.overridden_by",
      "fab_releases.released_by",
      "drawing_signoffs.stamped_by_id",
      "drawing_signoffs.voided_by",
      "backcharge_events.actor",
      "material_receipt_events.recorded_by",
    ]) {
      expect(keepId).toContain(audit);
    }
    // NOT NULL columns can't be SET NULL; they must keep their id.
    expect(keepId).toContain("piece_import_batches.uploaded_by");
    expect(keepId).toContain("material_receipt_events.recorded_by");
  });

  it("finds constraints by column in the catalog and only re-adds for set_null", () => {
    expect(migration).toMatch(/con\.confrelid = 'auth\.users'::regclass/);
    expect(migration).toMatch(/att\.attname = r\.col/);
    expect(migration).toMatch(/elsif r\.action = 'set_null' then[\s\S]{0,200}on delete set null/);
  });

  it("aborts if any targeted column still blocks an auth.users delete", () => {
    expect(migration).toMatch(/con\.confdeltype in \('a', 'r'\)/);
    expect(migration).toMatch(/raise exception 'account-deletion FKs: still blocking/);
    // The abort list covers exactly the 27 targeted columns.
    const assertBlock = migration.slice(
      migration.indexOf("(cls.relname::text, att.attname::text) in ("),
      migration.indexOf("if v_blocking is not null"),
    );
    const asserted = [...assertBlock.matchAll(/\('(\w+)', '(\w+)'\)/g)].map(([, t, c]) => key(t, c));
    expect(new Set(asserted)).toEqual(new Set(rows.map((r) => key(r.table, r.column))));
  });

  it("covers every NO ACTION foreign key to auth.users that any migration declares", () => {
    // A new table that references auth.users without ON DELETE would block
    // account deletion again; this makes adding one, before or after this
    // migration, a visible decision.
    const uncovered: string[] = [];
    const covered = new Set(rows.map((r) => key(r.table, r.column)));
    for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql") && f !== FILE)) {
      const lines = fs.readFileSync(path.join(migrationsDir, file), "utf8").split("\n");
      let table = "";
      lines.forEach((line, i) => {
        const t = line.match(/(?:CREATE TABLE|ALTER TABLE)(?: IF NOT EXISTS| ONLY)?\s+"?public"?\."?(\w+)"?/i);
        if (t) table = t[1];
        if (!/REFERENCES\s+"?auth"?\."?users"?/i.test(line)) return;
        if (/ON DELETE/i.test(line) || /^\s*ON DELETE/i.test(lines[i + 1] ?? "")) return;
        // Table-level `FOREIGN KEY (col)` on this or the previous line, or an
        // inline column definition `col uuid ... REFERENCES auth.users`.
        const col =
          `${lines[i - 1] ?? ""}\n${line}`.match(/FOREIGN KEY\s*\(\s*"?(\w+)"?\s*\)/i)?.[1] ??
          line.match(/^\s*(?:ADD COLUMN (?:IF NOT EXISTS )?)?"?(\w+)"?\s+uuid\b/i)?.[1];
        if (!col) uncovered.push(`${file}:${i + 1}: could not tell which column references auth.users`);
        else if (!covered.has(key(table, col))) uncovered.push(`${file}:${i + 1}: ${key(table, col)}`);
      });
    }
    expect(uncovered).toEqual([]);
  });
});

describe("erase_my_sole_member_workspaces", () => {
  const body = migration.slice(migration.indexOf("create or replace function public.erase_my_sole_member_workspaces"));

  it("is SECURITY DEFINER with an empty search_path and the caller's own id", () => {
    expect(body).toMatch(/security definer\s+set search_path to ''/);
    expect(body).toMatch(/v_uid uuid := \(select auth\.uid\(\)\)/);
    expect(body).toMatch(/raise exception 'Not signed in' using errcode = '42501'/);
  });

  it("only erases workspaces where the caller is the only member and an owner", () => {
    expect(body).toMatch(/m\.role = 'owner'/);
    expect(body).toMatch(/not exists \(\s*select 1 from public\.organization_members o\s*where o\.org_id = m\.org_id and o\.user_id <> v_uid\s*\)/);
  });

  it("archives live projects before erasing, passing the caller's reason", () => {
    expect(body.indexOf("public.soft_delete_project(v_project)")).toBeGreaterThan(-1);
    expect(body.indexOf("public.soft_delete_project(v_project)")).toBeLessThan(
      body.indexOf("public.hard_delete_organization(v_org, p_reason)"),
    );
  });

  it("holds no cursor over organization_members or projects while erasing (55006)", () => {
    expect(body).not.toMatch(/for\s+\w+\s+in\s+select[\s\S]{0,200}from\s+public\.(organization_members|projects)/i);
    expect(body).toMatch(/foreach v_org in array v_todo loop/);
    expect(body).toMatch(/foreach v_project in array v_live loop/);
  });

  it("is callable by signed-in users only", () => {
    expect(migration).toMatch(/revoke all on function public\.erase_my_sole_member_workspaces\(text\) from public, anon;/);
    expect(migration).toMatch(/grant execute on function public\.erase_my_sole_member_workspaces\(text\) to authenticated;/);
  });
});
