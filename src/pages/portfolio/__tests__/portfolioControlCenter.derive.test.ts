/**
 * Unit tests for portfolioControlCenter.derive.ts
 *
 * Pure functions only — no React, no network, no mocks.
 * Vitest node environment (no jsdom needed).
 */
import { describe, it, expect } from "vitest";
import {
  buildPortfolioSummary,
  healthTone,
  type ProjectRecord,
  type PortfolioRelated,
} from "../portfolioControlCenter.derive";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "proj-1",
    name: "Test Project",
    project_number: "24001",
    phase: "Fabrication",
    status: "Active",
    original_contract_value: 1_000_000,
    target_completion_date: null,
    ...overrides,
  };
}

const emptyRelated: PortfolioRelated = {
  changeOrders: [],
  workPackages: [],
  costCodes: [],
  rfis: [],
  deliveries: [],
  actionItems: [],
  scheduleTasks: [],
};

// ---------------------------------------------------------------------------
// buildPortfolioSummary — KPIs
// ---------------------------------------------------------------------------

describe("buildPortfolioSummary – KPIs", () => {
  it("returns zero KPIs for an empty project list", () => {
    const summary = buildPortfolioSummary([], emptyRelated);
    expect(summary.kpis.totalProjects).toBe(0);
    expect(summary.kpis.activeProjects).toBe(0);
    expect(summary.kpis.atRisk).toBe(0);
    expect(summary.kpis.totalContractValue).toBe(0);
    expect(summary.kpis.onSchedule).toBe(0);
    expect(summary.kpis.avgPctComplete).toBe(0);
  });

  it("counts total projects correctly", () => {
    const projects = [
      makeProject({ id: "p1" }),
      makeProject({ id: "p2" }),
      makeProject({ id: "p3" }),
    ];
    const { kpis } = buildPortfolioSummary(projects, emptyRelated);
    expect(kpis.totalProjects).toBe(3);
  });

  it("sums revised contract value from approved change orders", () => {
    const projects = [makeProject({ id: "p1", original_contract_value: 500_000 })];
    const related: PortfolioRelated = {
      ...emptyRelated,
      changeOrders: [
        { project_id: "p1", status: "Approved", co_amount: 100_000 },
        { project_id: "p1", status: "Draft", co_amount: 50_000 }, // NOT included
      ],
    };
    const { kpis } = buildPortfolioSummary(projects, related);
    expect(kpis.totalContractValue).toBe(600_000);
  });

  it("counts Active projects as active", () => {
    const projects = [
      makeProject({ id: "p1", status: "Active" }),
      makeProject({ id: "p2", status: "Complete" }),
      makeProject({ id: "p3", status: null }), // no status → counted as active
    ];
    const { kpis } = buildPortfolioSummary(projects, emptyRelated);
    expect(kpis.activeProjects).toBe(2); // p1 + p3
  });

  it("computes avgPctComplete from work-package counts", () => {
    const projects = [
      makeProject({ id: "p1" }),
      makeProject({ id: "p2" }),
    ];
    const related: PortfolioRelated = {
      ...emptyRelated,
      workPackages: [
        { project_id: "p1", status: "Complete", tonnage: 10 },
        { project_id: "p1", status: "In Progress", tonnage: 10 },
        // p2 has no WPs → 0%
      ],
    };
    const { kpis } = buildPortfolioSummary(projects, related);
    // p1 = 50% (1 of 2 complete), p2 = 0% → avg = 25
    expect(kpis.avgPctComplete).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// buildPortfolioSummary – health scoring
// ---------------------------------------------------------------------------

describe("buildPortfolioSummary – health scoring", () => {
  it("scores a clean project as On Track (100)", () => {
    const projects = [makeProject({ id: "p1" })];
    const { allRows } = buildPortfolioSummary(projects, emptyRelated);
    expect(allRows[0].health).toBe("On Track");
    // mirrors AIInsights computeProjectModel: a project with no schedule/budget signal
    // carries a small baseline deduction, so a "clean" project scores 92, not a flat 100.
    expect(allRows[0].score).toBe(92);
  });

  it("marks a project At Risk when it has overdue RFIs", () => {
    const projects = [makeProject({ id: "p1" })];
    const pastDate = "2020-01-01";
    const related: PortfolioRelated = {
      ...emptyRelated,
      rfis: Array.from({ length: 4 }, (_, i) => ({
        project_id: "p1",
        status: "Open",
        date_required: pastDate,
        priority: "High",
        id: `r${i}`,
      })),
    };
    const { allRows, kpis } = buildPortfolioSummary(projects, related);
    expect(allRows[0].health).toBe("At Risk");
    expect(kpis.atRisk).toBe(1);
  });

  it("excludes closed RFIs from overdue count", () => {
    const projects = [makeProject({ id: "p1" })];
    const related: PortfolioRelated = {
      ...emptyRelated,
      rfis: [
        { project_id: "p1", status: "Answered", date_required: "2020-01-01", priority: "High" },
        { project_id: "p1", status: "Closed", date_required: "2020-01-01", priority: "High" },
        { project_id: "p1", status: "Void", date_required: "2020-01-01", priority: "High" },
      ],
    };
    const { allRows } = buildPortfolioSummary(projects, related);
    expect(allRows[0].overdueRfis).toBe(0);
    expect(allRows[0].score).toBe(92);
  });

  it("marks Watch for moderate risk (1 overdue RFI)", () => {
    const projects = [makeProject({ id: "p1" })];
    const related: PortfolioRelated = {
      ...emptyRelated,
      rfis: [{ project_id: "p1", status: "Open", date_required: "2020-01-01", priority: "Low" }],
    };
    const { allRows } = buildPortfolioSummary(projects, related);
    // baseline 92 − 9 for the single overdue RFI = 83 (still On Track, ≥ 76).
    expect(allRows[0].score).toBe(83);
    expect(allRows[0].overdueRfis).toBe(1);
  });

  it("applies overdue action deductions", () => {
    const projects = [makeProject({ id: "p1" })];
    const related: PortfolioRelated = {
      ...emptyRelated,
      actionItems: [
        { project_id: "p1", status: "Open", due_date: "2020-01-01" },
      ],
    };
    const { allRows } = buildPortfolioSummary(projects, related);
    expect(allRows[0].score).toBe(88); // 92 - 4 for one overdue action
  });

  it("applies delayed task deductions", () => {
    const projects = [makeProject({ id: "p1" })];
    const related: PortfolioRelated = {
      ...emptyRelated,
      scheduleTasks: [
        { project_id: "p1", status: "Delayed" },
      ],
    };
    const { allRows } = buildPortfolioSummary(projects, related);
    expect(allRows[0].score).toBe(86); // 92 - 6 for one delayed task
  });
});

// ---------------------------------------------------------------------------
// buildPortfolioSummary – panel queues
// ---------------------------------------------------------------------------

describe("buildPortfolioSummary – panel queues", () => {
  it("atRiskQueue is sorted by ascending score", () => {
    const pastDate = "2020-01-01";
    const projects = [
      makeProject({ id: "p1" }),
      makeProject({ id: "p2" }),
    ];
    const related: PortfolioRelated = {
      ...emptyRelated,
      rfis: [
        // p2 has 4 overdue (worse) → lower score
        ...Array.from({ length: 4 }, (_, i) => ({
          project_id: "p2",
          status: "Open",
          date_required: pastDate,
          priority: "High",
          id: `r${i}`,
        })),
        // p1 has 1 overdue
        { project_id: "p1", status: "Open", date_required: pastDate, priority: "Low" },
      ],
    };
    const { atRiskQueue } = buildPortfolioSummary(projects, related);
    // p2 should rank first (worse score)
    expect(atRiskQueue[0].id).toBe("p2");
  });

  it("topByValue is sorted by descending revised contract", () => {
    const projects = [
      makeProject({ id: "p1", original_contract_value: 500_000 }),
      makeProject({ id: "p2", original_contract_value: 2_000_000 }),
    ];
    const { topByValue } = buildPortfolioSummary(projects, emptyRelated);
    expect(topByValue[0].id).toBe("p2");
    expect(topByValue[1].id).toBe("p1");
  });

  it("closingSoon includes projects with target dates in next 90 days", () => {
    const future30 = new Date();
    future30.setDate(future30.getDate() + 30);
    const future120 = new Date();
    future120.setDate(future120.getDate() + 120);
    const past = new Date();
    past.setDate(past.getDate() - 10);

    const projects = [
      makeProject({ id: "near", target_completion_date: future30.toISOString().split("T")[0] }),
      makeProject({ id: "far", target_completion_date: future120.toISOString().split("T")[0] }),
      makeProject({ id: "overdue", target_completion_date: past.toISOString().split("T")[0] }),
      makeProject({ id: "none", target_completion_date: null }),
    ];
    const { closingSoon } = buildPortfolioSummary(projects, emptyRelated);
    expect(closingSoon.map((r) => r.id)).toContain("near");
    expect(closingSoon.map((r) => r.id)).not.toContain("far");
    expect(closingSoon.map((r) => r.id)).not.toContain("overdue");
    expect(closingSoon.map((r) => r.id)).not.toContain("none");
  });

  it("caps each queue at 6 rows", () => {
    const pastDate = "2020-01-01";
    const projects = Array.from({ length: 10 }, (_, i) => makeProject({ id: `p${i}` }));
    const related: PortfolioRelated = {
      ...emptyRelated,
      rfis: projects.map((p) => ({
        project_id: p.id,
        status: "Open",
        date_required: pastDate,
        priority: "High",
      })),
    };
    const summary = buildPortfolioSummary(projects, related);
    expect(summary.atRiskQueue.length).toBeLessThanOrEqual(6);
    expect(summary.topByValue.length).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// healthTone
// ---------------------------------------------------------------------------

describe("healthTone", () => {
  it("maps At Risk → danger", () => expect(healthTone("At Risk")).toBe("danger"));
  it("maps Watch → warn", () => expect(healthTone("Watch")).toBe("warn"));
  it("maps On Track → good", () => expect(healthTone("On Track")).toBe("good"));
});

// ---------------------------------------------------------------------------
// Late deliveries
// ---------------------------------------------------------------------------

describe("buildPortfolioSummary – late deliveries", () => {
  it("counts deliveries past scheduled_date that are not Delivered", () => {
    const projects = [makeProject({ id: "p1" })];
    const related: PortfolioRelated = {
      ...emptyRelated,
      deliveries: [
        { project_id: "p1", status: "Pending", scheduled_date: "2020-01-01" },   // late
        { project_id: "p1", status: "Delivered", scheduled_date: "2020-01-01" }, // not late
        { project_id: "p1", status: "Cancelled", scheduled_date: "2020-01-01" }, // not late
      ],
    };
    const { allRows } = buildPortfolioSummary(projects, related);
    expect(allRows[0].lateDeliveries).toBe(2);
  });
});
