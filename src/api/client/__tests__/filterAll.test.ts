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
let failedPage: number | null = null;

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
    return Promise.resolve(index === failedPage
      ? { data: null, error: { message: "Page read failed", code: "NETWORK_FAILURE" } }
      : { data: pages[index] ?? [], error: null });
  };
  return self;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => builder(table), rpc: vi.fn() },
}));

import { entities } from "@/api/client/entities";

const makeRows = (n: number, offset = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${offset + i}`, project_id: "p1" }));

beforeEach(() => {
  calls.length = 0;
  pages = [];
  failedPage = null;
});

describe.each(["listAll", "filterAll"] as const)("%s completeness boundary", (operation) => {
  const readAll = () => operation === "listAll"
    ? entities.RFI.listAll("-number")
    : entities.RFI.filterAll({ project_id: "p1" }, "-number");

  it("rejects a saturated safety limit instead of publishing an incomplete result", async () => {
    pages = Array.from({ length: 100 }, (_, i) => makeRows(1000, i * 1000));
    await expect(readAll().then((rows) => rows.length)).rejects.toMatchObject({
      name: "SupabaseOperationError", table: "rfis", operation,
      code: "READ_LIMIT_REACHED", status: 400,
    });
    expect(calls).toHaveLength(100);
    expect(calls.at(-1)?.range).toEqual([99_000, 99_999]);
    if (operation === "filterAll") {
      expect(calls.every((call) => call.eq.some(([key, value]) => key === "project_id" && value === "p1"))).toBe(true);
    }
  });

  it("returns a complete final short page immediately below the safety limit", async () => {
    pages = Array.from({ length: 99 }, (_, i) => makeRows(1000, i * 1000));
    pages.push(makeRows(999, 99_000));
    const rows = await readAll();
    expect(rows).toHaveLength(99_999);
    expect(rows.at(-1)?.id).toBe("r99998");
    expect(calls).toHaveLength(100);
  });

  it("rejects a later page failure without returning earlier partial rows", async () => {
    pages = [makeRows(1000), makeRows(12, 1000)];
    failedPage = 1;
    await expect(readAll()).rejects.toMatchObject({
      table: "rfis", operation, code: "NETWORK_FAILURE",
    });
    expect(calls).toHaveLength(2);
  });
});

describe("filterAll", () => {

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
