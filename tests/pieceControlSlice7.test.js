import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/20260718070000_piece_control_slice7.sql",
  ),
  "utf8",
);

describe("Slice 7 migration contract", () => {
  it("makes mode changes admin-only, explicit, audited, and non-destructive", () => {
    expect(migration).toContain(
      '"user_has_project_role_at_least"(p_project_id, \'admin\')',
    );
    expect(migration).toContain("CHANGE %s TO %s");
    expect(migration).toContain('"piece_control_mode_events"');
    expect(migration).toContain("'canonical_records_preserved', true");
    expect(migration).toContain("'legacy_records_modified', false");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"public"\."pieces"/i);
  });

  it("guards direct project mode updates and permits safe rollback", () => {
    expect(migration).toContain('"guard_piece_control_mode_update"');
    expect(migration).toContain(
      "Piece Control mode may change only through set_piece_control_mode",
    );
    expect(migration).toContain(
      "v_previous_mode = 'live' AND p_next_mode IN ('off', 'shadow')",
    );
  });

  it("separates data quality, release, pilot, and live findings", () => {
    expect(migration).toContain("'data_quality_warnings'");
    expect(migration).toContain("'hard_release_blockers'");
    expect(migration).toContain("'pilot_transition_blockers'");
    expect(migration).toContain("'live_transition_blockers'");
    expect(migration).toContain("'canonical_import_coverage_percent'");
    expect(migration).toContain("'unmatched_model_element_count'");
    expect(migration).toContain("'tonnage_delta'");
  });

  it("keeps all canonical mutations server mediated", () => {
    for (const table of [
      "piece_control_mode_events",
      "piece_control_command_failures",
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON TABLE "public"."${table}"`,
      );
    }
    for (const command of [
      "release_work_package_canonical",
      "split_piece_lot",
      "advance_piece_station",
      "ship_piece_lots",
      "deliver_piece_lots",
      "erect_piece_lots",
    ]) {
      expect(migration).toContain(`"${command}_impl"`);
      expect(migration).toContain(`'${command}'`);
    }
  });

  it("persists structured failures and protects their audit records", () => {
    expect(migration).toContain('"piece_control_command_failures"');
    expect(migration).toContain("GET STACKED DIAGNOSTICS");
    expect(migration).toContain("'failure_id'");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
  });

  it("adds project-query indexes without enabling pilot or live automatically", () => {
    expect(migration).toContain('"model_elements_project_piece_active_idx"');
    expect(migration).toContain('"piece_drawings_project_piece_idx"');
    expect(migration).toContain(
      '"piece_material_requirements_project_piece_idx"',
    );
    expect(migration).not.toMatch(
      /UPDATE\s+"public"\."projects"[\s\S]*SET\s+"piece_control_mode"\s*=\s*'(pilot|live)'/i,
    );
  });
});

