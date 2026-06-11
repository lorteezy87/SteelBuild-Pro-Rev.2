import { describe, expect, it } from "vitest";
import { computeCostCodeTotals, computeRevisedContractValue } from "../costRollup";

describe("computeCostCodeTotals", () => {
  it("sums the cost-code columns and derives variance + eac", () => {
    const codes = [
      { budget_amount: 1000, actual_cost: 400, committed_cost: 600, forecast_to_complete: 500 },
      { budget_amount: 2000, actual_cost: 2200, committed_cost: 2200, forecast_to_complete: 0 },
    ];
    expect(computeCostCodeTotals(codes)).toEqual({
      budget: 3000,
      actual: 2600,
      committed: 2800,
      forecast: 500,
      variance: 2600 - 3000, // -400 (under budget)
      eac: 2600 + 500, // 3100
    });
  });

  it("treats missing / non-numeric / string values as 0 (matches the old `Number(x) || 0` sites)", () => {
    const codes = [
      { budget_amount: "1500.50", actual_cost: null },
      { committed_cost: undefined, forecast_to_complete: "abc" },
      {},
    ];
    expect(computeCostCodeTotals(codes)).toEqual({
      budget: 1500.5,
      actual: 0,
      committed: 0,
      forecast: 0,
      variance: -1500.5, // actual(0) − budget(1500.5)
      eac: 0,
    });
  });

  it("returns all zeros for empty / null / undefined input", () => {
    const zero = { budget: 0, actual: 0, committed: 0, forecast: 0, variance: 0, eac: 0 };
    expect(computeCostCodeTotals([])).toEqual(zero);
    expect(computeCostCodeTotals(null)).toEqual(zero);
    expect(computeCostCodeTotals(undefined)).toEqual(zero);
  });

  it("skips null entries in the list", () => {
    const codes = [{ budget_amount: 100 }, null, { actual_cost: 50 }] as any;
    const r = computeCostCodeTotals(codes);
    expect(r.budget).toBe(100);
    expect(r.actual).toBe(50);
  });
});

describe("computeRevisedContractValue", () => {
  it("adds only Approved change orders to the original contract", () => {
    const project = { original_contract_value: 1_000_000 };
    const changeOrders = [
      { status: "Approved", co_amount: 50_000 },
      { status: "Pending", co_amount: 25_000 },
      { status: "Rejected", co_amount: 10_000 },
      { status: "Draft", co_amount: 5_000 },
    ];
    expect(computeRevisedContractValue(project, changeOrders)).toBe(1_050_000);
  });

  it("trims status whitespace (matches ContractManagement's matching)", () => {
    const project = { original_contract_value: 100 };
    expect(computeRevisedContractValue(project, [{ status: " Approved ", co_amount: 50 }])).toBe(150);
  });

  it("coerces string amounts and ignores non-numeric values", () => {
    const project = { original_contract_value: "1000.50" };
    const changeOrders = [
      { status: "Approved", co_amount: "99.50" },
      { status: "Approved", co_amount: "abc" },
      { status: "Approved", co_amount: null },
    ];
    expect(computeRevisedContractValue(project, changeOrders)).toBe(1100);
  });

  it("returns the original contract when there are no approved COs (or no COs at all)", () => {
    const project = { original_contract_value: 750_000 };
    expect(computeRevisedContractValue(project, [])).toBe(750_000);
    expect(computeRevisedContractValue(project, null)).toBe(750_000);
    expect(computeRevisedContractValue(project, undefined)).toBe(750_000);
  });

  it("returns 0 for a missing project and skips null CO entries", () => {
    expect(computeRevisedContractValue(null, [{ status: "Approved", co_amount: 100 }])).toBe(100);
    expect(computeRevisedContractValue(undefined, undefined)).toBe(0);
    expect(
      computeRevisedContractValue({ original_contract_value: 10 }, [null, { status: "Approved", co_amount: 5 }] as any),
    ).toBe(15);
  });
});
