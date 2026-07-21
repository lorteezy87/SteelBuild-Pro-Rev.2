import { beforeEach, describe, expect, it, vi } from "vitest";

interface SelectCall {
  table: string;
  columns: string;
}

const mocks = vi.hoisted(() => {
  const selectCalls: SelectCall[] = [];

  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {
      select: vi.fn((columns: string) => {
        selectCalls.push({ table, columns });
        return chain;
      }),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      then: (resolve: (result: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
    };
    return chain;
  };

  return {
    selectCalls,
    from: vi.fn((table: string) => makeChain(table)),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

import { fetchCanonicalDashboardSnapshot } from "./canonicalDashboardRepository";

describe("fetchCanonicalDashboardSnapshot", () => {
  beforeEach(() => {
    mocks.selectCalls.length = 0;
    mocks.from.mockClear();
  });

  it("selects only columns defined on legacy piece production rows", async () => {
    await fetchCanonicalDashboardSnapshot("project-1");

    expect(
      mocks.selectCalls.find((call) => call.table === "piece_production"),
    ).toEqual({
      table: "piece_production",
      columns: "id,quantity,weight,status,ship_date",
    });
  });
});
