/**
 * Unit tests for portfolioOverview/format.ts — pure derive helpers only.
 */
import { describe, it, expect } from "vitest";
import {
  filterNotDeleted,
  computeElapsedPct,
  buildProjectRows,
  computePortfolioContract,
  computePortfolioRevised,
  computeBudgetVariance,
  computeTonsProduced,
  computeTonsPlanned,
  computePendingCOValue,
  computeCriticalAlertCount,
  computeHealthRollup,
  filterAndSortProjectRows,
  buildBarChartData,
  buildRfiDonutData,
  buildDriftRows,
  computeWeeklyActivity,
  formatPortfolioDate,
  filterLateDeliveries,
  filterOverdueRFIs,
} from "./format";

describe("formatPortfolioDate", () => {
  it("formats en-US short date", () => {
    const d = new Date("2026-07-27T12:00:00Z");
    expect(formatPortfolioDate(d)).toMatch(/Jul/);
    expect(formatPortfolioDate(d)).toMatch(/2026/);
  });
});

describe("filterNotDeleted", () => {
  it("removes rows with is_deleted true", () => {
    expect(filterNotDeleted([{ id: 1 }, { id: 2, is_deleted: true }])).toEqual([{ id: 1 }]);
  });
});

describe("computeElapsedPct", () => {
  it("returns 0 when dates missing or invalid", () => {
    const now = new Date("2026-06-15");
    expect(computeElapsedPct(null, null, now)).toBe(0);
    expect(computeElapsedPct(new Date("2026-06-01"), new Date("2026-05-01"), now)).toBe(0);
  });

  it("computes elapsed percentage capped at 100", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-07-01");
    const mid = new Date("2026-04-01");
    const pct = computeElapsedPct(start, end, mid);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});

describe("buildProjectRows", () => {
  const now = new Date("2026-06-15");

  it("builds per-project rollup with health and open counts", () => {
    const rows = buildProjectRows({
      projects: [{
        id: "p1",
        name: "Alpha",
        project_number: "24001",
        phase: "Fabrication",
        original_contract_value: 100000,
        start_date: "2026-01-01",
        target_completion_date: "2026-12-31",
      }],
      costCodes: [],
      expenses: [{ project_id: "p1", amount: 50000, payment_status: "Paid" }],
      rfis: [{ project_id: "p1", status: "Open" }],
      changeOrders: [{ project_id: "p1", status: "Submitted", co_amount: 10000 }],
      workPackages: [{ project_id: "p1", percent_complete: 50, tonnage: 100 }],
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alpha");
    expect(rows[0].openRFIs).toBe(1);
    expect(rows[0].openCOs).toBe(1);
    expect(rows[0].actual).toBe(50000);
    expect(rows[0].wpPct).toBe(50);
  });
});

describe("portfolio totals", () => {
  it("sums contract and variance", () => {
    const rows = [
      { revisedContract: 100, variance: -5 },
      { revisedContract: 200, variance: 10 },
    ];
    expect(computePortfolioRevised(rows)).toBe(300);
    expect(computeBudgetVariance(rows)).toBe(5);
  });

  it("sums original contract from projects", () => {
    expect(computePortfolioContract([
      { original_contract_value: 1000 },
      { original_contract_value: 2500 },
    ])).toBe(3500);
  });
});

describe("tons KPIs", () => {
  it("counts produced vs planned tonnage", () => {
    const wps = [
      { percent_complete: 100, tonnage: 50 },
      { percent_complete: 50, tonnage: 30 },
      { status: "Complete", tonnage: 20 },
    ];
    expect(computeTonsProduced(wps)).toBe(70);
    expect(computeTonsPlanned(wps)).toBe(100);
  });
});

describe("computePendingCOValue", () => {
  it("sums co_amount on pending COs", () => {
    expect(computePendingCOValue([
      { co_amount: 1000 },
      { co_amount: 2500 },
    ])).toBe(3500);
  });
});

describe("computeCriticalAlertCount", () => {
  it("combines critical RFIs, risks, and late deliveries", () => {
    expect(computeCriticalAlertCount(
      [{ priority: "Critical" }, { priority: "High" }],
      [{ id: "r1" }],
      [{ id: "d1" }, { id: "d2" }],
    )).toBe(4);
  });
});

describe("computeHealthRollup", () => {
  it("counts health buckets", () => {
    expect(computeHealthRollup([
      { health: "good" },
      { health: "good" },
      { health: "risk" },
    ])).toEqual({ good: 2, watch: 0, risk: 1, neutral: 0 });
  });
});

describe("filterAndSortProjectRows", () => {
  const baseRows = [
    { id: "a", name: "Bravo", number: "002", phase: "Fab", revisedContract: 0, openRFIs: 2, openCOs: 0, variance: 0 },
    { id: "b", name: "Alpha", number: "001", phase: "Closeout", revisedContract: 500, openRFIs: 0, openCOs: 1, variance: 100 },
  ];

  it("filters by KPI key", () => {
    const rfis = [{ project_id: "a", priority: "Critical" }];
    const filtered = filterAndSortProjectRows({
      projectRows: baseRows,
      kpiFilter: "rfis",
      search: "",
      sortField: "name",
      sortDir: "asc",
      overdueActions: [],
      criticalRisks: [],
      openRFIs: rfis,
      lateDeliveries: [],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("a");
  });

  it("sorts by field and direction", () => {
    const filtered = filterAndSortProjectRows({
      projectRows: baseRows,
      kpiFilter: null,
      search: "",
      sortField: "name",
      sortDir: "asc",
      overdueActions: [],
      criticalRisks: [],
      openRFIs: [],
      lateDeliveries: [],
    });
    expect(filtered[0].name).toBe("Alpha");
  });
});

describe("buildBarChartData", () => {
  it("returns top 12 projects with spend", () => {
    const data = buildBarChartData([
      { number: "P1", budget: 100, actual: 50 },
      { number: "P2", budget: 0, actual: 0 },
    ]);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("P1");
  });
});

describe("buildRfiDonutData", () => {
  it("returns only non-zero segments", () => {
    const segments = buildRfiDonutData([
      { status: "Open" },
      { status: "Closed" },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments.find((s) => s.label === "Open")?.value).toBe(1);
  });
});

describe("buildDriftRows", () => {
  it("excludes closeout and sorts by drift desc", () => {
    const rows = buildDriftRows([
      { id: "1", phase: "Fab", elapsedPct: 80, wpPct: 20, name: "A", number: "1" },
      { id: "2", phase: "Closeout", elapsedPct: 90, wpPct: 10, name: "B", number: "2" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].drift).toBe(60);
  });
});

describe("computeWeeklyActivity", () => {
  it("counts events in the last 7 days", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const recent = "2026-07-25T00:00:00Z";
    const weekly = computeWeeklyActivity({
      rfis: [{ created_at: recent, status: "Open" }],
      changeOrders: [{ created_at: recent, status: "Draft" }],
      actionItems: [{ status: "Complete", updated_at: recent }],
      deliveries: [{ status: "Delivered", actual_date: "2026-07-26" }],
      now,
    });
    expect(weekly.newRFIs).toBe(1);
    expect(weekly.newCOs).toBe(1);
    expect(weekly.completedActions).toBe(1);
    expect(weekly.recentDeliveries).toBe(1);
    expect(weekly.weekStart).toBeTruthy();
    expect(weekly.weekEnd).toBeTruthy();
  });
});

describe("delivery and RFI filters", () => {
  const now = new Date("2026-07-27");

  it("filterLateDeliveries uses scheduled_date", () => {
    const late = filterLateDeliveries([
      { status: "Scheduled", scheduled_date: "2026-07-01" },
      { status: "Delivered", scheduled_date: "2026-07-01" },
    ], now);
    expect(late).toHaveLength(1);
  });

  it("filterOverdueRFIs uses date_required", () => {
    const overdue = filterOverdueRFIs([
      { date_required: "2026-07-01" },
      { date_required: "2026-12-31" },
    ], now);
    expect(overdue).toHaveLength(1);
  });
});
