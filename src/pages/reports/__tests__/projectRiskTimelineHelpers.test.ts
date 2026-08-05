import { describe, expect, it } from "vitest";
import {
  buildProjectStatusRows,
  filterProjectStatusRows,
  projectStatusPortfolioTotals,
} from "../projectStatusHelpers";
import {
  buildCategoryBarData,
  buildSeveritySegments,
  computeRisksDashboardKpis,
  scopeRisksByProject,
  topOpenRisks,
} from "../risksDashboardHelpers";
import {
  filterTimelineTasks,
  groupTasksByPhase,
  monthsBetween,
  timelineDateRange,
  timelineXFor,
} from "../timelineHelpers";
import {
  buildProjectMilestoneRows,
  filterProjectMilestoneRows,
} from "../projectMilestonesHelpers";

describe("projectStatusHelpers", () => {
  it("builds financial rows, filters, and portfolio totals", () => {
    const rows = buildProjectStatusRows({
      projects: [
        {
          id: "p1",
          name: "Alpha",
          project_number: "A1",
          phase: "Fab",
          health_status: "On Track",
          job_type: "Structural",
          start_date: "2026-01-01",
          target_completion_date: "2026-12-01",
          original_contract_value: 1000,
        },
        {
          id: "p2",
          name: "Beta",
          phase: "Erect",
          original_contract_value: 500,
        },
      ],
      changeOrders: [
        { project_id: "p1", status: "Approved", amount: 100 },
      ],
      expenses: [
        { project_id: "p1", payment_status: "Paid", amount: 200 },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].number).toBe("A1");
    expect(rows[0].revised).toBeGreaterThan(0);
    expect(typeof rows[0].margin).toBe("number");

    const filtered = filterProjectStatusRows(rows, {
      search: "alpha",
      phaseFilter: "Fab",
    });
    expect(filtered).toHaveLength(1);

    const totals = projectStatusPortfolioTotals(filtered);
    expect(totals.totalRevised).toBe(filtered[0].revised);
    expect(totals.portfolioMargin).toBeDefined();
  });
});

describe("risksDashboardHelpers", () => {
  const risks = [
    {
      id: "1",
      project_id: "p1",
      status: "Open",
      severity: "Critical",
      category: "Schedule",
      probability: 5,
      impact: 5,
      title: "A",
    },
    {
      id: "2",
      project_id: "p1",
      status: "Mitigating",
      severity: "High",
      category: "Cost",
      probability: 4,
      impact: 4,
      title: "B",
    },
    {
      id: "3",
      project_id: "p2",
      status: "Closed",
      severity: "Low",
      category: "Safety",
      probability: 1,
      impact: 2,
      title: "C",
    },
  ];

  it("scopes, KPIs, charts, top open", () => {
    expect(scopeRisksByProject(risks, "p1")).toHaveLength(2);
    const kpis = computeRisksDashboardKpis(risks);
    expect(kpis).toMatchObject({
      total: 3,
      open: 1,
      mitigating: 1,
      closed: 1,
      criticalCount: 1,
    });
    expect(kpis.avgScore).toBeCloseTo((25 + 16 + 2) / 3, 5);

    const segs = buildSeveritySegments(risks);
    expect(segs.map((s) => s.label)).toEqual(["Critical", "High", "Low"]);

    const cats = buildCategoryBarData(risks);
    expect(cats.find((c) => c.name === "Schedule")).toMatchObject({
      budget: 1,
      actual: 1,
    });

    const top = topOpenRisks(risks, 5);
    expect(top[0].score).toBe(25);
    expect(top.map((r) => r.id)).toEqual(["1", "2"]);
  });
});

describe("timelineHelpers", () => {
  it("filters, range, months, group, x mapping", () => {
    const tasks = [
      {
        id: "t1",
        start_date: "2026-01-15",
        end_date: "2026-03-01",
        project_id: "p1",
        phase: "Fab",
      },
      {
        id: "t2",
        start_date: "2026-02-01",
        end_date: null,
        project_id: "p1",
        phase: "Fab",
      },
      {
        id: "t3",
        start_date: "2026-02-10",
        end_date: "2026-02-20",
        project_id: "p2",
        phase: "Erect",
      },
    ];
    const filtered = filterTimelineTasks(tasks, {
      projectFilter: "p1",
      phases: ["Fab", "Erect"],
    });
    expect(filtered).toHaveLength(1);
    const { minDate, maxDate } = timelineDateRange(filtered);
    expect(minDate?.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(maxDate?.toISOString().slice(0, 10)).toBe("2026-03-01");
    const months = monthsBetween(minDate!, maxDate!);
    expect(months.length).toBeGreaterThanOrEqual(2);
    expect(groupTasksByPhase(filtered, ["Fab", "Erect"]).Fab).toHaveLength(1);
    const totalMs = maxDate!.getTime() - minDate!.getTime();
    expect(
      timelineXFor({
        date: minDate!,
        minDate,
        totalMs,
        leftGutter: 120,
        innerW: 600,
      }),
    ).toBe(120);
  });
});

describe("projectMilestonesHelpers", () => {
  it("builds and filters milestone rows", () => {
    const projectsById = new Map([
      ["p1", { name: "Alpha", project_number: "A1" }],
      ["p2", { name: "Bravo", project_number: "B1" }],
    ]);
    const rows = buildProjectMilestoneRows({
      projectsById,
      tasks: [
        {
          id: "m1",
          task_type: "Milestone",
          task_name: "Steel",
          project_id: "p2",
          start_date: "2026-08-10",
          status: "Not Started",
        },
        {
          id: "m2",
          is_milestone: true,
          task_name: "Pour",
          project_id: "p1",
          start_date: "2026-08-01",
          status: "Complete",
        },
        {
          id: "t1",
          task_type: "Task",
          task_name: "No",
          project_id: "p1",
        },
      ],
    });
    expect(rows.map((r) => r.taskName)).toEqual(["Pour", "Steel"]);
    expect(
      filterProjectMilestoneRows(rows, { statusFilter: "open" }),
    ).toHaveLength(1);
    expect(
      filterProjectMilestoneRows(rows, {
        statusFilter: "complete",
        search: "pour",
      }),
    ).toHaveLength(1);
    expect(
      filterProjectMilestoneRows(rows, { projectFilter: "p2" })[0].projectName,
    ).toBe("Bravo");
  });
});
