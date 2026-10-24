/**
 * drawing_register_view keeps its contract when columns are added.
 *
 * This database is SHARED with the sibling application, and the view is read by
 * callers in both repos. `create or replace view` refuses to rename, retype,
 * reorder or drop an existing output column — so the one way to break those
 * callers is to rewrite the select list while re-authoring the view, which is
 * exactly what migration 20261022082000 does to append two columns.
 *
 * The migration was verified against a real PostgreSQL 16 by installing the
 * previous view and replacing it (a reorder is rejected with "cannot drop
 * columns from view"). This test is the cheap standing guard that keeps it
 * true: it compares the two select lists directly, so a future edit that
 * reorders or renames anything fails here rather than in production.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(__dirname, "..");
const PREVIOUS = "20260908045525_drawing_holds.sql";
const CURRENT = "20261022082000_drawing_register_view_sheet_media.sql";

/** The view's select list, as bare output column names in order. */
function outputColumns(file: string): string[] {
  const sql = readFileSync(join(DIR, file), "utf8");
  const view = sql.match(/create or replace view public\.drawing_register_view[\s\S]*?;/i);
  if (!view) throw new Error(`No drawing_register_view definition in ${file}`);
  const selectList = view[0].slice(view[0].search(/\bselect\b/i), view[0].search(/\n\s*from public\.drawings\b/i));

  // Split on commas that are not inside parentheses — the list carries
  // scalar sub-selects, so a naive split would cut them in half.
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of selectList) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  parts.push(buf);

  return parts
    .map((p) => p.replace(/^\s*select\b/i, "").replace(/--[^\n]*/g, "").trim())
    .filter(Boolean)
    .map((expr) => {
      const aliased = expr.match(/\bas\s+([a-z_][a-z0-9_]*)\s*$/i);
      if (aliased) return aliased[1];
      // Unaliased: the output name is the column, without its table qualifier.
      const tail = expr.split(/\s+/).pop() ?? expr;
      return tail.replace(/^[a-z_]+\./i, "");
    });
}

describe("drawing_register_view column contract", () => {
  const before = outputColumns(PREVIOUS);
  const after = outputColumns(CURRENT);

  it("reads a sane column list out of both migrations", () => {
    // Guards the parser itself: a silent mis-parse would make every assertion
    // below vacuous.
    expect(before.length).toBeGreaterThan(15);
    expect(before).toContain("drawing_id");
    expect(before).toContain("active_hold_placed_at");
    expect(before).not.toContain("");
  });

  it("keeps every existing column, with the same name and position", () => {
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it("appends exactly the two columns the Document Control panes need", () => {
    expect(after.slice(before.length)).toEqual(["thumbnail_url", "linked_rfi_ids"]);
  });

  it("adds nothing in the middle and removes nothing", () => {
    expect(after).toHaveLength(before.length + 2);
    for (const column of before) expect(after).toContain(column);
  });

  it("keeps security_invoker, so the caller's own RLS still decides", () => {
    const sql = readFileSync(join(DIR, CURRENT), "utf8");
    expect(sql).toMatch(/with\s*\(security_invoker=true\)/i);
    // The view must stay scoped to live sheets.
    expect(sql).toMatch(/where d\.is_deleted = false/i);
  });

  it("projects linked_rfi_ids verbatim rather than splitting it in SQL", () => {
    // It is a CSV of RFI NUMBERS and must be normalised by the canonical
    // normNum / linkedRfiNumbers in src/lib/fabReleaseGate.ts.
    const sql = readFileSync(join(DIR, CURRENT), "utf8");
    expect(sql).toMatch(/d\.linked_rfi_ids/);
    expect(sql).not.toMatch(/string_to_array\s*\(\s*d\.linked_rfi_ids/i);
    expect(sql).not.toMatch(/regexp_split_to_(array|table)\s*\(\s*d\.linked_rfi_ids/i);
  });
});
