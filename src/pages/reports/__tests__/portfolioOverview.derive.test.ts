import { describe, expect, it } from "vitest";
import {
  buildHealthRollup,
  buildProjectRows,
  buildUrgentItems,
  buildWeeklySummary,
  filterAndSortProjectRows,
  type PortfolioActionItem,
  type PortfolioChangeOrder,
  type PortfolioDelivery,
  type PortfolioProject,
  type PortfolioProjectRow,
  type PortfolioRfi,
  type PortfolioRisk,
  type PortfolioWorkPackage,
  type PortfolioCostCode,
  type PortfolioExpense,
} from "../portfolioOverview.derive";

function project(overrides: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    id: "project-1",
    name: "Alpha Fabrication",
    project_number: "P-100",
    phase: "Fabrication",
    original_contract_value: 100000,
    start_date: "2026-07-01",
    target_completion_date: "2026-07-31",
    ...overrides,
  };
}

function costCode(overrides: Partial<PortfolioCostCode> = {}): PortfolioCostCode {
  return {
    id: "cost-1",
    project_id: "project-1",
    budget_amount: 90000,
    actual_cost: 85000,
    ...overrides,
  };
}

function expense(overrides: Partial<PortfolioExpense> = {}): PortfolioExpense {
  return {
    id: "expense-1",
    project_id: "project-1",
    payment_status: "Paid",
    amount: 120000,
    ...overrides,
  };
}

function rfi(overrides: Partial<PortfolioRfi> = {}): PortfolioRfi {
  return {
    id: "rfi-1",
    project_id: "project-1",
    status: "Open",
    priority: "Medium",
    title: "Anchor bolts",
    ...overrides,
  };
}

function changeOrder(overrides: Partial<PortfolioChangeOrder> = {}): PortfolioChangeOrder {
  return {
    id: "co-1",
    project_id: "project-1",
    status: "Submitted",
    co_amount: 25000,
    title: "Steel escalation",
    co_number: "CO-01",
    ...overrides,
  };
}

function workPackage(overrides: Partial<PortfolioWorkPackage> = {}): PortfolioWorkPackage {
  return {
    id: "wp-1",
    project_id: "project-1",
    percent_complete: 100,
    tonnage: 10,
    status: "Complete",
    ...overrides,
  };
}

describe("buildProjectRows", () => {
  it("preserves the page's revised-contract, actuals, progress, and elapsed math", () => {
    const now = new Date("2026-07-27T00:00:00.000Z");
    const rows = buildProjectRows({
      projects: [
        project(),
        project({
          id: "project-2",
          name: "Beta Detailing",
          project_number: "P-200",
          phase: "Detailing",
          original_contract_value: 50000,
          start_date: "2026-07-10",
          target_completion_date: "2026-08-09",
        }),
      ],
      costCodes: [
        costCode(),
        costCode({ id: "cost-2", project_id: "project-2", budget_amount: 0, actual_cost: 30000 }),
      ],
      expenses: [
        expense(),
        expense({ id: "expense-2", project_id: "project-2", amount: 0, payment_status: "Pending" }),
      ],
      rfis: [
        rfi(),
        rfi({ id: "rfi-2", project_id: "project-1", status: "Closed" }),
        rfi({ id: "rfi-3", project_id: "project-2", status: "Under Review" }),
      ],
      changeOrders: [
        changeOrder(),
        changeOrder({ id: "co-2", project_id: "project-1", status: "Approved", co_amount: 25000 }),
        changeOrder({ id: "co-3", project_id: "project-2", status: "Approved", co_amount: 5000 }),
      ],
      workPackages: [
        workPackage(),
        workPackage({ id: "wp-2", percent_complete: 50, tonnage: 20, status: "In Progress" }),
        workPackage({ id: "wp-3", project_id: "project-2", percent_complete: 25, tonnage: 8, status: "In Progress" }),
      ],
      now,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "project-1",
      revisedContract: 125000,
      approvedDelta: 25000,
      budget: 90000,
      actual: 120000,
      variance: 30000,
      health: "risk",
      openRFIs: 1,
      openCOs: 1,
      wpPct: 75,
    });
    expect(rows[0].elapsedPct).toBeCloseTo(86.6667, 3);

    expect(rows[1]).toMatchObject({
      id: "project-2",
      revisedContract: 55000,
      budget: 55000,
      actual: 30000,
      health: "good",
      openRFIs: 1,
      openCOs: 0,
      wpPct: 25,
    });
  });
});

