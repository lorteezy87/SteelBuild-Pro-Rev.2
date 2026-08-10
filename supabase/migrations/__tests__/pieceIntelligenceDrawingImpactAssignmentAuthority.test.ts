import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationNames = readdirSync(migrationsDirectory).filter((name) =>
  name.endsWith("_piece_intelligence_drawing_impact_assignment_authority.sql"),
);

function authoritySql(): string {
  expect(migrationNames).toHaveLength(1);
  return readFileSync(resolve(migrationsDirectory, migrationNames[0]!), "utf8");
}

describe("piece intelligence drawing-impact assignment authority migration", () => {
  it("exposes only assignment-safe fields through a project-scoped PM roster RPC", () => {
    const sql = authoritySql();

    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.list_drawing_impact_assignees\s*\(\s*p_project_id\s+uuid\s*\)\s*returns\s+table\s*\(\s*user_id\s+uuid\s*,\s*display_name\s+text\s*,\s*project_role\s+text\s*\)/i,
    );
    expect(sql).toMatch(
      /security\s+definer[\s\S]*?set\s+search_path\s+(?:to|=)\s*''/i,
    );
    expect(sql).toMatch(
      /auth\.uid\(\)\s+is\s+null[\s\S]*?not\s+public\.user_has_project_role_at_least\(p_project_id,\s*'pm'\)/i,
    );
    expect(sql).toMatch(
      /from\s+public\.user_projects\s+as\s+up[\s\S]*?left\s+join\s+public\.user_profiles\s+as\s+profile[\s\S]*?where\s+up\.project_id\s*=\s*p_project_id/i,
    );
    expect(sql).not.toMatch(/returns\s+setof\s+public\.user_projects/i);
    expect(sql).not.toMatch(/select\s+up\.\*/i);
  });

  it("allows only authenticated callers to execute the roster RPC", () => {
    const sql = authoritySql();

    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.list_drawing_impact_assignees\s*\(\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.list_drawing_impact_assignees\s*\(\s*uuid\s*\)\s+to\s+authenticated/i,
    );
  });

  it("rejects direct drawing-impact writes that assign a nonmember", () => {
    const sql = authoritySql();

    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.enforce_drawing_impact_assignee_membership\s*\(\s*\)\s*returns\s+trigger[\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s+(?:to|=)\s*''/i,
    );
    expect(sql).toMatch(
      /new\.assigned_to\s+is\s+not\s+null[\s\S]*?not\s+exists\s*\([\s\S]*?from\s+public\.user_projects\s+as\s+up[\s\S]*?up\.project_id\s*=\s*new\.project_id[\s\S]*?up\.user_id\s*=\s*new\.assigned_to[\s\S]*?raise\s+exception/i,
    );
    expect(sql).toMatch(
      /create\s+trigger\s+trg_drawing_impacts_assignee_membership[\s\S]*?before\s+insert\s+or\s+update\s+on\s+public\.drawing_impacts[\s\S]*?execute\s+function\s+public\.enforce_drawing_impact_assignee_membership\s*\(\s*\)/i,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.enforce_drawing_impact_assignee_membership\s*\(\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,
    );
  });

  it("does not broaden the existing user_projects membership policies", () => {
    const sql = authoritySql();

    expect(sql).not.toMatch(/create\s+policy[\s\S]*?on\s+public\.user_projects/i);
    expect(sql).not.toMatch(/alter\s+table\s+public\.user_projects/i);
    expect(sql).not.toMatch(/drop\s+policy[\s\S]*?on\s+public\.user_projects/i);
  });
});
