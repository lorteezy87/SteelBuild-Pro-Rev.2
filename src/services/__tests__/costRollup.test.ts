import { describe, expect, it } from "vitest";
import {
  computeCostCodeTotals,
  computeRevisedContractValue,
  preferManualActual,
  resolveProjectSpend,
} from "../costRollup";

describe("preferManualActual", () => {
  it("uses the typed-in manual figure when it is set (> 0)", () => {
    expect(preferManualActual(7755, 1208)).toBe(7755); // manual wins over expenses
    expect(preferManualActual("5000", 200)).toBe(5000); // string column coerced
  });
  it("falls back to the expense rollup when the manual figure is unset / 0 / invalid", () => {
    expect(preferManualActual(0, 5291)).toBe(5291);
    expect(preferManualActual(null, 5291)).toBe(5291);
    expect(preferManualActual(undefined, 714)).toBe(714);
    expect(preferManualActual("", 714)).toBe(714);
    expect(preferManualActual(-100, 714)).toBe(714); // negative is not a valid manual actual
  });
  it("never sums the two paths (no double-counting)", () => {
    // manual 7755 + expense 1208 must NOT produce 8963
    expect(preferManualActual(7755, 1208)).toBe(7755);
  });
});

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

// ---------------------------------------------------------------------------
// Variance basis — CostDashboard's per-row Variance column must foot to the
// TOTALS row it sits under. The column once used committed − budget while the
// total used actual − budget, so the two disagreed whenever a cost code had
// committed-but-unpaid cost.
// ---------------------------------------------------------------------------
describe("computeCostCodeTotals variance basis", () => {
  it("is actual − budget, NOT committed − budget", () => {
    const codes = [{ budget_amount: 1000, actual_cost: 400, committed_cost: 900, forecast_to_complete: 0 }];
    const t = computeCostCodeTotals(codes);
    expect(t.variance).toBe(-600); // 400 − 1000
    expect(t.variance).not.toBe(-100); // would be 900 − 1000
  });

  it("the sum of per-row (actual − budget) equals the total variance", () => {
    const codes = [
      { budget_amount: 1000, actual_cost: 1200, committed_cost: 1500, forecast_to_complete: 0 },
      { budget_amount: 500, actual_cost: 100, committed_cost: 480, forecast_to_complete: 0 },
      { budget_amount: 0, actual_cost: 250, committed_cost: 250, forecast_to_complete: 0 },
    ];
    const perRow = codes.reduce(
      (s, c) => s + (Number(c.actual_cost) - Number(c.budget_amount)),
      0,
    );
    expect(computeCostCodeTotals(codes).variance).toBe(perRow);
  });
});

