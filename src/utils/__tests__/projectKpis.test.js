import { describe, it, expect } from "vitest";
import {
  calcWpProgress,
  calcLaborBurn,
  calcContractValue,
  calcDaysToDeadline,
  calcEVM,
  calcRfiHealth,
} from "../projectKpis";
import { computeRevisedContractValue } from "@/services/costRollup";

describe("calcWpProgress", () => {
  it("counts complete WPs and sums tonnage", () => {
    const r = calcWpProgress([
      { status: "Complete", tonnage: 10 },
      { status: "Complete", tonnage: 5 },
      { status: "In Progress", tonnage: 20 },
    ]);
    expect(r.totalCount).toBe(3);
    expect(r.completeCount).toBe(2);
    expect(r.pct).toBe(67); // round(2/3*100)
    expect(r.totalTons).toBe(35);
    expect(r.completeTons).toBe(15);
  });

  it("is safe when empty (no divide-by-zero)", () => {
    expect(calcWpProgress([])).toEqual({
      totalCount: 0, completeCount: 0, pct: 0, totalTons: 0, completeTons: 0,
    });
  });
});

describe("calcLaborBurn", () => {
  it("computes shop burn under budget", () => {
    const r = calcLaborBurn([
      { shop_hours_budget: 100, shop_hours_actual: 80 },
      { shop_hours_budget: 100, shop_hours_actual: 50 },
    ]);
    expect(r.shopBudget).toBe(200);
    expect(r.shopActual).toBe(130);
    expect(r.burnPct).toBe(65);
    expect(r.isOverBudget).toBe(false);
  });

  it("flags over budget above 100%", () => {
    const r = calcLaborBurn([{ shop_hours_budget: 100, shop_hours_actual: 130 }]);
    expect(r.burnPct).toBe(130);
    expect(r.isOverBudget).toBe(true);
  });

  it("no divide-by-zero with zero budget", () => {
    const r = calcLaborBurn([{ shop_hours_budget: 0, shop_hours_actual: 50 }]);
    expect(r.burnPct).toBe(0);
    expect(r.isOverBudget).toBe(false);
  });
});

describe("calcContractValue", () => {
  const project = { original_contract_value: 100000 };

  it("revised = original + approved CO amounts; pending tallied separately", () => {
    const r = calcContractValue(project, [
      { status: "Approved", co_amount: 5000 },
      { status: "Approved", co_amount: 2500 },
      { status: "Submitted", co_amount: 9999 }, // pending, not approved
    ]);
    expect(r.original).toBe(100000);
    expect(r.approvedCOTotal).toBe(7500);
    expect(r.revised).toBe(107500);
    expect(r.pendingCOCount).toBe(1);
    expect(r.pendingCOValue).toBe(9999);
  });

  it("matches computeRevisedContractValue exactly, including whitespace statuses", () => {
    const cos = [
      { status: "Approved ", co_amount: 5000 }, // trailing space — the old divergence
      { status: " Approved", co_amount: 2500 }, // leading space
      { status: "Rejected", co_amount: 9999 },
    ];
    const r = calcContractValue(project, cos);
    // Single source of truth: the KPI must equal the canonical revised value.
    expect(r.revised).toBe(computeRevisedContractValue(project, cos));
    expect(r.revised).toBe(107500); // both whitespace "Approved"s count
    expect(r.approvedCOTotal).toBe(7500);
  });

  it("is safe with no project / no COs", () => {
    const r = calcContractValue(null, []);
    expect(r.original).toBe(0);
    expect(r.revised).toBe(0);
    expect(r.approvedCOTotal).toBe(0);
  });
});

describe("calcDaysToDeadline", () => {
  it("returns null when no target date", () => {
    expect(calcDaysToDeadline({})).toEqual({ daysLeft: null, isOverdue: false });
  });

  it("flags overdue for a past date", () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString();
    const r = calcDaysToDeadline({ target_completion_date: past });
    expect(r.isOverdue).toBe(true);
    expect(r.daysLeft).toBeLessThan(0);
  });

  it("a future date is not overdue", () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString();
    const r = calcDaysToDeadline({ target_completion_date: future });
    expect(r.isOverdue).toBe(false);
    expect(r.daysLeft).toBeGreaterThan(0);
  });
});

describe("calcEVM", () => {
  it("computes BAC/EV/AC and CPI from work-package values", () => {
    // BAC = 1000, EV = 1000 * 0.5 = 500, AC = 500, CPI = 1
    const r = calcEVM([{
      budgeted_labor_value: 600, budgeted_material_value: 400, percent_complete: 50,
      actual_labor_cost_to_date: 300, actual_material_cost_to_date: 200,
    }]);
    expect(r.bac).toBe(1000);
    expect(r.ev).toBe(500);
    expect(r.ac).toBe(500);
    expect(r.cpi).toBe(1);
  });

  it("CPI is null when AC is 0 (no divide-by-zero)", () => {
    const r = calcEVM([{ budgeted_labor_value: 1000, percent_complete: 0 }]);
    expect(r.ac).toBe(0);
    expect(r.cpi).toBeNull();
  });

  it("honours a budgetAtCompletion override", () => {
    expect(calcEVM([], 5000).bac).toBe(5000);
  });
});

describe("calcRfiHealth", () => {
  it("counts active (not Answered/Closed) and overdue RFIs", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    const r = calcRfiHealth([
      { status: "Open", date_required: past }, // active + overdue
      { status: "In Review", date_required: future }, // active, not overdue
      { status: "Answered", date_required: past }, // not active
      { status: "Closed", date_required: past }, // not active
    ]);
    expect(r.openCount).toBe(2);
    expect(r.overdueCount).toBe(1);
  });
});
