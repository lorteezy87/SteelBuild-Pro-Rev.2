import { describe, it, expect } from "vitest";
import { fetchAllModelElements } from "@/lib/ifc/fetchAllModelElements";

/**
 * Chainable Supabase-ish mock. The roster loader now does ONE head/count query
 * (`select(col, { head: true })`, awaited directly) followed by N concurrent
 * `.range()` page fetches, so the mock has to answer both:
 *   - head/count: awaiting the builder resolves `{ count, error }`
 *   - page:       `.range()` resolves `{ data, error }`
 */
function mockClient(rows) {
  const rangeCalls = [];
  const b = {
    headMode: false,
    from() { return b; },
    select(_cols, opts) { b.headMode = !!(opts && opts.head); return b; },
    eq() { return b; },
    order() { return b; },
    range(from, to) { rangeCalls.push([from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); },
    // Only the count query awaits the builder directly (pages await .range()).
    then(resolve, reject) { return Promise.resolve({ count: rows.length, error: null }).then(resolve, reject); },
  };
  b.rangeCalls = rangeCalls;
  return b;
}

describe("fetchAllModelElements", () => {
  it("fans out one .range() per page (count-driven) and returns every row", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const client = mockClient(rows);
    const out = await fetchAllModelElements("p", { client, page: 1000 });
    expect(out).toHaveLength(2500);
    // ceil(2500/1000) = 3 pages, fetched concurrently (order of issue preserved).
    expect(client.rangeCalls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("bounds concurrent page fetches (does not open every page at once)", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i }));
    let inFlight = 0;
    let maxInFlight = 0;
    const client = {
      from() { return client; },
      select() { return client; },
      eq() { return client; },
      order() { return client; },
      range(from, to) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            resolve({ data: rows.slice(from, to + 1), error: null });
          }, 5);
        });
      },
      then(resolve, reject) {
        return Promise.resolve({ count: rows.length, error: null }).then(resolve, reject);
      },
    };
    const out = await fetchAllModelElements("p", { client, page: 1000, concurrency: 2 });
    expect(out).toHaveLength(5000);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("passes optional columns through to page selects", async () => {
    const selects = [];
    const rows = [{ id: 1, piece_mark: "A1" }];
    const client = {
      from() { return client; },
      select(cols, opts) {
        selects.push({ cols, head: !!(opts && opts.head) });
        return client;
      },
      eq() { return client; },
      order() { return client; },
      range() { return Promise.resolve({ data: rows, error: null }); },
      then(resolve, reject) {
        return Promise.resolve({ count: 1, error: null }).then(resolve, reject);
      },
    };
    await fetchAllModelElements("p", {
      client,
      page: 1000,
      columns: "id,piece_mark,drawing_no,drawing_id",
    });
    expect(selects.some((s) => !s.head && s.cols === "id,piece_mark,drawing_no,drawing_id")).toBe(true);
  });

  it("fetches exactly one page on an exact multiple — no wasted empty page", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const client = mockClient(rows);
    const out = await fetchAllModelElements("p", { client, page: 1000 });
    expect(out).toHaveLength(1000);
    expect(client.rangeCalls).toEqual([[0, 999]]); // count=1000 → 1 page, no probe page
  });

  it("returns [] (and fetches no pages) for no project and for an empty roster", async () => {
    expect(await fetchAllModelElements(null, { client: mockClient([]) })).toEqual([]);
    const client = mockClient([]);
    expect(await fetchAllModelElements("p", { client, page: 1000 })).toEqual([]);
    expect(client.rangeCalls).toEqual([]); // count=0 → short-circuit, no page fetch
  });

  it("throws on a count error", async () => {
    const errClient = {
      from() { return errClient; }, select() { return errClient; }, eq() { return errClient; },
      order() { return errClient; }, range() { return Promise.resolve({ data: [], error: null }); },
      then(resolve, reject) { return Promise.resolve({ count: null, error: new Error("count boom") }).then(resolve, reject); },
    };
    await expect(fetchAllModelElements("p", { client: errClient, page: 1000 })).rejects.toThrow("count boom");
  });

  it("throws on a page error", async () => {
    const errClient = {
      from() { return errClient; }, select() { return errClient; }, eq() { return errClient; },
      order() { return errClient; }, range() { return Promise.resolve({ data: null, error: new Error("page boom") }); },
      then(resolve, reject) { return Promise.resolve({ count: 10, error: null }).then(resolve, reject); },
    };
    await expect(fetchAllModelElements("p", { client: errClient, page: 1000 })).rejects.toThrow("page boom");
  });
});