// ---------------------------------------------------------------------------
// resolveProjectSpend — reconciles Budget Control (typed columns win, unmapped
// expenses excluded + flagged) with Portfolio/Dashboard (raw expense sums).
// ---------------------------------------------------------------------------
describe("resolveProjectSpend", () => {
  const codes = [
    { cost_code_number: "01-100", actual_cost: 0, committed_cost: 0 },
    { cost_code_number: "02-200", actual_cost: 0, committed_cost: 0 },
  ];

  it("rolls up paid expenses into actual and non-voided into committed", () => {
    const expenses = [
      { cost_code: "01-100", amount: 100, payment_status: "Paid" },
      { cost_code: "01-100", amount: 50, payment_status: "Unpaid" },
      { cost_code: "02-200", amount: 25, payment_status: "Paid" },
    ];
    const s = resolveProjectSpend(codes, expenses);
    expect(s.mappedActual).toBe(125);
    expect(s.mappedCommitted).toBe(175);
    expect(s.actual).toBe(125);
    expect(s.committed).toBe(175);
  });

  it("excludes voided expenses from both figures", () => {
    const expenses = [
      { cost_code: "01-100", amount: 100, payment_status: "Paid" },
      { cost_code: "01-100", amount: 999, payment_status: "Voided" },
      { cost_code: "01-100", amount: 888, payment_status: "Void" },
    ];
    const s = resolveProjectSpend(codes, expenses);
    expect(s.actual).toBe(100);
    expect(s.committed).toBe(100);
  });

  it("honors a typed-in actual_cost over the expense rollup — the Portfolio $0 bug", () => {
    // The whole point: a project whose actuals are typed onto the cost code and
    // never logged as expenses used to report $0 spend on the Portfolio.
    const typed = [{ cost_code_number: "01-100", actual_cost: 5000, committed_cost: 7000 }];
    const s = resolveProjectSpend(typed, []);
    expect(s.actual).toBe(5000);
    expect(s.committed).toBe(7000);
  });

  it("never sums a typed column with its expenses — no double counting", () => {
    const typed = [{ cost_code_number: "01-100", actual_cost: 5000, committed_cost: 5000 }];
    const expenses = [{ cost_code: "01-100", amount: 100, payment_status: "Paid" }];
    const s = resolveProjectSpend(typed, expenses);
    expect(s.mappedActual).toBe(5000);
    expect(s.actual).toBe(5000);
  });

  it("keeps expenses whose cost_code matches nothing, reported separately", () => {
    const expenses = [
      { cost_code: "01-100", amount: 100, payment_status: "Paid" },
      { cost_code: "99-999", amount: 40, payment_status: "Paid" },
      { cost_code: "", amount: 10, payment_status: "Paid" },
      { cost_code: "99-999", amount: 7, payment_status: "Unpaid" },
    ];
    const s = resolveProjectSpend(codes, expenses);
    expect(s.mappedActual).toBe(100);
    expect(s.unmappedActual).toBe(50); // 40 + 10
    expect(s.unmappedCommitted).toBe(57); // 40 + 10 + 7
    expect(s.unmappedCount).toBe(3);
    // The total is every dollar spent — nothing silently disappears.
    expect(s.actual).toBe(150);
    expect(s.committed).toBe(157);
  });

  it("guarantees actual === mappedActual + unmappedActual", () => {
    const expenses = [
      { cost_code: "01-100", amount: 100, payment_status: "Paid" },
      { cost_code: "zzz", amount: 33, payment_status: "Paid" },
    ];
    const s = resolveProjectSpend(codes, expenses);
    expect(s.actual).toBe(s.mappedActual + s.unmappedActual);
    expect(s.committed).toBe(s.mappedCommitted + s.unmappedCommitted);
  });

  it("does not count a voided expense as unmapped", () => {
    const s = resolveProjectSpend(codes, [{ cost_code: "nope", amount: 500, payment_status: "Voided" }]);
    expect(s.unmappedCount).toBe(0);
    expect(s.committed).toBe(0);
  });

  it("treats payment_status case-insensitively", () => {
    const s = resolveProjectSpend(codes, [{ cost_code: "01-100", amount: 60, payment_status: "paid" }]);
    expect(s.actual).toBe(60);
  });

  it("coerces string amounts and tolerates junk", () => {
    const s = resolveProjectSpend(codes, [
      { cost_code: "01-100", amount: "75.50", payment_status: "Paid" },
      { cost_code: "01-100", amount: "abc", payment_status: "Paid" },
    ]);
    expect(s.actual).toBe(75.5);
  });

  it("returns zeros for empty/missing inputs", () => {
    for (const s of [resolveProjectSpend([], []), resolveProjectSpend(null, null), resolveProjectSpend(undefined, undefined)]) {
      expect(s.actual).toBe(0);
      expect(s.committed).toBe(0);
      expect(s.unmappedCount).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Behaviour-preservation guard. Portfolio/Dashboard used to sum raw expenses.
// With no typed-in column (true for 237 of 240 production cost codes), the new
// resolver must return exactly the old number — so this is a latent-divergence
// fix, not a silent restatement of anyone's reported spend.
// ---------------------------------------------------------------------------
describe("resolveProjectSpend matches the legacy raw-expense sums when no column is typed", () => {
  const codes = [
    { cost_code_number: "01", actual_cost: 0, committed_cost: 0 },
    { cost_code_number: "14", actual_cost: 0, committed_cost: 0 },
  ];
  const expenses = [
    { cost_code: "01", amount: 100, payment_status: "Paid" },
    { cost_code: "14", amount: 50, payment_status: "Paid" },
    { cost_code: "99", amount: 20, payment_status: "Paid" }, // maps to no cost code
    { cost_code: "01", amount: 70, payment_status: "Unpaid" },
    { cost_code: "01", amount: 999, payment_status: "Voided" },
  ];

  const legacyActual = expenses
    .filter((e) => !["Voided", "Void"].includes(e.payment_status))
    .filter((e) => e.payment_status === "Paid")
    .reduce((s, e) => s + e.amount, 0);
  const legacyCommitted = expenses
    .filter((e) => e.payment_status !== "Voided")
    .reduce((s, e) => s + e.amount, 0);

  it("actual equals the old Portfolio sum of Paid expenses", () => {
    expect(resolveProjectSpend(codes, expenses).actual).toBe(legacyActual);
    expect(legacyActual).toBe(170);
  });

  it("committed equals the old Dashboard sum of non-voided expenses", () => {
    expect(resolveProjectSpend(codes, expenses).committed).toBe(legacyCommitted);
    expect(legacyCommitted).toBe(240);
  });

  it("diverges only once a column is actually typed in", () => {
    const typed = [{ cost_code_number: "01", actual_cost: 5000, committed_cost: 0 }, codes[1]];
    expect(resolveProjectSpend(typed, expenses).actual).not.toBe(legacyActual);
    expect(resolveProjectSpend(typed, expenses).actual).toBe(5000 + 50 + 20);
  });
});
