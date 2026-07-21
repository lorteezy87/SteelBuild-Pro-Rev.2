import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260721060621_enforce_pm_transmittal_writes.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("transmittal PM write floor migration", () => {
  it.each([
    ["drawing_transmittals", "ins", "insert"],
    ["drawing_transmittals", "upd", "update"],
    ["drawing_transmittals", "del", "delete"],
    ["drawing_transmittal_items", "ins", "insert"],
    ["drawing_transmittal_items", "upd", "update"],
    ["drawing_transmittal_items", "del", "delete"],
  ])("adds a restrictive PM %s %s policy", (table, suffix, operation) => {
    const policy = new RegExp(
      `create\\s+policy\\s+${table}_${suffix}_pm_floor[\\s\\S]*?on\\s+public\\.${table}[\\s\\S]*?as\\s+restrictive[\\s\\S]*?for\\s+${operation}[\\s\\S]*?user_has_project_role_at_least\\(project_id,\\s*'pm'\\)`,
      "i",
    );
    expect(sql).toMatch(policy);
  });

  it("keeps the policies scoped to authenticated users and never grants blanket writes", () => {
    expect(sql.match(/to\s+authenticated/gi)).toHaveLength(6);
    expect(sql).not.toMatch(/(?:using|with\s+check)\s*\(\s*true\s*\)/i);
  });
});