describe("filterAndSortProjectRows", () => {
  const rows: PortfolioProjectRow[] = [
    {
      id: "alpha",
      number: "P-300",
      name: "Alpha Fabrication",
      phase: "Fabrication",
      health: "risk",
      budget: 300,
      actual: 325,
      variance: 25,
      var_pct: 8.3,
      revisedContract: 600,
      approvedDelta: 0,
      openRFIs: 1,
      openCOs: 0,
      wpPct: 80,
      elapsedPct: 90,
      raw: project({ id: "alpha" }),
    },
    {
      id: "beta",
      number: "P-100",
      name: "Beta Detailing",
      phase: "Detailing",
      health: "watch",
      budget: 100,
      actual: 80,
      variance: -20,
      var_pct: -20,
      revisedContract: 400,
      approvedDelta: 0,
      openRFIs: 0,
      openCOs: 1,
      wpPct: 45,
      elapsedPct: 55,
      raw: project({ id: "beta" }),
    },
    {
      id: "gamma",
      number: "P-200",
      name: "Gamma Closeout",
      phase: "Closeout",
      health: "good",
      budget: 200,
      actual: 200,
      variance: 0,
      var_pct: 0,
      revisedContract: 0,
      approvedDelta: 0,
      openRFIs: 0,
      openCOs: 0,
      wpPct: 100,
      elapsedPct: 100,
      raw: project({ id: "gamma", phase: "Closeout" }),
    },
  ];

  it("applies KPI filters and then sorts without mutating the source rows", () => {
    const input = [...rows];
    const out = filterAndSortProjectRows({
      projectRows: input,
      kpiFilter: "alerts",
      search: "",
      sortField: "number",
      sortDir: "asc",
      overdueActions: [],
      criticalRisks: [{ id: "risk-1", project_id: "beta", severity: "Critical" } as PortfolioRisk],
      openRfis: [{ id: "rfi-alert", project_id: "alpha", priority: "Critical", status: "Open" }],
      lateDeliveries: [{ id: "delivery-1", project_id: "gamma", status: "Scheduled" } as PortfolioDelivery],
    });

    expect(out.map((row) => row.id)).toEqual(["beta", "gamma", "alpha"]);
    expect(input.map((row) => row.id)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("composes text search with the filtered result set", () => {
    const out = filterAndSortProjectRows({
      projectRows: rows,
      kpiFilter: "active",
      search: "fabric",
      sortField: "name",
      sortDir: "asc",
      overdueActions: [],
      criticalRisks: [],
      openRfis: [],
      lateDeliveries: [],
    });

    expect(out.map((row) => row.id)).toEqual(["alpha"]);
  });
});

describe("buildUrgentItems", () => {
  it("caps each source list and preserves RFI → CO → delivery ordering", () => {
    const overdueRfis = Array.from({ length: 7 }, (_, index) =>
      rfi({
        id: `rfi-${index}`,
        project_id: "project-1",
        rfi_number: `RFI-${index}`,
        priority: index === 0 ? "Critical" : "High",
      }),
    );
    const pendingChangeOrders = Array.from({ length: 5 }, (_, index) =>
      changeOrder({
        id: `co-${index}`,
        project_id: "project-2",
        co_number: `CO-${index}`,
        co_amount: index === 0 ? 60000 : 5000,
      }),
    );
    const lateDeliveries = Array.from({ length: 5 }, (_, index) =>
      ({
        id: `delivery-${index}`,
        project_id: "project-3",
        vendor: `Vendor ${index}`,
        description: `Delivery ${index}`,
      }) as PortfolioDelivery,
    );

    const items = buildUrgentItems({
      overdueRfis,
      pendingChangeOrders,
      lateDeliveries,
      projects: [
        project({ id: "project-1", name: "Alpha" }),
        project({ id: "project-2", name: "Beta" }),
        project({ id: "project-3", name: "Gamma" }),
      ],
    });

    expect(items).toHaveLength(14);
    expect(items[0]).toMatchObject({
      kind: "RFI",
      severity: "critical",
      meta: "Alpha",
      page: "RFIs",
    });
    expect(items[6]).toMatchObject({
      kind: "CO",
      severity: "high",
      meta: "Beta",
      page: "ChangeOrders",
    });
    expect(items[10]).toMatchObject({
      kind: "DELIVERY",
      severity: "high",
      meta: "Gamma",
      page: "Deliveries",
    });
  });
});

describe("buildWeeklySummary", () => {
  it("uses approved_date, updated_at, and actual_date for the weekly rollup", () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    const summary = buildWeeklySummary({
      rfis: [
        rfi({ created_at: "2026-07-26T00:00:00.000Z" }),
        rfi({ id: "rfi-2", status: "Closed", date_answered: "2026-07-25T00:00:00.000Z" }),
        rfi({ id: "rfi-3", created_at: "2026-07-15T00:00:00.000Z" }),
      ],
      changeOrders: [
        changeOrder({ created_at: "2026-07-26T00:00:00.000Z" }),
        changeOrder({ id: "co-2", status: "Approved", approved_date: "2026-07-24T00:00:00.000Z", co_amount: 40000 }),
        changeOrder({ id: "co-3", status: "Approved", approved_date: "2026-07-10T00:00:00.000Z", co_amount: 99999 }),
      ],
      actionItems: [
        { id: "action-1", status: "Complete", updated_at: "2026-07-21T00:00:00.000Z" } as PortfolioActionItem,
        { id: "action-2", status: "Open", updated_at: "2026-07-26T00:00:00.000Z" } as PortfolioActionItem,
      ],
      deliveries: [
        { id: "delivery-1", status: "Delivered", actual_date: "2026-07-23T00:00:00.000Z" } as PortfolioDelivery,
        { id: "delivery-2", status: "Delivered", actual_date: "2026-07-01T00:00:00.000Z" } as PortfolioDelivery,
      ],
      now,
    });

    expect(summary).toEqual({
      newRFIs: 1,
      closedRFIs: 1,
      newCOs: 1,
      approvedCOs: 1,
      approvedCOValue: 40000,
      completedActions: 1,
      recentDeliveries: 1,
      weekStart: "Jul 20",
      weekEnd: "Jul 27, 2026",
    });
  });
});

describe("buildHealthRollup", () => {
  it("counts each health bucket for executive summaries", () => {
    expect(
      buildHealthRollup([
        { health: "good" } as PortfolioProjectRow,
        { health: "watch" } as PortfolioProjectRow,
        { health: "watch" } as PortfolioProjectRow,
        { health: "risk" } as PortfolioProjectRow,
        { health: "neutral" } as PortfolioProjectRow,
      ]),
    ).toEqual({
      good: 1,
      watch: 2,
      risk: 1,
      neutral: 1,
    });
  });
});
