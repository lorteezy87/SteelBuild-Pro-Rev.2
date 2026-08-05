import { describe, it, expect } from "vitest";
import {
  getCostCodeSummary,
  getProjectBudgetSummary,
  getWorkPackageCostSummary,
  getExpensesByCategory,
} from "../budgetCalculations";

describe("getCostCodeSummary", () => {
  const costCodes = [{ cost_code_number: "01", budget_amount: 10000 }];
  const sov = [{ cost_code: "01", scheduled_value: 8000 }];
  const expenses = [
    { cost_code: "01", amount: 3000, payment_status: "Paid" },
    { cost_code: "01", amount: 2000, payment_status: "Approved" },
    { cost_code: "01", amount: 500, payment_status: "Voided" }, // excluded
    { cost_code: "02", amount: 9999, payment_status: "Paid" }, // other code
  ];

  it("uses the cost-code budget; excludes voided + other-code expenses", () => {
    const s = getCostCodeSummary("01", sov, expenses, costCodes);
    expect(s.budget).toBe(10000);
    expect(s.committed).toBe(5000); // 3000 + 2000
    expect(s.paid).toBe(3000);
    expect(s.remaining).toBe(5000);
    expect(s.usedPct).toBe(50);
    expect(s.isOver).toBe(false);
    expect(s.overAmount).toBe(0);
  });

  it("falls back to the SOV scheduled value when no cost code matches", () => {
    const s = getCostCodeSummary("01", sov, expenses, []);
    expect(s.budget).toBe(8000);
  });

  it("uses a $0 matched cost-code budget rather than falling back to SOV", () => {
    const s = getCostCodeSummary("01", sov, [], [{ cost_code_number: "01", budget_amount: 0 }]);
    expect(s.budget).toBe(0); // a matched code (even $0) wins over SOV
    expect(s.usedPct).toBe(0); // no divide-by-zero
  });

  it("flags over-budget and caps usedPct at 100", () => {
    const over = [{ cost_code: "01", amount: 15000, payment_status: "Approved" }];
    const s = getCostCodeSummary("01", [], over, costCodes);
    expect(s.isOver).toBe(true);
    expect(s.overAmount).toBe(5000); // 15000 - 10000
    expect(s.remaining).toBe(-5000);
    expect(s.usedPct).toBe(100); // capped
  });

  it("coerces string amounts and tolerates missing fields", () => {
    const s = getCostCodeSummary(
      "01",
      [],
      [{ cost_code: "01", amount: "2500.50", payment_status: "Paid" }],
      [{ cost_code_number: "01", budget_amount: "10000" }],
    );
    expect(s.budget).toBe(10000);
    expect(s.committed).toBe(2500.5);
    expect(s.paid).toBe(2500.5);
  });
});

describe("getProjectBudgetSummary", () => {
  it("totals SOV budget and non-voided committed, with the paid subset", () => {
    const sov = [{ scheduled_value: 10000 }, { scheduled_value: 5000 }];
    const expenses = [
      { amount: 4000, payment_status: "Paid" },
      { amount: 3000, payment_status: "Approved" },
      { amount: 1000, payment_status: "Voided" }, // excluded
    ];
    const s = getProjectBudgetSummary(sov, expenses);
    expect(s.totalBudget).toBe(15000);
    expect(s.totalCommitted).toBe(7000);
    expect(s.totalPaid).toBe(4000);
    expect(s.remaining).toBe(8000);
    expect(s.usedPct).toBe(47); // round(7000/15000*100) = 46.67 → 47
    expect(s.isOver).toBe(false);
  });

  it("handles an empty project (no NaN, no divide-by-zero)", () => {
    const s = getProjectBudgetSummary([], []);
    expect(s.totalBudget).toBe(0);
    expect(s.totalCommitted).toBe(0);
    expect(s.usedPct).toBe(0);
    expect(s.isOver).toBe(false);
  });
});

describe("getWorkPackageCostSummary", () => {
  it("sums non-voided expenses for the work package, with paid + count", () => {
    const expenses = [
      { work_package_id: "wp1", amount: 2000, payment_status: "Paid" },
      { work_package_id: "wp1", amount: 1500, payment_status: "Approved" },
      { work_package_id: "wp1", amount: 999, payment_status: "Voided" }, // excluded
      { work_package_id: "wp2", amount: 5000, payment_status: "Paid" }, // other WP
    ];
    const s = getWorkPackageCostSummary("wp1", expenses);
    expect(s.committed).toBe(3500);
    expect(s.paid).toBe(2000);
    expect(s.count).toBe(2);
  });
});

describe("getExpensesByCategory", () => {
  it("buckets by cost-code category, excludes voided, zeroes unmapped categories", () => {
    const expenses = [
      { cost_code: "01", amount: 1000, payment_status: "Paid" }, // Labor
      { cost_code: "07", amount: 500, payment_status: "Approved" }, // Labor
      { cost_code: "03", amount: 2000, payment_status: "Paid" }, // Materials
      { cost_code: "09", amount: 800, payment_status: "Paid" }, // Equipment
      { cost_code: "01", amount: 9999, payment_status: "Voided" }, // excluded
      { cost_code: "99", amount: 1234, payment_status: "Paid" }, // unknown → ignored
    ];
    const r = getExpensesByCategory(expenses);
    expect(r.Labor).toBe(1500);
    expect(r.Materials).toBe(2000);
    expect(r.Equipment).toBe(800);
    expect(r.Subcontractor).toBe(0); // no codes mapped to it
    expect(r["Misc."]).toBe(0);
    expect(r.Overhead).toBe(0);
  });
});
