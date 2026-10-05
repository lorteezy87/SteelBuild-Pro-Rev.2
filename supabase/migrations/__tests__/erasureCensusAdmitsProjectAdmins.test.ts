import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => fs.readFileSync(path.join(migrationsDir, file), "utf8");

function projectRowCounts(sql: string): string {
  const start = sql.indexOf("create or replace function public.project_row_counts");
  const end = sql.indexOf("end $function$;", start);
  expect(start, "project_row_counts is not defined here").toBeGreaterThan(-1);
  return sql.slice(start, end + "end $function$;".length).replace(/\s+/g, " ");
}

const before = projectRowCounts(read("20260914010000_close_viewer_write_and_definer_gaps.sql"));
const after = projectRowCounts(read("20260927150000_erasure_census_admits_project_admins.sql"));
describe("project_row_counts census for archived projects", () => {
  it("preserves the census and only changes its authorization guard", () => {
    expect(after.slice(after.indexOf("for v_table in"))).toBe(before.slice(before.indexOf("for v_table in")));
  });

  it("requires current workspace membership for the archived-admin fallback", () => {
    expect(after).toMatch(
      /and not \( public\.user_has_project_role_at_least\(p_project_id, 'admin'\) and exists \( select 1 from public\.projects p join public\.organization_members m on m\.org_id = p\.org_id where p\.id = p_project_id and m\.user_id = \(select auth\.uid\(\)\) \) \)/,
    );
  });

  it("stays SECURITY DEFINER with an empty search_path", () => {
    expect(after).toMatch(/stable security definer set search_path to ''/);
  });

  it("is admitted by the same check hard_delete_project uses, so erasure can read it", () => {
    const hardDelete = read("20260912055243_hard_delete_project_dependency_ordered_deletes.sql");
    expect(hardDelete).toMatch(/public\.user_has_project_role_at_least\(p_project_id, 'admin'\)/);
    expect(hardDelete).toMatch(/v_counts := public\.project_row_counts\(p_project_id\)/);
  });
});
