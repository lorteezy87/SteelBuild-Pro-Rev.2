import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../20260720195844_optimize_piece_import_staging.sql", import.meta.url),
);
const sql = readFileSync(migrationPath, "utf8");
const stageFunction = sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION "public"."stage_piece_import_batch"'),
  sql.indexOf(
    'REVOKE ALL ON FUNCTION "public"."stage_piece_import_batch"',
  ),
);

describe("Piece Control import staging performance migration", () => {
  it("stages reconciled rows with one set-based insert instead of a row loop", () => {
    expect(stageFunction).toContain(
      'INSERT INTO "public"."piece_import_rows"',
    );
    expect(stageFunction).toContain(
      'FROM jsonb_array_elements(p_rows) WITH ORDINALITY',
    );
    expect(stageFunction).toContain(
      'CROSS JOIN LATERAL "public"."piece_import_reconcile_row"',
    );
    expect(stageFunction).not.toMatch(/\bFOR\s+v_item\s+IN\b/);
  });

  it("indexes duplicate detection by batch and normalized mark", () => {
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "piece_import_rows_batch_mark_idx"',
    );
    expect(sql).toMatch(
      /"batch_id",\s*\(\("normalized_payload" ->> 'normalized_piece_mark'\)\)/,
    );
  });

  it("keeps the existing batch limit and gives only this RPC more time", () => {
    expect(stageFunction).toContain(
      "IF jsonb_array_length(p_rows) > 10000 THEN",
    );
    expect(stageFunction).toContain("SET statement_timeout = '60s'");
    expect(sql).not.toMatch(/\bALTER\s+(?:DATABASE|ROLE)\b/i);
  });

  it("preserves authorization, safe function security, and restrictive grants", () => {
    expect(stageFunction).toContain(
      '"public"."user_has_project_role_at_least"(p_project_id, \'field\')',
    );
    expect(stageFunction).toContain("SECURITY DEFINER");
    expect(stageFunction).toContain("SET search_path = ''");
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION "public"."stage_piece_import_batch"(uuid, text, text, jsonb)',
    );
    expect(sql).toContain('FROM PUBLIC, "anon"');
    expect(sql).toContain('TO "authenticated"');
  });
});
