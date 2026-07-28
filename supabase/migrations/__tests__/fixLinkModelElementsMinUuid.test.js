import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const gluePath = fileURLToPath(
  new URL("../20260725210000_piece_wp_fab_3d_glue.sql", import.meta.url),
);
const fixPath = fileURLToPath(
  new URL(
    "../20260728051000_fix_link_model_elements_min_uuid.sql",
    import.meta.url,
  ),
);
const glueSql = readFileSync(gluePath, "utf8");
const fixSql = readFileSync(fixPath, "utf8");

describe("link_model_elements_to_pieces uuid aggregate fix", () => {
  it("does not call min() on piece uuid ids in the glue or fix migrations", () => {
    expect(glueSql).not.toMatch(/min\s*\(\s*p\.id\s*\)/i);
    expect(fixSql).not.toMatch(/min\s*\(\s*p\.id\s*\)/i);
  });

  it("uses array_agg to pick a deterministic match id", () => {
    // Glue may ship the later set-based body (array_agg on leaves.id);
    // the min(uuid) hotfix keeps the original array_agg(p.id) form.
    expect(glueSql).toMatch(/\(array_agg\((?:p|l)\.id ORDER BY (?:p|l)\.id\)\)\[1\]/);
    expect(fixSql).toContain("(array_agg(p.id ORDER BY p.id))[1]");
    expect(fixSql).toContain(
      "CREATE OR REPLACE FUNCTION public.link_model_elements_to_pieces",
    );
  });
});
