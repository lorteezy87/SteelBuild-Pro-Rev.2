import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../20260718030000_piece_control_slice3.sql", import.meta.url),
);
const sql = readFileSync(migrationPath, "utf8");

describe("piece control Slice 3 migration contract", () => {
  it("adds explicit material requirements, many-piece mappings, and receipt provenance", () => {
    expect(sql).toContain('"public"."material_requirements"');
    expect(sql).toContain('"public"."piece_material_requirements"');
    expect(sql).toContain('"public"."material_receipt_events"');
    expect(sql).toContain('"receipt_state"');
    expect(sql).toContain("'received'::text");
    expect(sql).toContain("'on_hand'::text");
    expect(sql).toContain('Receipt source is required for received or on-hand material');
    expect(sql).toContain('UNIQUE ("material_requirement_id", "piece_id")');
  });

  it("evaluates all four checks without mutating work-package status", () => {
    const evaluator = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION "public"."evaluate_release_gate"'),
      sql.indexOf('CREATE OR REPLACE FUNCTION "public"."release_work_package_canonical"'),
    );
    expect(evaluator).toContain("'scope'");
    expect(evaluator).toContain("'drawings'");
    expect(evaluator).toContain("'material'");
    expect(evaluator).toContain("'holds'");
    expect(evaluator).toContain('unknown or unmapped material');
    expect(evaluator).toContain('approved or approved as noted');
    expect(evaluator).not.toMatch(/UPDATE\s+"public"\."work_packages"/i);
    expect(evaluator).not.toMatch(/SET\s+"status"\s*=/i);
  });

  it("hard-blocks empty scope and already released packages", () => {
    expect(sql).toContain('CANONICAL_RELEASE_NO_SCOPE');
    expect(sql).toContain('A release exception cannot bypass missing canonical piece scope');
    expect(sql).toContain('CANONICAL_RELEASE_ALREADY_EXISTS');
    expect(sql).toContain('"fab_releases_canonical_work_package_unique"');
  });

  it("requires exception reasons and creates an established High schedule risk", () => {
    expect(sql).toContain('a non-empty exception reason is required');
    expect(sql).toContain("'Schedule'");
    expect(sql).toContain("'Open'");
    expect(sql).toMatch(/'Schedule',\s*4,\s*4,\s*'Open'/);
    expect(sql).toContain("'gate_snapshot', v_gate");
    expect(sql).toContain('"risk_id" = v_risk_id');
  });

  it("enforces authorization, immutable command writes, events, and concurrency safety", () => {
    expect(sql).toContain('"public"."user_has_project_access"(v_project_id)');
    expect(sql).toContain('"public"."user_has_project_role_at_least"(v_work_package.project_id, \'pm\')');
    expect(sql).toContain('Canonical fabrication releases may only be written through release_work_package_canonical');
    expect(sql).toContain("'released_for_fabrication'");
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('WHEN unique_violation THEN');
    expect(sql).toContain('A simultaneous release already completed');
  });

  it("preserves the legacy release path", () => {
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DROP FUNCTION "public"."enforce_submittal_fab_release_gate"');
    expect(sql).not.toContain('DROP TRIGGER trg_enforce_submittal_fab_release_gate');
    expect(sql).not.toMatch(/ALTER TABLE\s+"public"\."fab_release_log"/i);
  });
});

