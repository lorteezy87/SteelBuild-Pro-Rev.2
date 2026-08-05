import { describe, expect, it } from "vitest";
import {
  gradeScore,
  gradeInverseScore,
  buildScorecardKpis,
  computeOverallScorecardScore,
} from "../financialScorecardHelpers";

describe("financialScorecardHelpers", () => {
  it("grades values", () => {
    expect(gradeScore(null, { green: [0.95, 999], amber: [0.85, 0.9499] }).label).toBe("N/A");
    expect(gradeScore(1, { green: [0.95, 999], amber: [0.85, 0.9499] }).health).toBe("good");
    expect(gradeInverseScore(20, { green: 30, amber: 45 }).health).toBe("good");
    expect(gradeInverseScore(50, { green: 30, amber: 45 }).health).toBe("risk");
  });

  it("builds scorecard kpis and overall score", () => {
    const kpis = buildScorecardKpis({
      project: { id: "p1" },
      workPackages: [],
      expenses: [
        { payment_status: "Paid", amount: 100 },
        { payment_status: "Voided", amount: 999 },
      ],
      changeOrders: [],
      sovItems: [
        {
          project_id: "p1",
          line_item_number: 1,
          application_number: 1,
          status: "Certified",
          scheduled_value: 200,
          current_percent_complete: 50,
          retainage_percent: 10,
          payment_received_date: "2026-07-10",
          submitted_date: "2026-07-01",
        },
      ],
      costCodes: [{ budget: 500 }],
      rfis: [],
      deliveries: [],
      inspections: [],
      scheduleTasks: [],
      calcContractValue: () => ({
        original: 1000,
        revised: 1000,
        approvedCOTotal: 0,
        pendingCOValue: 0,
        pendingCOCount: 0,
      }),
      calcEVM: () => ({
        cpi: 1.1,
        spi: 1.0,
        eac: 900,
        bac: 1000,
        vac: 100,
        tcpi: 0.9,
        ev: 500,
        ac: 450,
      }),
      calcWpProgress: () => ({ pct: 50 }),
      calcLaborBurn: () => ({ burnPct: 40 }),
      computeCostCodeTotals: (codes) => ({
        budget: codes.reduce((s: number, c: any) => s + (c.budget || 0), 0),
      }),
      calculateMarginRisk: () => ({ totalExposure: 12 }),
    });
    expect(kpis).not.toBeNull();
    expect(kpis!.committed).toBe(100);
    expect(kpis!.billed).toBe(100);
    expect(kpis!.riskExposure).toBe(12);
    const overall = computeOverallScorecardScore(kpis);
    expect(overall!.pct).toBeGreaterThan(0);
    expect(["Strong", "Moderate", "Weak"]).toContain(overall!.label);
  });
});
