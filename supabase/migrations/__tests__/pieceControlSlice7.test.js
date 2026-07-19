import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const slice3Path = fileURLToPath(
  new URL("../20260718030000_piece_control_slice3.sql", import.meta.url),
);
const slice7Path = fileURLToPath(
  new URL("../20260718070000_piece_control_slice7.sql", import.meta.url),
);
const slice3Sql = readFileSync(slice3Path, "utf8");
const slice7Sql = readFileSync(slice7Path, "utf8");

describe("piece control Slice 7", () => {
  it("uses Slice 3 deletion columns for material requirements", () => {
    const definition = slice3Sql.match(
      /CREATE TABLE IF NOT EXISTS "public"\."material_requirements" \(([\s\S]*?)^\);/m,
    );
    expect(definition).not.toBeNull();

    const columns = new Set(
      [...definition[1].matchAll(/^\s+"([^"]+)"\s+/gm)].map(
        ([, column]) => column,
      ),
    );
    const receiptIndex = slice7Sql.match(
      /ON "public"\."material_requirements"\s+\(([\s\S]*?)\)\s+WHERE\s+([\s\S]*?);/,
    );
    expect(receiptIndex).not.toBeNull();

    const referencedColumns = [
      ...`${receiptIndex[1]} ${receiptIndex[2]}`.matchAll(/"([^"]+)"/g),
    ].map(([, column]) => column);
    for (const column of referencedColumns) {
      expect(columns.has(column), `unknown column: ${column}`).toBe(true);
    }

    expect(receiptIndex[2]).toMatch(
      /"is_deleted"\s*=\s*false\s+AND\s+"deleted_at"\s+IS\s+NULL/,
    );
    expect(slice7Sql).not.toContain('requirement."is_active"');
    expect(slice7Sql).toContain('requirement."is_deleted" = false');
    expect(slice7Sql).toContain('requirement."deleted_at" IS NULL');
  });
});
