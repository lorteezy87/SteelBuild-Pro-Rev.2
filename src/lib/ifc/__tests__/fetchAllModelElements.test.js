import { describe, it, expect } from "vitest";
import { fetchAllModelElements } from "@/lib/ifc/fetchAllModelElements";

/** Chainable Supabase-ish mock that slices a fixture per .range() call. */
function mockClient(rows) {
  const calls = [];
  const b = {
    from() { return b; },
    select() { return b; },
    eq() { return b; },
    order() { return b; },
    range(from, to) { calls.push([from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); },
  };
  b.calls = calls;
  return b;
}

describe("fetchAllModelElements", () => {
  it("pages through with .range() until the roster is exhausted", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const client = mockClient(rows);
    const out = await fetchAllModelElements("p", { client, page: 1000 });
    expect(out).toHaveLength(2500);
    expect(client.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]); // 3rd page short → stop
  });

  it("does one extra (empty) page on an exact multiple, then stops", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const client = mockClient(rows);
    const out = await fetchAllModelElements("p", { client, page: 1000 });
    expect(out).toHaveLength(1000);
    expect(client.calls).toEqual([[0, 999], [1000, 1999]]); // 2nd page empty → stop
  });

  it("returns [] for no project and for an empty roster", async () => {
    expect(await fetchAllModelElements(null, { client: mockClient([]) })).toEqual([]);
    const client = mockClient([]);
    expect(await fetchAllModelElements("p", { client, page: 1000 })).toEqual([]);
    expect(client.calls).toEqual([[0, 999]]);
  });

  it("throws on a client error", async () => {
    const errClient = {
      from() { return errClient; }, select() { return errClient; }, eq() { return errClient; },
      order() { return errClient; }, range() { return Promise.resolve({ data: null, error: new Error("boom") }); },
    };
    await expect(fetchAllModelElements("p", { client: errClient, page: 1000 })).rejects.toThrow("boom");
  });
});
