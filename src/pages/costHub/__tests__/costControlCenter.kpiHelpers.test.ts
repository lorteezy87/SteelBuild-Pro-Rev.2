import { describe, expect, it } from "vitest";
import {
  selectOverBudgetCodes,
  rankOverBudgetByOverage,
  sumCostCodeBudgets,
  sumCostCodeEac,
  sumConsumedContingency,
  contingencyRemaining,
  buildCoPipelineCounts,
} from "../costControlCenter.derive";

describe("cost KPI pure helpers", () => {
  it("selects and ranks over-budget codes", () => {
    const rows = [
      { id: "1", is_over: true, committed_cost: 120, revised_budget: 100 },
      { id: "2", is_over: false, committed_cost: 50, revised_budget: 50 },
      { id: "3", is_over: true, committed_cost: 200, revised_budget: 100 },
    ];
    expect(selectOverBudgetCodes(rows).map((r) => r.id)).toEqual(["1", "3"]);
    expect(rankOverBudgetByOverage(rows.filter((r) => r.is_over), 1).map((r) => r.id)).toEqual(["3"]);
  });

  it("sums budgets, EAC, contingency", () => {
    expect(sumCostCodeBudgets([{ budget_amount: 10 }, { budget_amount: "5" }])).toBe(15);
    expect(sumCostCodeEac([{ actual_cost: 8, forecast_to_complete: 2 }])).toBe(10);
    expect(sumConsumedContingency([
      { actual_cost: 120, budget_amount: 100 },
      { actual_cost: 50, budget_amount: 80 },
    ])).toBe(20);
    expect(contingencyRemaining(30, [{ actual_cost: 120, budget_amount: 100 }])).toBe(10);
  });

  it("builds CO pipeline counts", () => {
    const cos = [
      { status: "Submitted" },
      { status: "Under Review" },
      { status: "Approved" },
      { status: "Draft" },
    ];
    const aging = [
      { isStale: true, id: "a" },
      { isStale: true, id: "b" },
      { isStale: false, id: "c" },
    ] as any;
    const c = buildCoPipelineCounts(cos, aging);
    expect(c.coPending).toBe(2);
    expect(c.coApproved).toBe(1);
    expect(c.coStale).toBe(2);
    expect(c.topStaleCOs).toHaveLength(2);
  });
});
