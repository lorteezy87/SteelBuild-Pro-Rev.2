import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../20260718010000_piece_control_slice1.sql", import.meta.url),
);
const sql = readFileSync(migrationPath, "utf8");

describe("piece control Slice 1 migration contract", () => {
  it("creates project-scoped review tables with read-only browser grants", () => {
    expect(sql).toContain('"public"."piece_import_batches"');
    expect(sql).toContain('"public"."piece_import_rows"');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('"public"."user_has_project_access"("project_id")');
    expect(sql).toContain('REVOKE ALL ON TABLE "public"."piece_import_batches" FROM PUBLIC, "anon", "authenticated"');
    expect(sql).toContain('GRANT SELECT ON TABLE "public"."piece_import_rows" TO "authenticated"');
  });

  it("gates staging and apply by project role and piece-control mode", () => {
    expect(sql).toContain('"public"."user_has_project_role_at_least"(p_project_id, \'field\')');
    expect(sql).toContain('"public"."user_has_project_role_at_least"(v_batch.project_id, \'pm\')');
    expect(sql).toContain("Piece control is disabled for this project");
    expect(sql).toContain("Piece import batch must be approved before apply");
  });

  it("reconciles again during apply and protects lifecycle-owned fields", () => {
    const applyFunction = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION "public"."apply_piece_import_batch"'));
    expect(applyFunction).toContain('"public"."piece_import_reconcile_row"');
    expect(applyFunction).toContain('"lot_code" = \'ALL\'');
    expect(applyFunction).toContain('"parent_piece_id" IS NULL');
    expect(applyFunction).toContain("'updated_from_import'");
    expect(applyFunction).not.toMatch(/SET[\s\S]*?"lifecycle_status"\s*=/);
    expect(applyFunction).not.toMatch(/SET[\s\S]*?"is_on_hold"\s*=/);
    expect(applyFunction).not.toMatch(/SET[\s\S]*?"work_package_id"\s*=/);
  });

  it("uses explicit function security and restrictive execute grants", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('REVOKE ALL ON FUNCTION "public"."apply_piece_import_batch"(uuid) FROM PUBLIC, "anon"');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION "public"."apply_piece_import_batch"(uuid) TO "authenticated"');
  });
});

