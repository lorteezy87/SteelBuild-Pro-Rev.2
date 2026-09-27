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
const ADMIT_ADMINS = " and not public.user_has_project_role_at_least(p_project_id, 'admin')";

describe("project_row_counts census for archived projects", () => {
  it("only adds the project-admin check to the 20260914010000 definition", () => {
    expect(after).toContain(ADMIT_ADMINS);
    expect(after.replace(ADMIT_ADMINS, "")).toBe(before);
  });

  it("still refuses an end user who is neither a member with access nor a project admin", () => {
    expect(after).toMatch(
      /if \(select auth\.uid\(\)\) is not null and not public\.user_has_project_access\(p_project_id\) and not public\.user_has_project_role_at_least\(p_project_id, 'admin'\) then raise exception 'Not authorized to read this project' using errcode = '42501';/,
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
