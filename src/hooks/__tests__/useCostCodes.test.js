/**
 * useCostCodes.test.js — natural/numeric ordering of cost codes.
 *
 * The hook wraps this comparator in React Query's `select`; pinning it here
 * keeps the list ordering stable (e.g. "2" before "10") independent of the
 * data layer.
 */

import { describe, it, expect, vi } from "vitest";

// The hook module imports the supabase-backed base44 client at load; stub it.
vi.mock("@/api/base44Client", () => ({ base44: { entities: {} } }));

import { sortCostCodes } from "../useCostCodes";

describe("sortCostCodes", () => {
  it("orders numerically, not lexicographically (2 before 10)", () => {
    const rows = [
      { id: "c", cost_code_number: "10" },
      { id: "a", cost_code_number: "2" },
      { id: "b", cost_code_number: "9" },
    ];
    expect(sortCostCodes(rows).map((r) => r.cost_code_number)).toEqual(["2", "9", "10"]);
  });

  it("handles dotted/sectioned codes naturally", () => {
    const rows = [
      { cost_code_number: "01-200" },
      { cost_code_number: "01-30" },
      { cost_code_number: "01-3" },
    ];
    expect(sortCostCodes(rows).map((r) => r.cost_code_number)).toEqual(["01-3", "01-30", "01-200"]);
  });

  it("sorts missing numbers first and does not mutate the input", () => {
    const rows = [{ cost_code_number: "5" }, { id: "x" }, { cost_code_number: "1" }];
    const sorted = sortCostCodes(rows);
    expect(sorted[0].cost_code_number).toBeUndefined();
    expect(sorted.map((r) => r.cost_code_number)).toEqual([undefined, "1", "5"]);
    // input array order is untouched
    expect(rows[0].cost_code_number).toBe("5");
  });
});
