import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PICKER_TYPES } from "../zonePanelConstants";

/**
 * The linker picker shows `row[titleField]` and searches on number + title.
 * A field that is not a column reads as "(untitled)" on every row and never
 * matches a search (rfis.subject did exactly that). Pin each field to the
 * generated schema through the entity's table.
 */
const root = resolve(__dirname, "../../../../../..");
const types = readFileSync(resolve(root, "src/types/supabase.ts"), "utf8");
const entitiesSrc = readFileSync(resolve(root, "src/api/client/entities.ts"), "utf8");

function tableFor(entity: string): string {
  // Every client factory takes the table name as its first string argument.
  const m = new RegExp(`\\b${entity}:[^\\n]*?\\(['"](\\w+)['"]`).exec(entitiesSrc);
  if (!m) throw new Error(`entity ${entity} not registered`);
  return m[1];
}

function columnsOf(table: string): Set<string> {
  const m = new RegExp(`\\n      ${table}: \\{\\n        Row: \\{([\\s\\S]*?)\\n        \\}`).exec(types);
  if (!m) throw new Error(`table ${table} not in generated types`);
  return new Set(m[1].split("\n").map((l) => l.trim().split(":")[0].replace(/\?$/, "")).filter(Boolean));
}

describe("zone linker picker fields exist", () => {
  it.each(PICKER_TYPES.map((t) => [t.key, t] as const))("%s", (_key, t) => {
    const cols = columnsOf(tableFor(t.entity));
    expect([t.numberField, t.titleField].filter((f) => !cols.has(f))).toEqual([]);
  });
});
