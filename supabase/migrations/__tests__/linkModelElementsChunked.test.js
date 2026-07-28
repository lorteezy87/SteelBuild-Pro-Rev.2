import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const path = fileURLToPath(
  new URL(
    "../20260728053000_link_model_elements_chunked.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(path, "utf8");

describe("link_model_elements chunked migration", () => {
  it("adds a paged RPC and keeps the full-project entry point", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.link_model_elements_to_pieces_page",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.link_model_elements_to_pieces(p_project_id uuid)",
    );
    expect(sql).toContain("SET statement_timeout = '60s'");
    expect(sql).toContain("SET statement_timeout = '180s'");
  });

  it("pre-aggregates unique leaf keys instead of looping elements", () => {
    expect(sql).toContain("uniq_mark_lot AS");
    expect(sql).toContain("uniq_mark AS");
    expect(sql).not.toMatch(/\bFOR\s+el\s+IN\b/i);
    expect(sql).not.toMatch(/min\s*\(\s*p\.id\s*\)/i);
  });
});
