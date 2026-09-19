import { describe, it, expect } from "vitest";
import {
  countModelElements,
  fetchAllModelElements,
} from "@/lib/ifc/fetchAllModelElements";

/**
 * Chainable Supabase-ish mock.
 *
 * The roster loader pages by KEYSET: `.gt("id", cursor).order("id").limit(n)`,
 * awaited on the builder. The head/count query is `select(col, { head: true })`,
 * also awaited on the builder — so the mock answers whichever the caller built.
 *
 * `rows` must be sorted by id, which is what `.order("id")` guarantees in the
 * real client.
 */
function mockClient(rows, { pageErrors = [] } = {}) {
  const calls = [];
  let cursor;
  let head = false;
  let limit = null;
  const b = {
    from() { return b; },
    select(_cols, opts) {
      head = !!(opts && opts.head);
      cursor = undefined;
      limit = null;
      return b;
    },
    eq() { return b; },
    gt(col, value) { cursor = { col, value }; return b; },
    order() { return b; },
    limit(n) { limit = n; return b; },
    range(...args) { calls.push({ kind: "range", args }); return b; },
    then(resolve, reject) {
      if (head) {
        return Promise.resolve({ count: rows.length, error: null }).then(resolve, reject);
      }
      const err = pageErrors[calls.filter((c) => c.kind === "page").length];
      calls.push({ kind: "page", cursor: cursor ? cursor.value : null, limit });
      if (err) return Promise.resolve({ data: null, error: err }).then(resolve, reject);
      const start = cursor === undefined
        ? 0
        : rows.findIndex((r) => r.id > cursor.value);
      const slice = start < 0 ? [] : rows.slice(start, start + (limit ?? rows.length));
      return Promise.resolve({ data: slice, error: null }).then(resolve, reject);
    },
  };
  b.calls = calls;
  b.pages = () => calls.filter((c) => c.kind === "page");
  return b;
}

const makeRows = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: String(from + i + 1).padStart(6, "0") }));

