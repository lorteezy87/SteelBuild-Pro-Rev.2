import { describe, expect, it } from "vitest";
import {
  filterActiveExpenses,
  filterApprovedChangeOrders,
  sumApprovedCoTotal,
  buildCoByCostCodeId,
  buildCostCodeRows,
  buildFinancialSummary,
  buildReviewFlags,
  buildChangeOrderImpact,
  buildLaborUtilization,
  buildBillingVsCost,
  buildDaysSalesOutstanding,
} from "../useFinancialsHelpers";
import { safeNumber } from "../useFinancials";

describe("filterActiveExpenses / filterApprovedChangeOrders", () => {
  it("drops voided expenses", () => {
    expect(
      filterActiveExpenses([
        { id: "1", payment_status: "Paid" },
        { id: "2", payment_status: "Voided" },
      ] as any).map((e: any) => e.id),
    ).toEqual(["1"]);
  });
  it("keeps only Approved COs", () => {
    expect(
      filterApprovedChangeOrders([
        { status: "Approved" },
        { status: "Submitted" },
      ] as any),
    ).toHaveLength(1);
  });
});

describe("buildCoByCostCodeId", () => {
  it("sums approved CO amounts by cost_code_id", () => {
    const out = buildCoByCostCodeId(
      [
        { cost_code_id: "a", co_amount: 100 },
        { cost_code_id: "a", co_amount: 50 },
        { cost_code_id: null, co_amount: 10 },
      ] as any,
      safeNumber,
    );
    expect(out).toEqual({ a: 150, __unmapped__: 10 });
    expect(sumApprovedCoTotal([{ co_amount: 100 }, { co_amount: 25 }] as any, safeNumber)).toBe(125);
  });
});

describe("buildCostCodeRows + summary + flags", () => {
  const costCodes = [
    {
      id: "cc1",
      cost_code_number: "100",
      budget_amount: 1000,
      actual_cost: 0,
      committed_cost: 0,
    },
  ] as any;
  const activeExpenses = [
    { cost_code: "100", payment_status: "Paid", amount: 200 },
    { cost_code: "100", payment_status: "Unpaid", amount: 100 },
  ] as any;

  it("rolls expense actual/committed when manual is zero", () => {
    const rows = buildCostCodeRows({
      costCodes,
      activeExpenses,
      coByCostCodeId: { cc1: 50 },
      safeNumber,
    });
    expect(rows[0].actual_cost).toBe(200);
    expect(rows[0].committed_cost).toBe(300);
    expect(rows[0].signed_extras).toBe(50);
    expect(rows[0].revised_budget).toBe(1050);
    expect(rows[0].expense_count).toBe(2);
  });

  it("builds summary and review flags", () => {
    const rows = buildCostCodeRows({
      costCodes,
      activeExpenses,
      coByCostCodeId: {},
      safeNumber,
    });
    const summary = buildFinancialSummary({
      project: { original_contract_value: 5000 } as any,
      changeOrders: [
        { status: "Approved", co_amount: 100 },
        { status: "Submitted", co_amount: 40 },
      ] as any,
      sovItems: [{ scheduled_value: 5000 }] as any,
      costCodeRows: rows,
      activeExpenses,
      approvedCOTotal: 100,
      safeNumber,
    });
    expect(summary.sovTotal).toBe(5000);
    expect(summary.pendingCOTotal).toBe(40);
    expect(summary.actual).toBe(200);
    expect(summary.committed).toBe(300);

    const flags = buildReviewFlags({
      summary: { ...summary, totalRemaining: -1, sovTotal: 100, contractValue: 200 },
      activeExpenses: [{ cost_code: null } as any],
      costCodes,
      costCodeRows: rows,
    });
    expect(flags.some((f) => f.message.includes("Budget overrun"))).toBe(true);
    expect(flags.some((f) => f.message.includes("unmapped"))).toBe(true);
    expect(flags.some((f) => f.message.includes("SOV total"))).toBe(true);
  });
});

describe("executive KPIs", () => {
  it("buildChangeOrderImpact health bands", () => {
    const green = buildChangeOrderImpact([], { original_contract_value: 1000 } as any, safeNumber);
    expect(green.health).toBe("green");

    const red = buildChangeOrderImpact(
      [
        { status: "Approved", co_amount: 200, margin_percent: 5 },
      ] as any,
      { original_contract_value: 1000 } as any,
      safeNumber,
    );
    // 20% growth > 15 OR margin 5 < 10 → red
    expect(red.health).toBe("red");
    expect(red.contractGrowthPercent).toBe(20);
  });

  it("buildBillingVsCost positions", () => {
    const out = buildBillingVsCost({
      sovItems: [{ scheduled_value: 100, current_percent_complete: 100 }] as any,
      summary: { actual: 80 } as any,
      safeNumber,
    });
    expect(out.ratio).toBeCloseTo(1.25);
    expect(out.position).toBe("over-billed");
    expect(out.health).toBe("red");
  });

  it("buildDaysSalesOutstanding median and outstanding", () => {
    const today = new Date("2026-08-01T00:00:00.000Z");
    const out = buildDaysSalesOutstanding(
      [
        {
          id: "1",
          submitted_date: "2026-07-01",
          payment_received_date: "2026-07-31",
          scheduled_value: 1000,
          current_percent_complete: 100,
          application_number: 1,
        },
        {
          id: "2",
          submitted_date: "2026-06-01",
          payment_received_date: null,
          scheduled_value: 500,
          current_percent_complete: 50,
          application_number: 2,
        },
      ] as any,
      safeNumber,
      today,
    );
    expect(out.avgDSO).toBe(30);
    expect(out.medianDSO).toBe(30);
    expect(out.outstandingInvoices).toHaveLength(1);
    expect(out.outstandingInvoices[0].daysOutstanding).toBe(61);
    expect(out.totalOutstandingValue).toBe(250);
  });

  it("buildLaborUtilization with empty labor rows stays amber", () => {
    const out = buildLaborUtilization({
      costCodeRows: [{ cost_code_number: "999", revised_budget: 0, actual_cost: 0 } as any],
      workPackages: [],
      project: null,
      safeNumber,
    });
    expect(out.laborBudget).toBe(0);
    expect(out.health).toBe("amber");
    expect(out.percentScopeCompleteSource).toBe("derived");
  });
});
