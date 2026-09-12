import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
interface PageResult {
  data: Row[] | null;
  error: Error | null;
}
interface RecordedQuery {
  table: string;
  select: string;
  eqs: Array<[string, unknown]>;
  order: string[];
  range: [number, number] | null;
}
interface FakeQuery {
  select(columns: string): FakeQuery;
  eq(column: string, value: unknown): FakeQuery;
  order(column: string): FakeQuery;
  range(start: number, end: number): Promise<PageResult>;
}

// A PostgREST-shaped fake: records each request's table, select list, filters,
// order and range, and serves rows by range, capped at db-max-rows (1000) the
// way the server caps them.
const backend = vi.hoisted(() => ({
  serverMaxRows: 1000,
  tables: {} as Record<string, Row[]>,
  queries: [] as RecordedQuery[],
  fail: null as null | { table: string; fromStart: number; kind: "error" | "no data" },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string): FakeQuery {
      const query: RecordedQuery = { table, select: "", eqs: [], order: [], range: null };
      backend.queries.push(query);
      const chain: FakeQuery = {
        select(columns) {
          query.select = columns;
          return chain;
        },
        eq(column, value) {
          query.eqs.push([column, value]);
          return chain;
        },
        order(column) {
          query.order.push(column);
          return chain;
        },
        async range(start, end) {
          query.range = [start, end];
          const fail = backend.fail;
          if (fail && fail.table === table && start >= fail.fromStart) {
            return fail.kind === "error"
              ? { data: null, error: new Error(`${table} read failed`) }
              : { data: null, error: null };
          }
          const rows = backend.tables[table] ?? [];
          return { data: rows.slice(start, Math.min(end + 1, start + backend.serverMaxRows)), error: null };
        },
      };
      return chain;
    },
  },
}));

import { fetchCrossSetSource } from "../crossSetSupersedeRepository";

const pad = (i: number) => String(i).padStart(5, "0");
const drawingRow = (i: number): Row => ({
  id: `d-${pad(i)}`, sheet_number: `S-${i}`, title: "Framing Plan", revision_number: "1",
  drawing_set_id: "set-l2", drawing_set_name: "Main Steel – L2", is_superseded: false, is_deleted: false,
  metadata: { drawing_log: { row: i } },
});
const setRow = (i: number): Row => ({ id: `s-${pad(i)}`, set_name: `Set ${i}`, is_locked: false, is_deleted: false });

// Drawings past the server's row cap; sets past one 500-row page.
const DRAWING_COUNT = 1001;
const SET_COUNT = 501;

const queriesFor = (table: string) => backend.queries.filter((query) => query.table === table);
const columnsOf = (query: RecordedQuery) => query.select.split(",").map((column) => column.trim());

beforeEach(() => {
  backend.tables = {
    drawings: Array.from({ length: DRAWING_COUNT }, (_, i) => drawingRow(i)),
    drawing_sets: Array.from({ length: SET_COUNT }, (_, i) => setRow(i)),
  };
  backend.queries = [];
  backend.fail = null;
});

describe("fetchCrossSetSource", () => {
  it("pages past the server's row cap, so every live drawing and set comes back", async () => {
    const source = await fetchCrossSetSource("p1");
    expect(source.drawings).toHaveLength(DRAWING_COUNT);
    expect(source.sets).toHaveLength(SET_COUNT);
    expect(source.drawings).toEqual(backend.tables.drawings);
    expect(source.sets).toEqual(backend.tables.drawing_sets);
    // Range paging needs the same stable order on every page.
    for (const query of backend.queries) expect(query.order).toEqual(["id"]);
  });

  it("scopes every read to the project and to rows that aren't soft-deleted", async () => {
    await fetchCrossSetSource("p1");
    expect(new Set(backend.queries.map((query) => query.table))).toEqual(new Set(["drawings", "drawing_sets"]));
    for (const query of backend.queries) {
      expect(query.eqs).toEqual(expect.arrayContaining([["project_id", "p1"], ["is_deleted", false]]));
      // The planner has no project check of its own: this filter is the only one.
      expect(query.eqs.filter(([column]) => column === "project_id")).toEqual([["project_id", "p1"]]);
    }
  });

  it("selects the columns the plan and the commit rely on, and nothing wide", async () => {
    await fetchCrossSetSource("p1");
    // metadata is merged into on commit: without it, superseded_by would replace drawing_log.
    for (const query of queriesFor("drawings")) {
      expect(columnsOf(query)).toEqual(expect.arrayContaining([
        "id", "sheet_number", "title", "revision_number", "drawing_set_id", "drawing_set_name",
        "is_superseded", "is_deleted", "metadata",
      ]));
    }
    // is_locked keeps a locked set's pages unticked and disabled.
    for (const query of queriesFor("drawing_sets")) {
      expect(columnsOf(query)).toEqual(expect.arrayContaining(["id", "set_name", "is_locked", "is_deleted"]));
    }
    for (const query of backend.queries) {
      expect(columnsOf(query)).not.toContain("*");
      expect(columnsOf(query)).not.toContain("extracted_text");
    }
  });

  it.each<[string, "error" | "no data"]>([
    ["drawings", "error"],
    ["drawings", "no data"],
    ["drawing_sets", "error"],
    ["drawing_sets", "no data"],
  ])("rejects the whole read when a later %s page returns %s, never partial rows", async (table, kind) => {
    backend.fail = { table, fromStart: 500, kind };
    await expect(fetchCrossSetSource("p1")).rejects.toThrow(
      kind === "error" ? `${table} read failed` : "Drawings were not returned. Retry the check.",
    );
    // The failing page came after a good one.
    expect(queriesFor(table).some((query) => query.range?.[0] === 0)).toBe(true);
  });

  it.each(["", null, undefined])("refuses a blank project id (%s) before reading anything", async (projectId) => {
    await expect(fetchCrossSetSource(projectId as unknown as string)).rejects.toThrow("Select a project before checking other sets.");
    expect(backend.queries).toEqual([]);
  });
});
