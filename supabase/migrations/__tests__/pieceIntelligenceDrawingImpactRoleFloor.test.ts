import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260809223000_piece_intelligence_drawing_impact_pm_floor.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("piece intelligence drawing-impact PM write floor migration", () => {
  it.each([
    ["ins", "insert"],
    ["upd", "update"],
    ["del", "delete"],
  ])("replaces the restrictive %s policy with a PM %s floor", (suffix, operation) => {
    expect(sql).toMatch(
      new RegExp(
        `drop\\s+policy\\s+if\\s+exists\\s+drawing_impacts_${suffix}_role_floor\\s+on\\s+public\\.drawing_impacts`,
        "i",
      ),
    );
    expect(sql).toMatch(
      new RegExp(
        `create\\s+policy\\s+drawing_impacts_${suffix}_role_floor[\\s\\S]*?on\\s+public\\.drawing_impacts[\\s\\S]*?as\\s+restrictive[\\s\\S]*?for\\s+${operation}[\\s\\S]*?to\\s+authenticated[\\s\\S]*?user_has_project_role_at_least\\(project_id,\\s*'pm'\\)`,
        "i",
      ),
    );
  });

  it("keeps reads unchanged and never grants blanket writes", () => {
    expect(sql.match(/to\s+authenticated/gi)).toHaveLength(3);
    expect(sql.match(/user_has_project_role_at_least\(project_id,\s*'pm'\)/gi))
      .toHaveLength(4);
    expect(sql).toMatch(
      /for\s+update[\s\S]*?using\s*\(public\.user_has_project_role_at_least\(project_id,\s*'pm'\)\)[\s\S]*?with\s+check\s*\(public\.user_has_project_role_at_least\(project_id,\s*'pm'\)\)/i,
    );
    expect(sql).not.toMatch(/for\s+select/i);
    expect(sql).not.toMatch(/(?:using|with\s+check)\s*\(\s*true\s*\)/i);
  });
});
