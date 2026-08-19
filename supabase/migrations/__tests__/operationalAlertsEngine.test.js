import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "..", "20260819002000_operational_alerts_engine.sql"),
  "utf8",
);

describe("operational_alerts_engine migration", () => {
  it("creates the engine + scoped wrapper with pinned search_path", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.generate_operational_alerts/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.generate_project_alerts/);
    const definerCount = (migration.match(/SECURITY DEFINER/g) || []).length;
    const searchPathCount = (migration.match(/SET search_path TO 'public'/g) || []).length;
    expect(definerCount).toBe(2);
    expect(searchPathCount).toBe(2);
  });

  it("locks the unscoped engine away from end users; wrapper is access-gated", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.generate_operational_alerts\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.generate_operational_alerts\(uuid\) TO service_role/);
    expect(migration).toMatch(/IF NOT public\.user_has_project_access\(p_project_id\) THEN/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.generate_project_alerts\(uuid\) TO authenticated/);
  });

  it("dedupes one live alert per (alert_type, related_record_id) and respects dismissal", () => {
    const dedupes = migration.match(/AND a\.is_dismissed = false/g) || [];
    expect(dedupes.length).toBe(3);
    expect(migration).toMatch(/a\.alert_type = 'Delivery_Overdue'/);
    expect(migration).toMatch(/a\.alert_type = 'Submittal_Overdue'/);
    expect(migration).toMatch(/a\.alert_type = 'Submittal_Stalled'/);
  });

  it("excludes archived projects and soft-deleted records from every rule", () => {
    const projectGates = migration.match(/COALESCE\(p\.is_deleted, false\) = false/g) || [];
    expect(projectGates.length).toBe(3);
    expect(migration).toMatch(/COALESCE\(d\.is_deleted, false\) = false/);
    const submittalGates = migration.match(/COALESCE\(s\.is_deleted, false\) = false/g) || [];
    expect(submittalGates.length).toBe(2);
  });

  it("only alerts on genuinely open work (status guards match the CHECK enums)", () => {
    expect(migration).toMatch(/NOT IN \('Delivered', 'Received', 'Cancelled'\)/);
    expect(migration).toMatch(/IN \('Draft', 'Submitted', 'Under Review', 'Revise and Resubmit'\)/);
    expect(migration).toMatch(/IN \('Submitted', 'Under Review'\)/);
  });

  it("schedules the daily cron behind a pg_cron guard", () => {
    expect(migration).toMatch(/IF EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'\)/);
    expect(migration).toMatch(/cron\.schedule\('generate-operational-alerts', '10 12 \* \* \*'/);
    expect(migration).toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });
});
