import { describe, expect, it } from "vitest";
import { resolveProjectSpend } from "../costRollup";

describe("project cost exposure", () => {
  it("keeps actual-only fabrication cost separate from future erection commitments", () => {
    const spend = resolveProjectSpend([
      { cost_code_number: "06", actual_cost: 900, committed_cost: 0 },
      { cost_code_number: "07", actual_cost: 0, committed_cost: 900 },
    ], []);
    expect(spend.actual).toBe(900);
    expect(spend.committed).toBe(900);
    expect(spend.costExposure).toBe(1800);
  });

  it("does not add actuals again when a code's total commitment already covers them", () => {
    const spend = resolveProjectSpend([
      { cost_code_number: "06", actual_cost: 600, committed_cost: 1000 },
    ], []);
    expect(spend.costExposure).toBe(1000);
  });

  it("reconciles manual overrides, expense-only codes and unmapped costs once", () => {
    const spend = resolveProjectSpend([
      { cost_code_number: "06", actual_cost: 700, committed_cost: 500 },
      { cost_code_number: "07" },
    ], [
      { cost_code: "06", amount: 100, payment_status: "Paid" },
      { cost_code: "07", amount: 200, payment_status: " paid " },
      { cost_code: "07", amount: 300, payment_status: "Unpaid" },
      { cost_code: "unknown", amount: 40, payment_status: "Paid" },
      { cost_code: "unknown", amount: 60, payment_status: "Pending Approval" },
      { cost_code: null, amount: 25, payment_status: "Paid" },
      { cost_code: "07", amount: 9999, payment_status: " void " },
      { cost_code: "unknown", amount: 9999, payment_status: "VOIDED" },
    ]);
    expect(spend).toMatchObject({
      actual: 965, committed: 1125,
      unmappedActual: 65, unmappedCommitted: 125, unmappedCount: 3,
      costExposure: 1325,
    });
  });

  it("preserves signed unmapped expense amounts without adding paid dollars twice", () => {
    const spend = resolveProjectSpend([], [
      { cost_code: "unknown", amount: 100, payment_status: "Paid" },
      { cost_code: "unknown", amount: 50, payment_status: "Unpaid" },
      { cost_code: null, amount: 25, payment_status: "Paid" },
      { cost_code: "unknown", amount: -10, payment_status: "Unpaid" },
      { cost_code: "unknown", amount: 900, payment_status: "Void" },
    ]);
    expect(spend).toMatchObject({ actual: 125, committed: 165, costExposure: 165, unmappedCount: 4 });
  });

  it("consumes expense fallback once for duplicate code numbers and retains each manual entry", () => {
    const spend = resolveProjectSpend([
      { id: "first", cost_code_number: "07", actual_cost: 900 },
      { id: "duplicate", cost_code_number: "07", committed_cost: 800 },
    ], [{ cost_code: "07", amount: 100, payment_status: "Paid" }]);
    expect(spend).toMatchObject({
      actual: 900, committed: 900, costExposure: 1700, unmappedCount: 0,
    });
  });

  it("returns zero exposure for empty or missing inputs", () => {
    expect(resolveProjectSpend([], []).costExposure).toBe(0);
    expect(resolveProjectSpend(null, null).costExposure).toBe(0);
    expect(resolveProjectSpend(undefined, undefined).costExposure).toBe(0);
  });
});
