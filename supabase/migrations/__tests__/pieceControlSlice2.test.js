import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../20260718020000_piece_control_slice2.sql", import.meta.url),
);
const sql = readFileSync(migrationPath, "utf8");

describe("piece control Slice 2 migration contract", () => {
  it("creates the explicit project-scoped drawing relation with no browser writes", () => {
    expect(sql).toContain('"public"."piece_drawings"');
    expect(sql).toContain('REFERENCES "public"."drawings" ("id")');
    expect(sql).toContain('UNIQUE ("piece_id", "drawing_id")');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('"public"."user_has_project_access"("project_id")');
    expect(sql).toContain('REVOKE ALL ON TABLE "public"."piece_drawings" FROM PUBLIC, "anon", "authenticated"');
    expect(sql).toContain('GRANT SELECT ON TABLE "public"."piece_drawings" TO "authenticated"');
  });

  it("enforces authorization, project boundaries, active records, and leaf pieces", () => {
    expect(sql).toContain('"public"."user_has_project_role_at_least"(p_project_id, \'field\')');
    expect(sql).toContain('All pieces must be active and belong to the same project');
    expect(sql).toContain('Active work package not found in this project');
    expect(sql).toContain('Active drawing not found in this project');
    expect(sql).toContain('Container pieces cannot be assigned');
    expect(sql).toContain('Piece and drawing must belong to the same project');
    expect(sql).toContain('Piece control is disabled for this project');
  });

  it("keeps assignment and link/unlink idempotent and audited", () => {
    expect(sql).toContain('IS NOT DISTINCT FROM p_work_package_id');
    expect(sql).toContain('ON CONFLICT ("piece_id", "drawing_id") DO NOTHING');
    expect(sql).toContain('GET DIAGNOSTICS v_inserted = ROW_COUNT');
    expect(sql).toContain('GET DIAGNOSTICS v_deleted = ROW_COUNT');
    expect(sql).toContain("'assigned_to_work_package'");
    expect(sql).toContain("'drawing_linked'");
    expect(sql).toContain("'drawing_unlinked'");
  });

  it("does not change legacy drawing relationships or work-package lifecycle", () => {
    expect(sql).not.toContain('"model_elements"');
    expect(sql).not.toContain('"linked_drawing_ids"');
    expect(sql).not.toContain('"drawing_ids"');
    expect(sql).not.toMatch(/UPDATE\s+"public"\."work_packages"/i);
  });
});

