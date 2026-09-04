import { describe, expect, it, vi } from "vitest";
import { fetchAllPages, fetchAllProjectRowsPaged } from "../pagedSelect";

function fakeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));
}

describe("fetchAllPages", () => {
  it("keeps requesting pages until a short page arrives", async () => {
    const all = fakeRows(2350);
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllPages((from, to) => {
      calls.push([from, to]);
      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
    });
    expect(rows).toHaveLength(2350);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops after one page when the first page is short (no extra round-trip)", async () => {
    const makeQuery = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: fakeRows(12).slice(from, to + 1), error: null }),
    );
    const rows = await fetchAllPages(makeQuery);
    expect(rows).toHaveLength(12);
    expect(makeQuery).toHaveBeenCalledTimes(1);
  });

  it("stops cleanly when a page is exactly full and the next is empty", async () => {
    const all = fakeRows(1000);
    const rows = await fetchAllPages((from, to) =>
      Promise.resolve({ data: all.slice(from, to + 1), error: null }),
    );
    expect(rows).toHaveLength(1000);
  });

  it("throws the PostgREST error object", async () => {
    await expect(
      fetchAllPages(() => Promise.resolve({ data: null, error: { message: "boom" } })),
    ).rejects.toEqual({ message: "boom" });
  });

  it("honours the safety cap and reports truncation", async () => {
    const onTruncated = vi.fn();
    const rows = await fetchAllPages(
      (from, to) => Promise.resolve({ data: fakeRows(to - from + 1), error: null }),
      { pageSize: 10, maxRows: 30, onTruncated },
    );
    expect(rows).toHaveLength(30);
    expect(onTruncated).toHaveBeenCalledWith(30);
  });
});

describe("fetchAllProjectRowsPaged", () => {
  it("applies project filter, caller filters, a stable order with id tie-break, then range", async () => {
    const log: string[] = [];
    const builder: any = {
      select: (s: string) => { log.push(`select:${s}`); return builder; },
      eq: (c: string, v: unknown) => { log.push(`eq:${c}=${v}`); return builder; },
      order: (c: string) => { log.push(`order:${c}`); return builder; },
      range: (a: number, b: number) => { log.push(`range:${a}-${b}`); return Promise.resolve({ data: fakeRows(3), error: null }); },
    };
    const client = { from: (t: string) => { log.push(`from:${t}`); return builder; } };
    const rows = await fetchAllProjectRowsPaged(client, "pieces", "proj-1", {
      select: "id,lot_code",
      orderBy: "normalized_piece_mark",
      build: (q) => q.eq("is_deleted", false),
    });
    expect(rows).toHaveLength(3);
    expect(log).toEqual([
      "from:pieces",
      "select:id,lot_code",
      "eq:project_id=proj-1",
      "eq:is_deleted=false",
      "order:normalized_piece_mark",
      "order:id",
      "range:0-999",
    ]);
  });
});
