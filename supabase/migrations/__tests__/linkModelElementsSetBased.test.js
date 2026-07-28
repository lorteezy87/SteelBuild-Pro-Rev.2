import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const setBasedPath = fileURLToPath(
  new URL(
    "../20260728052000_link_model_elements_set_based.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(setBasedPath, "utf8");

describe("link_model_elements_to_pieces set-based rewrite", () => {
  it("replaces the RPC without a per-element FOR loop", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.link_model_elements_to_pieces",
    );
    expect(sql).not.toMatch(/\bFOR\s+el\s+IN\b/i);
    expect(sql).toContain("WITH leaves AS");
    expect(sql).toContain("match_stats AS");
    expect(sql).toContain("UPDATE public.model_elements me");
    expect(sql).toContain("set_config('statement_timeout', '120s', true)");
  });

  it("still rejects illegal min(uuid) aggregates", () => {
    expect(sql).not.toMatch(/min\s*\(\s*p\.id\s*\)/i);
    expect(sql).toContain("(array_agg(l.id ORDER BY l.id))[1]");
  });
});
