import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260819003000_project_workflow_templates.sql"),
  "utf8",
);

describe("project_workflow_templates migration", () => {
  it("creates apply_project_template as SECURITY DEFINER with pinned search_path", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_project_template/);
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path TO 'public'/);
  });

  it("requires PM+ and rejects unknown template keys", () => {
    expect(migration).toMatch(/user_has_project_role_at_least\(p_project_id, 'pm'\)/);
    expect(migration).toMatch(/IS DISTINCT FROM 'standard_steel'/);
    expect(migration).toMatch(/Unknown project template/);
  });

  it("fails closed when the project already has live work packages or schedule tasks", () => {
    expect(migration).toMatch(/FROM public\.work_packages\s+WHERE project_id = p_project_id AND COALESCE\(is_deleted, false\) = false/);
    expect(migration).toMatch(/FROM public\.schedule_tasks\s+WHERE project_id = p_project_id AND COALESCE\(is_deleted, false\) = false/);
    expect(migration).toMatch(/template not applied/);
  });

  it("inserts only constraint-valid statuses and pct pairs", () => {
    // work_packages + schedule_tasks both CHECK status; Not Started requires pct 0
    expect(migration).toMatch(/'Not Started'/);
    expect(migration).not.toMatch(/'Pending'|'Planned'/);
    // schedule insert supplies percent_complete 0 alongside Not Started
    expect(migration).toMatch(/percent_complete, start_date/);
  });

  it("anchors every date to the project start with pure date offsets", () => {
    expect(migration).toMatch(/COALESCE\(v_project\.start_date, CURRENT_DATE\)/);
    expect(migration).toMatch(/v_start \+ t\.start_off/);
    expect(migration).toMatch(/v_start \+ t\.end_off/);
  });

  it("locks execution to authenticated users only", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.apply_project_template\(uuid, text\) FROM PUBLIC, anon/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_project_template\(uuid, text\) TO authenticated/);
  });
});
