import { describe, expect, it } from "vitest";
import {
  buildBudgetTrendData,
  buildCostByPhase,
  buildProjectDrilldownKpis,
  buildCrewTeamRows,
  selectRecentLogs,
  fmtShort$,
} from "../projectDrilldownHelpers";

describe("fmtShort$", () => {
  it("compacts large currency", () => {
    expect(fmtShort$(1_500_000)).toBe("$1.5M");
    expect(fmtShort$(2500)).toBe("$3K");
  });
});

describe("buildCostByPhase / budget trend", () => {
  it("aggregates phase budgets", () => {
    const rows = buildCostByPhase([
      { phase: "Fab", budget_amount: 100, actual_cost: 40 },
      { phase: "Fab", budget_amount: 50, actual_cost: 10 },
    ]);
    expect(rows[0]).toMatchObject({ phase: "Fab", budget: 150, actual: 50 });
  });
  it("builds multi-point trend for approved COs", () => {
    const trend = buildBudgetTrendData(
      { original_contract_value: 1000 },
      [
        { status: "Approved", co_amount: 100, approved_date: "2026-01-15" },
        { status: "Approved", co_amount: 50, approved_date: "2026-02-15" },
      ],
      [{ actual_cost: 200 }],
    );
    expect(trend).not.toBeNull();
    expect(trend!.length).toBeGreaterThan(1);
  });
});

describe("kpis / team / logs", () => {
  it("computes open RFIs and CPI", () => {
    const k = buildProjectDrilldownKpis({
      project: { original_contract_value: 1000, health_status: "On Track" },
      codes: [{ budget_amount: 500, actual_cost: 200 }],
      cos: [{ status: "Approved", co_amount: 100 }],
      rfis: [
        { status: "Open", priority: "Critical" },
        { status: "Closed", priority: "Normal" },
      ],
      wps: [
        {
          status: "In Progress",
          percent_complete: 50,
          budgeted_labor_value: 100,
          budgeted_material_value: 100,
          actual_labor_cost_to_date: 50,
          actual_material_cost_to_date: 50,
        },
      ],
    });
    expect(k.openRFIs).toBe(1);
    expect(k.criticalRFIs).toBe(1);
    expect(k.revisedContract).toBe(1100);
    expect(k.cpi).toBe(1);
    expect(k.health.color).toContain("success");
  });
  it("rolls crews and recent logs", () => {
    const team = buildCrewTeamRows([
      { crew: "A", status: "Complete", percent_complete: 100 },
      { crew: "A", status: "In Progress", percent_complete: 40 },
    ]);
    expect(team[0].packages).toBe(2);
    expect(selectRecentLogs([{ date: "2026-01-01" }, { date: "2026-03-01" }], 1)[0].date).toBe(
      "2026-03-01",
    );
  });
});
