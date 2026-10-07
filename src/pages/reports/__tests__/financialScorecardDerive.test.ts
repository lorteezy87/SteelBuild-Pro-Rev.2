import { describe, expect, it } from "vitest";
import { deriveScorecardBudget, marginPercentAtExposure } from "../financialScorecardDerive";

describe("financial scorecard budget reconciliation", () => {
  it("does not let erection commitments hide actual-only fabrication spending", () => {
    const result = deriveScorecardBudget([
      { cost_code_number: "06", budget_amount: 1000, actual_cost: 900 },
      { cost_code_number: "07", budget_amount: 500, committed_cost: 900 },
    ], [], []);
    expect(result).toMatchObject({
      actual: 900, committed: 900, costExposure: 1800,
      budgetUsedPct: 120, costVariance: -300, costVariancePct: -20,
      committedVsBudget: 0.6,
    });
    expect(marginPercentAtExposure(2000, result.costExposure)).toBe(10);
  });

  it("keeps actual-only spending in budget exposure and margin without relabeling it committed", () => {
    const result = deriveScorecardBudget(
      [{ id: "shop", cost_code_number: "06", budget_amount: 800000, actual_cost: 900000, committed_cost: 0 }],
      [],
      [],
    );
    expect(result).toMatchObject({
      actual: 900000, committed: 0, costExposure: 900000,
      budgetUsedPct: 112.5, costVariance: -100000, costVariancePct: -12.5,
      committedVsBudget: 0,
    });
    expect(marginPercentAtExposure(1000000, result.costExposure)).toBe(10);
    expect(marginPercentAtExposure(0, result.costExposure)).toBeNull();
  });

  it("uses actual exposure when manual commitments lag posted costs", () => {
    const result = deriveScorecardBudget(
      [{ id: "field", cost_code_number: "07", budget_amount: 1000, actual_cost: 1100, committed_cost: 800 }],
      [],
      [],
    );
    expect(result).toMatchObject({ committed: 800, costExposure: 1100, costVariance: -100, committedVsBudget: 0.8 });
    expect(result.budgetUsedPct).toBeCloseTo(110);
  });

  it("reports manually entered commitments without requiring expense rows", () => {
    const result = deriveScorecardBudget(
      [{ id: "shop", cost_code_number: "06", budget_amount: 800000, actual_cost: 400000, committed_cost: 900000 }],
      [],
      [],
    );
    expect(result).toMatchObject({
      totalBudget: 800000,
      committed: 900000,
      actual: 400000,
      budgetUsedPct: 112.5,
      costVariance: -100000,
      costVariancePct: -12.5,
      committedVsBudget: 1.125,
    });
  });

  it("uses manual figures once and retains unmapped expenses", () => {
    const result = deriveScorecardBudget(
      [
        { id: "shop", cost_code_number: "06", budget_amount: 1000, actual_cost: 100, committed_cost: 500 },
        { id: "field", cost_code_number: "07", budget_amount: 1000 },
      ],
      [
        { cost_code: "06", amount: 80, payment_status: "Paid" },
        { cost_code: "07", amount: 200, payment_status: " paid " },
        { cost_code: "07", amount: 300, payment_status: "Unpaid" },
        { cost_code: "unmapped", amount: 40, payment_status: "Paid" },
        { cost_code: null, amount: 60, payment_status: "Unpaid" },
        { cost_code: "07", amount: 99999, payment_status: " void " },
        { cost_code: "07", amount: 99999, payment_status: "VOIDED" },
      ],
      [],
    );
    expect(result).toMatchObject({
      committed: 1100,
      actual: 340,
      paid: 320,
      unmappedCount: 2,
      unmappedCommitted: 100,
    });
    expect(result.budgetUsedPct).toBeCloseTo(55);
  });

  it("revises the budget with approved allocations and surfaces unallocated changes separately", () => {
    const result = deriveScorecardBudget(
      [{ id: "shop", cost_code_number: "06", budget_amount: 1000, committed_cost: 1200 }],
      [],
      [
        { cost_code_id: "shop", status: "Approved ", co_amount: 500 },
        { cost_code_id: "shop", status: "Approved", co_amount: -100 },
        { cost_code_id: null, status: "Approved", co_amount: 200 },
        { cost_code_id: "shop", status: "Submitted", co_amount: 9999 },
      ],
    );
    expect(result).toMatchObject({
      originalBudget: 1000,
      totalBudget: 1400,
      unallocatedExtras: 200,
      committed: 1200,
      costVariance: 200,
    });
    expect(result.budgetUsedPct).toBeCloseTo(1200 / 1400 * 100);
  });

  it("does not label spending as zero utilization without a positive budget", () => {
    const result = deriveScorecardBudget([], [{ amount: 500, payment_status: "Paid" }], []);
    expect(result.committed).toBe(500);
    expect(result.budgetUsedPct).toBeNull();
    expect(result.costVariance).toBeNull();
    expect(result.committedVsBudget).toBeNull();
  });
});
