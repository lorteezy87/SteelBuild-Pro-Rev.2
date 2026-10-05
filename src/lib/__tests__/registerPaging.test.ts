import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));

import { fetchThreadComments } from "@/components/collaboration/commentQueries";
import { fetchProjectRegister } from "@/pages/projects/projectQueries";

function serve(total: number, failAfter = Infinity) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: `row-${i}` }));
  const calls: { table: string; filters: Record<string, unknown>; order: string[]; window?: number[] }[] = [];
  from.mockImplementation((table: string) => {
    const call: typeof calls[number] = { table, filters: {}, order: [] };
    calls.push(call);
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { call.filters[key] = value; return chain; },
      order: (key: string) => { call.order.push(key); return chain; },
      range: async (start: number, end: number): Promise<{ data: { id: string }[] | null; error: { message: string } | null }> => {
        call.window = [start, end];
        return start >= failAfter
          ? { data: null, error: { message: "second page unavailable" } }
          : { data: rows.slice(start, end + 1), error: null };
      },
    };
    return chain;
  });
  return { rows, calls };
}

beforeEach(() => from.mockReset());

describe.each([
  { table: "comments", read: () => fetchThreadComments("rfi", "rfi-1") },
  { table: "projects", read: fetchProjectRegister },
])("$table completeness", ({ table, read }) => {
  it("includes rows past the server ceiling with no gaps or duplicates", async () => {
    const { rows, calls } = serve(1001);
    expect(await read()).toEqual(rows);
    expect(calls.map((call) => call.window)).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    for (const call of calls) {
      expect(call.table).toBe(table);
      expect(call.order).toEqual(["created_at", "id"]);
      expect(call.filters.is_deleted).toBe(false);
    }
  });

  it("rejects the complete read when a later page fails", async () => {
    serve(1001, 500);
    await expect(read()).rejects.toThrow("second page unavailable");
  });
});

it("keeps every comments page scoped to the requested entity", async () => {
  const { calls } = serve(501);
  await fetchThreadComments("rfi", "rfi-1");
  expect(calls.every(({ filters }) => filters.entity_type === "rfi" && filters.entity_id === "rfi-1")).toBe(true);
});

it("never loads a thread without an entity", async () => {
  expect(await fetchThreadComments("rfi", "")).toEqual([]);
  expect(from).not.toHaveBeenCalled();
});

it("includes on-hold projects in the project register", async () => {
  const { calls } = serve(1);
  await fetchProjectRegister();
  expect(calls[0].filters).not.toHaveProperty("on_hold");
});