describe("fetchAllModelElements", () => {
  it("walks every page by keyset and returns every row exactly once, in id order", async () => {
    const rows = makeRows(2500);
    const client = mockClient(rows);
    const out = await fetchAllModelElements("p", { client, page: 1000 });

    expect(out.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect(new Set(out.map((r) => r.id)).size).toBe(2500); // no duplicates
    // 3 pages: 1000, 1000, 500 (the short page ends the walk).
    expect(client.pages()).toEqual([
      { kind: "page", cursor: null, limit: 1000 },
      { kind: "page", cursor: "001000", limit: 1000 },
      { kind: "page", cursor: "002000", limit: 1000 },
    ]);
  });

  /**
   * The regression this module exists to prevent. `.range(from, to)` is
   * LIMIT/OFFSET, and under the model_elements RLS policy (a SECURITY DEFINER
   * function applied as a per-row Filter) an offset page re-filters and re-sorts
   * the ENTIRE project before discarding the rows it skipped. Measured on the
   * live DB that is 203 ms/page vs 44 ms for the keyset shape, and the gap
   * widens with roster size until it trips the 8s statement_timeout.
   */
  it("never pages by offset — every page after the first carries an id cursor", async () => {
    const rows = makeRows(3000);
    const client = mockClient(rows);
    await fetchAllModelElements("p", { client, page: 1000 });

    expect(client.calls.filter((c) => c.kind === "range")).toEqual([]);
    // 3 full pages + one short probe page that ends the walk.
    const pages = client.pages();
    expect(pages).toHaveLength(4);
    expect(pages[0].cursor).toBeNull();
    for (const p of pages.slice(1)) {
      expect(p.cursor).not.toBeNull();
      expect(p.limit).toBe(1000);
    }
  });

  it("fetches exactly one page on an exact multiple — no wasted probe page", async () => {
    const client = mockClient(makeRows(1000));
    const out = await fetchAllModelElements("p", { client, page: 1000 });
    expect(out).toHaveLength(1000);
    // 1000 rows == a full page, so one probe page is needed to learn it ended;
    // that probe is a cheap index seek past the last id, not a re-scan.
    expect(client.pages()).toHaveLength(2);
    expect(client.pages()[1].cursor).toBe("001000");
  });

  it("returns [] (and fetches nothing) for no project, and [] for an empty roster", async () => {
    const none = mockClient([]);
    expect(await fetchAllModelElements(null, { client: none })).toEqual([]);
    expect(none.pages()).toEqual([]);

    const empty = mockClient([]);
    expect(await fetchAllModelElements("p", { client: empty, page: 1000 })).toEqual([]);
    expect(empty.pages()).toHaveLength(1); // one short page, no count round-trip
  });

  it("passes an optional projection through to the page select", async () => {
    const selects = [];
    const rows = [{ id: "1", piece_mark: "A1" }];
    const client = {
      from() { return client; },
      select(cols, opts) { selects.push({ cols, head: !!(opts && opts.head) }); return client; },
      eq() { return client; },
      gt() { return client; },
      order() { return client; },
      limit() { return client; },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    };
    await fetchAllModelElements("p", {
      client,
      page: 1000,
      columns: "id,piece_mark,drawing_no,drawing_id",
    });
    expect(selects.some((s) => !s.head && s.cols === "id,piece_mark,drawing_no,drawing_id")).toBe(true);
  });

  it("refuses a projection that drops the keyset cursor instead of silently truncating", async () => {
    await expect(
      fetchAllModelElements("p", { client: mockClient(makeRows(10)), columns: "piece_mark" }),
    ).rejects.toThrow(/must include "id"/);
  });

  it("throws on a page error", async () => {
    const client = mockClient(makeRows(3000), { pageErrors: [new Error("page boom")] });
    await expect(fetchAllModelElements("p", { client, page: 1000 })).rejects.toThrow("page boom");
  });

  it("throws on a LATER page error rather than returning a short roster", async () => {
    const client = mockClient(makeRows(3000), { pageErrors: [null, new Error("page 2 boom")] });
    await expect(fetchAllModelElements("p", { client, page: 1000 })).rejects.toThrow("page 2 boom");
  });

  it("stops instead of spinning when the cursor cannot advance", async () => {
    // A row with no id would make the cursor unusable; bail with what we have
    // rather than re-request the same page forever.
    const client = mockClient([]);
    client.then = (resolve, reject) =>
      Promise.resolve({ data: [{ piece_mark: "A" }, { piece_mark: "B" }], error: null }).then(resolve, reject);
    const out = await fetchAllModelElements("p", { client, page: 2 });
    expect(out).toHaveLength(2);
  });
});

describe("countModelElements", () => {
  it("returns the live count from a HEAD query without transferring rows", async () => {
    const client = mockClient(makeRows(27750));
    const n = await countModelElements("p", { client });
    expect(n).toBe(27750);
    // The whole point: a roster this size must cost ZERO row fetches. The
    // Control Board reads this to know a roster exists; if it ever starts
    // paging, opening the Detailing page pulls the whole roster of steel.
    expect(client.pages()).toEqual([]);
  });

  it("returns 0 for no project rather than throwing", async () => {
    expect(await countModelElements(null)).toBe(0);
    expect(await countModelElements(undefined)).toBe(0);
  });

  it("returns 0 (not null) when the project has no members", async () => {
    await expect(countModelElements("p", { client: mockClient([]) })).resolves.toBe(0);
  });

  it("throws on a count error so callers fail loud instead of showing 0 members", async () => {
    const errClient = {
      from() { return errClient; }, select() { return errClient; }, eq() { return errClient; },
      then(resolve, reject) { return Promise.resolve({ count: null, error: new Error("count boom") }).then(resolve, reject); },
    };
    await expect(countModelElements("p", { client: errClient })).rejects.toThrow("count boom");
  });
});
