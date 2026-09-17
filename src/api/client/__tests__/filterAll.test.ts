import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * filterAll() pages a conditioned read to completeness.
 *
 * It exists because several project-scoped reads are not lists but LOOKUPS the
 * UI makes claims from: drawing_revisions drives the Register's "Rev" column,
 * and rfis gate fab-readiness. PostgREST caps a single request at 1000 rows
 * (db-max-rows) regardless of the limit asked for, so those reads truncated
 * silently and the page asserted something false about the rows past the cap.
 */

type Row = { id: string; project_id: string; is_deleted?: boolean };

const calls: Array<{ table: string; range: [number, number]; eq: Array<[string, unknown]> }> = [];
let pages: Row[][] = [];

function builder(table: string) {
  const eq: Array<[string, unknown]> = [];
  const self: Record<string, unknown> = {};
  const chain = () => self as never;
  self.select = chain;
  self.order = chain;
  self.eq = (col: string, val: unknown) => { eq.push([col, val]); return self as never; };
  self.in = chain;
  self.gte = chain;
  self.lte = chain;
  self.range = (from: number, to: number) => {
    const index = calls.length;
    calls.push({ table, range: [from, to], eq });
    return Promise.resolve({ data: pages[index] ?? [], error: null });
  };
  return self;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => builder(table), rpc: vi.fn() },
}));

import { entities } from "@/api/client/entities";

const makeRows = (n: number, offset = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${offset + i}`, project_id: "p1" }));

describe("filterAll", () => {
  beforeEach(() => {
    calls.length = 0;
    pages = [];
  });

  it("stops after one request when the first page is short", async () => {
    pages = [makeRows(12)];
    const rows = await entities.RFI.filterAll({ project_id: "p1" });
    expect(rows).toHaveLength(12);
    expect(calls).toHaveLength(1);
    expect(calls[0].range).toEqual([0, 999]);
  });

  it("pages past the 1000-row server cap and returns every row", async () => {
    // A full page means "there may be more" — this is exactly the case that
    // used to be truncated and returned as if it were complete.
    pages = [makeRows(1000), makeRows(1000, 1000), makeRows(37, 2000)];
    const rows = await entities.RFI.filterAll({ project_id: "p1" });
    expect(rows).toHaveLength(2037);
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("makes one more request when the row count is an exact multiple of the page", async () => {
    pages = [makeRows(1000), []];
    const rows = await entities.RFI.filterAll({ project_id: "p1" });
    expect(rows).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("applies the caller's conditions to every page", async () => {
    pages = [makeRows(1000), makeRows(1, 1000)];
    await entities.DrawingRevision.filterAll({ project_id: "p1" });
    for (const call of calls) {
      expect(call.eq).toContainEqual(["project_id", "p1"]);
    }
  });

  it("keeps the soft-delete filter on a soft-delete table", async () => {
    pages = [makeRows(1)];
    await entities.RFI.filterAll({ project_id: "p1" });
    expect(calls[0].eq).toContainEqual(["is_deleted", false]);
  });

  it("lets the caller override the soft-delete filter, as filter() does", async () => {
    pages = [makeRows(1)];
    await entities.RFI.filterAll({ project_id: "p1", is_deleted: true });
    expect(calls[0].eq.filter(([col]) => col === "is_deleted")).toEqual([["is_deleted", true]]);
  });

  it("returns an empty array when the project has no rows", async () => {
    pages = [[]];
    expect(await entities.RFI.filterAll({ project_id: "p1" })).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
