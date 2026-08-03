import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260727012111_archive_project_visibility.sql"),
  "utf8",
);

describe("archive_project_visibility migration", () => {
  it("restores is_deleted gate on user_has_project_access with initplan-safe auth.uid()", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.user_has_project_access/i);
    expect(migration).toMatch(/coalesce\(\s*p\.is_deleted\s*,\s*false\s*\)\s*=\s*false/i);
    expect(migration).toMatch(/om\.user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)/i);
  });

  it("hardens projects SELECT policies so archived roots are invisible", () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS project_select ON public\.projects/i);
    expect(migration).toMatch(/CREATE POLICY project_select\s+ON public\.projects/i);
    expect(migration).toMatch(/coalesce\(\s*is_deleted\s*,\s*false\s*\)\s*=\s*false/i);
    expect(migration).toMatch(/user_has_project_access\(\s*id\s*\)/i);
  });

  it("fails closed when soft_delete_project updates zero project rows", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.soft_delete_project/i);
    expect(migration).toMatch(/GET DIAGNOSTICS/i);
    expect(migration).toMatch(/RAISE EXCEPTION/i);
  });
});
