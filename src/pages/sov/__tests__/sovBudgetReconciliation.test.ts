/**
 * ID 81 — cost / SOV / budget control reconciliation.
 * Contract value from SOV summary must match project budget total from SOV lines.
 */
import { describe, expect, it } from "vitest";
import { buildSovSummary, type SovLineItem } from "../sovControlCenter.derive";
import { getProjectBudgetSummary } from "@/components/shared/budgetCalculations";

const lines: SovLineItem[] = [
  {
    id: "1",
    scheduled_value: 100_000,
    previous_percent_complete: 10,
    current_percent_complete: 40,
    retainage_percent: 10,
    status: "Draft",
    cost_code: "05-1200",
  },
  {
    id: "2",
    scheduled_value: 50_000.55,
    previous_percent_complete: 0,
    current_percent_complete: 20,
    retainage_percent: 5,
    status: "Submitted",
    cost_code: "05-1200",
  },
];

describe("SOV ↔ budget reconciliation", () => {
  it("aligns SOV contractValue with getProjectBudgetSummary.totalBudget", () => {
    const sov = buildSovSummary(lines);
    const budget = getProjectBudgetSummary(lines, []);
    expect(sov.contractValue).toBe(budget.totalBudget);
    expect(budget.totalBudget).toBe(150_000.55);
  });

  it("keeps billed-to-date consistent with row rollups", () => {
    const sov = buildSovSummary(lines);
    // 40% of 100k + 20% of 50000.55
    expect(sov.billedToDate).toBeCloseTo(40_000 + 10_000.11, 2);
    expect(sov.balanceToFinish).toBeCloseTo(sov.contractValue - sov.billedToDate, 2);
  });
});
