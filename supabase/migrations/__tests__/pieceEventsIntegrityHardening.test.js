import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrationsDir).find((name) =>
  /^\d{14}_piece_events_primary_key_and_index_cleanup\.sql$/.test(name),
);

describe("piece_events integrity hardening migration", () => {
  it("guards the production data shape before adding the primary key", () => {
    expect(migrationName).toBeDefined();
    const sql = readFileSync(resolve(migrationsDir, migrationName), "utf8");

    expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE id IS NULL\)/);
    expect(sql).toMatch(/GROUP BY id\s+HAVING COUNT\(\*\) > 1/);
    expect(sql).toMatch(/RAISE EXCEPTION 'piece_events\.id must contain no NULL or duplicate values before adding its primary key'/);
    expect(sql).toMatch(/ADD CONSTRAINT piece_events_pkey PRIMARY KEY \(id\)/);
  });

  it("removes only the index proven redundant by the live catalog", () => {
    const sql = readFileSync(resolve(migrationsDir, migrationName), "utf8");

    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.idx_piece_events_piece/);
    expect(sql).not.toMatch(/DROP INDEX IF EXISTS public\.piece_events_piece_created_at_idx/);
    expect(sql).not.toMatch(/DROP INDEX IF EXISTS public\.piece_events_project_created_at_idx/);
  });
});
