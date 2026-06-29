import { describe, it, expect } from "vitest";
import { listPieceProduction } from "@/lib/production/repository";

/**
 * Regression guard for "the 1000-row Tekla EPM issue": Supabase caps a single
 * PostgREST request at 1000 rows server-side (db-max-rows), so the old single
 * `.select()` silently truncated the existing piece_production roster at 1000.
 * That (a) under-counted the Production Status page and (b) made a re-import
 * mis-classify every piece past row 1000 as NEW — duplicating it. The loader
 * now PAGES with `.range()`, so these assert it walks every page.
 *
 * Chainable Supabase-ish mock: every builder method returns the builder, and
 * the terminal `.range()` resolves a slice. Mirrors the fetchAllModelElements
 * mock (which guards the same cap for the 3D model roster).
 */
function mockClient(rows) {
  const rangeCalls = [];
  const orderCalls = [];
  const b = {
    from() { return b; },
    select() { return b; },
    eq() { return b; },
    order(col, opts) { orderCalls.push([col, opts?.ascending]); return b; },
    range(from, to) {
      rangeCalls.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  };
  b.rangeCalls = rangeCalls;
  b.orderCalls = orderCalls;
  return b;
}

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, piece_mark: `P-${i}` }));

describe("listPieceProduction — pagination past the 1000-row server cap", () => {
  it("pages with .range() and returns EVERY row beyond 1000 (not truncated)", async () => {
    const client = mockClient(makeRows(2300));
    const out = await listPieceProduction("p1", { client, page: 1000 });
    expect(out).toHaveLength(2300);
    expect(client.rangeCalls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("orders by (piece_mark, id) so offset pages can't overlap or skip — piece_mark is non-unique", async () => {
    const client = mockClient(makeRows(443));
    await listPieceProduction("p1", { client, page: 1000 });
    // The id tiebreaker is load-bearing for offset pagination: piece_mark repeats
    // across instance-level rows, so without a unique secondary sort Postgres could
    // hand back the same row on two pages (or skip one) at a page boundary.
    expect(client.orderCalls).toEqual([["piece_mark", true], ["id", true]]);
  });

  it("stops after one page when the project has fewer than a page of rows", async () => {
    const client = mockClient(makeRows(443));
    const out = await listPieceProduction("p1", { client, page: 1000 });
    expect(out).toHaveLength(443);
    expect(client.rangeCalls).toEqual([[0, 999]]);
  });

  it("probes one more page on an exact page multiple, then stops", async () => {
    const client = mockClient(makeRows(1000));
    const out = await listPieceProduction("p1", { client, page: 1000 });
    expect(out).toHaveLength(1000);
    expect(client.rangeCalls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("returns [] without querying when no project is given", async () => {
    const client = mockClient([]);
    expect(await listPieceProduction("", { client, page: 1000 })).toEqual([]);
    expect(client.rangeCalls).toEqual([]);
  });

  it("throws on a page error instead of silently returning a partial roster", async () => {
    const errClient = {
      from() { return errClient; },
      select() { return errClient; },
      eq() { return errClient; },
      order() { return errClient; },
      range() { return Promise.resolve({ data: null, error: new Error("page boom") }); },
    };
    await expect(listPieceProduction("p1", { client: errClient, page: 1000 })).rejects.toThrow("page boom");
  });
});
