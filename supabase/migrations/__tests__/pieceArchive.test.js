import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../20260720213000_archive_canonical_pieces.sql", import.meta.url),
);
const sql = readFileSync(migrationPath, "utf8");

describe("canonical piece archive migration contract", () => {
  it("keeps archival server-mediated and admin-authorized", () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."archive_piece_lots"');
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('"public"."user_has_project_role_at_least"(p_project_id, \'admin\')');
    expect(sql).toContain("Piece control is disabled for this project");
    expect(sql).toContain("Confirmation must exactly match");
    expect(sql).toContain("An archive reason is required");
    expect(sql).toContain('FROM PUBLIC, "anon", "authenticated"');
  });

  it("soft deletes pieces and preserves an immutable event trail", () => {
    expect(sql).toContain("'archived'::text");
    expect(sql).toContain("'archived',");
    expect(sql).toContain('UPDATE "public"."pieces"');
    expect(sql).toContain('SET "is_deleted" = true');
    expect(sql).toContain('"deleted_at" = v_archived_at');
    expect(sql).toContain('INSERT INTO "public"."piece_events"');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"public"\."pieces"/i);
  });

  it("rejects project-boundary, split-lot, release, hold, and production conflicts", () => {
    expect(sql).toContain("All selected pieces must be active and belong to the same project");
    expect(sql).toContain("Split piece lots cannot be archived");
    expect(sql).toContain("Held or production-started pieces cannot be archived");
    expect(sql).toContain("Pieces with production history cannot be archived");
    expect(sql).toContain("Pieces in a canonically released work package cannot be archived");
  });
});
