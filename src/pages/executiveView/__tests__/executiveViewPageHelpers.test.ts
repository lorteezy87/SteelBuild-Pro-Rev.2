import { describe, expect, it } from "vitest";
import {sumContractValue,
  sumApprovedCoValue,
  countApprovedCos,
  sumWpHours,
  countOpenRfis,
  countAtRiskProjects,
  countDelayedTasks,
  countTasksCompleteThisWeek,
  buildRfiSeverity,
  buildHealthData,
  buildPhaseData,
  buildLaborByProject,
  buildWaterfallData,
  buildRfiAging,
  buildProjectBudgetData, buildExecutiveKpis, EXECUTIVE_HEALTH_COLORS} from "../executiveViewPageHelpers";

const NOW = new Date("2026-08-05T12:00:00Z");

describe("executiveViewPageHelpers", () => {
  it("portfolio sums and counts", () => {
    expect(sumContractValue([{ original_contract_value: 100 }, { original_contract_value: 50 }])).toBe(150);
    expect(sumApprovedCoValue([{ status: "Approved", co_amount: 10 }, { status: "Draft", co_amount: 99 }])).toBe(10);
    expect(countApprovedCos([{ status: "Approved" }, { status: "Open" }])).toBe(1);
    expect(sumWpHours([{ shop_hours_budget: 2, field_hours_budget: 3, shop_hours_actual: 1, field_hours_actual: 1 }])).toEqual({
      budget: 5,
      actual: 2,
    });
    expect(countOpenRfis([{ status: "Open" }, { status: "Under Review" }, { status: "Closed" }])).toBe(2);
    expect(countAtRiskProjects([{ health_status: "At Risk" }, { health_status: "On Track" }])).toBe(1);
    expect(countDelayedTasks([{ status: "Delayed" }, { status: "Open" }])).toBe(1);
    expect(
      countTasksCompleteThisWeek(
        [
          { status: "Complete", end_date: "2026-08-03T00:00:00Z" },
          { status: "Complete", end_date: "2026-07-01T00:00:00Z" },
          { status: "Open", end_date: "2026-08-04T00:00:00Z" },
        ],
        NOW,
      ),
    ).toBe(1);
  });

  it("chart builders", () => {
    const projects = [
      { id: "p1", name: "Alpha", project_number: "A1", phase: "Detailing", health_status: "On Track", original_contract_value: 100 },
      { id: "p2", name: "Beta", project_number: "B1", phase: "Erection", health_status: "At Risk", original_contract_value: 200 },
    ];
    expect(buildPhaseData(projects).map((d) => d.name)).toEqual(["Detailing", "Erection"]);
    expect(buildHealthData(projects).map((d) => d.name)).toEqual(["On Track", "At Risk"]);
    expect(buildRfiSeverity([{ priority: "High" }, { priority: "High" }, { priority: "Low" }])).toEqual([
      { name: "High", value: 2 },
      { name: "Low", value: 1 },
    ]);
    expect(
      buildLaborByProject(projects, [
        { project_id: "p1", shop_hours_budget: 10, field_hours_budget: 0, shop_hours_actual: 4, field_hours_actual: 0 },
      ])[0],
    ).toEqual({ name: "A1", budget: 10, actual: 4 });
    const wf = buildWaterfallData(100, 115, [{ status: "Approved", co_number: "CO-1", co_amount: 15 }]);
    expect(wf).toHaveLength(3);
    expect(wf[1].name).toBe("CO-1");
    expect(
      buildProjectBudgetData(
        projects,
        [{ project_id: "p1" }],
        [{ project_id: "p1", status: "Approved", co_amount: 5 }],
        () => ({ budget: 80, actual: 40 }),
      )[0],
    ).toEqual({ name: "A1", budget: 80, actual: 40, revised: 105 });
  });

  it("rfi aging", () => {
    const rows = buildRfiAging(
      [{ id: "p1", name: "Alpha", project_number: "A1" }],
      [
        { project_id: "p1", status: "Open", date_required: "2026-08-01T00:00:00Z", submitted_date: "2026-07-26T00:00:00Z" },
        { project_id: "p1", status: "Closed", date_required: "2026-08-01T00:00:00Z" },
      ],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].open).toBe(1);
    expect(rows[0].overdue).toBe(1);
    expect(rows[0].avgDays).toBe(10);
  });
});

describe("buildExecutiveKpis", () => {
  it("builds eight portfolio KPI tiles", () => {
    const kpis = buildExecutiveKpis({
      revisedTotal: 100,
      totalSpend: 120,
      totalBudget: 100,
      approvedCOVal: 10,
      approvedCoCount: 2,
      laborBurnPct: 50,
      totalActualHrs: 40,
      openRfiCount: 3,
      atRiskCount: 1,
      delayedTaskCount: 0,
      completeThisWeekCount: 5,
      formatCurrency: (n) => `$${n}`,
      formatBudgetPercent: (n) => `${n}%`,
    });
    expect(kpis).toHaveLength(8);
    expect(kpis[0].label).toBe("Portfolio Value");
    expect(kpis[1].color).toBe("rose"); // over budget
    expect(kpis[6].color).toBe("green"); // no delayed
    expect(EXECUTIVE_HEALTH_COLORS).toHaveLength(3);
  });
});
