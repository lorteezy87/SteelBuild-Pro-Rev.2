import { describe, expect, it } from "vitest";
import { filterCostCodeRows } from "../costControlCenter.derive";

describe("filterCostCodeRows", () => {
  const rows = [
    { phase: "Fab", is_over: true, cost_code_number: "01", description: "Steel" },
    { phase: "Erect", is_over: false, cost_code_number: "02", description: "Bolts" },
  ];
  it("filters phase, over-budget, search", () => {
    expect(filterCostCodeRows(rows, { phaseFilter: "Fab" })).toHaveLength(1);
    expect(filterCostCodeRows(rows, { overBudgetOnly: true })).toHaveLength(1);
    expect(filterCostCodeRows(rows, { search: "bolts" })).toHaveLength(1);
  });
});
