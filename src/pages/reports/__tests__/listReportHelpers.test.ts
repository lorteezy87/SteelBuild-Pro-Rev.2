import { describe, expect, it } from "vitest";
import { buildRiskListRows, filterRiskListRows } from "../risksListHelpers";
import {
  buildProjectsReportRows,
  filterProjectsReportRows,
} from "../projectsReportHelpers";
import {
  buildTasksReportRows,
  filterTasksReportRows,
} from "../tasksReportHelpers";

describe("risksListHelpers", () => {
  it("builds scored rows and filters multi-dimensionally", () => {
    const rows = buildRiskListRows({
      projectById: {
        p1: { project_number: "A1", name: "Alpha" },
      },
      risks: [
        {
          id: "1",
          project_id: "p1",
          title: "Late steel",
          owner: "Alice",
          category: "Schedule",
          description: "Mill delay",
          severity: "High",
          status: "Open",
          probability: 4,
          impact: 4,
        },
        {
          id: "2",
          project_id: "p2",
          title: "Budget",
          severity: "Low",
          status: "Closed",
          category: "Cost",
          probability: 1,
          impact: 2,
        },
      ],
    });
    expect(rows[0].score).toBe(16);
    expect(rows[0].projectLabel).toBe("A1 — Alpha");
    expect(rows[1].projectLabel).toBe("—");

    expect(
      filterRiskListRows(rows, {
        projectFilter: "p1",
        severityFilter: "High",
        statusFilter: "Open",
        categoryFilter: "Schedule",
        search: "steel",
      }),
    ).toHaveLength(1);
    expect(filterRiskListRows(rows, { search: "mill" })).toHaveLength(1);
    expect(filterRiskListRows(rows, { statusFilter: "Closed" })).toHaveLength(1);
  });
});

describe("projectsReportHelpers", () => {
  it("averages WP percent complete and filters", () => {
    const rows = buildProjectsReportRows({
      projects: [
        {
          id: "p1",
          name: "Alpha",
          project_number: "A1",
          general_contractor: "ACME",
          phase: "Fab",
          health_status: "On Track",
          original_contract_value: 1000,
        },
        {
          id: "p2",
          name: "Beta",
          phase: "Erect",
          health_status: "At Risk",
        },
      ],
      workPackages: [
        { project_id: "p1", percent_complete: 40 },
        { project_id: "p1", percent_complete: 60 },
      ],
    });
    expect(rows[0].pctComplete).toBe(50);
    expect(rows[0].contractValue).toBe(1000);
    expect(rows[1].pctComplete).toBe(0);
    expect(rows[1].number).toBe("P-p2");

    expect(
      filterProjectsReportRows(rows, {
        search: "acme",
        phaseFilter: "Fab",
        healthFilter: "On Track",
      }),
    ).toHaveLength(1);
  });
});

describe("tasksReportHelpers", () => {
  it("maps tasks with project labels and filters", () => {
    const projectsById = new Map([
      ["p1", { name: "Alpha", project_number: "A1" }],
    ]);
    const rows = buildTasksReportRows({
      projectsById,
      tasks: [
        {
          id: "t1",
          task_name: "Weld",
          project_id: "p1",
          phase: "Fab",
          task_type: "Fabrication",
          status: "In Progress",
          percent_complete: 25,
          assigned_to: "Alice",
        },
        {
          id: "t2",
          project_id: "missing",
          status: "Not Started",
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      taskName: "Weld",
      projectName: "Alpha",
      projectNumber: "A1",
      pct: 25,
    });
    expect(rows[1]).toMatchObject({
      taskName: "Untitled task",
      projectName: "—",
      type: "Task",
    });
    expect(
      filterTasksReportRows(rows, {
        projectFilter: "p1",
        phaseFilter: "Fab",
        typeFilter: "Fabrication",
        statusFilter: "In Progress",
        search: "alice",
      }),
    ).toHaveLength(1);
  });
});
