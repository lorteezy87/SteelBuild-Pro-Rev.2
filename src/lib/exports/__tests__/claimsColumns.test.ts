import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The claims export aborts when any of its reads fails, and PostgREST rejects
 * a whole query for one unknown column. This pins every column it selects to
 * the generated schema, so a renamed or invented column fails here instead of
 * on a claims package for a GC, an insurer or a lawyer.
 */
const root = resolve(__dirname, "../../../..");
const types = readFileSync(resolve(root, "src/types/supabase.ts"), "utf8");
const modal = readFileSync(resolve(root, "src/components/drawings/ExportFabReleaseModal.jsx"), "utf8");

function columnsOf(table: string): Set<string> {
  const m = new RegExp(`\\n      ${table}: \\{\\n        Row: \\{([\\s\\S]*?)\\n        \\}`).exec(types);
  if (!m) throw new Error(`table ${table} not found in generated types`);
  return new Set(m[1].split("\n").map((l) => l.trim().split(":")[0].replace(/\?$/, "")).filter(Boolean));
}

function selectedColumns(table: string): string[] {
  const m = new RegExp(`\\.from\\("${table}"\\)\\s*\\.select\\("([^"]+)"\\)`).exec(modal);
  if (!m) throw new Error(`no select on ${table} in ExportFabReleaseModal`);
  return m[1].split(",").map((c) => c.trim());
}

describe("claims export selects only real columns", () => {
  it.each(["rfis", "change_orders", "photos"])("%s", (table) => {
    const real = columnsOf(table);
    expect(selectedColumns(table).filter((c) => !real.has(c))).toEqual([]);
  });
});
