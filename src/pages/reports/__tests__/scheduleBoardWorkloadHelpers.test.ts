import { describe, expect, it } from "vitest";
import {
  countKeyActivities,
  groupUpcomingKeyActivities,
} from "../upcomingKeyActivitiesHelpers";
import { buildWorkloadRows, maxInProgressLoad } from "../workloadHelpers";
import {
  filterTaskBoardRows,
  groupTaskBoardColumns,
  mapTasksToBoardRows,
} from "../taskBoardHelpers";

describe("upcomingKeyActivitiesHelpers", () => {
  it("groups open leaf tasks in window by project", () => {
    const now = new Date("2026-08-05T12:00:00");
    const projectsById = new Map([
      ["p2", { name: "Alpha", project_number: "A1" }],
      ["p1", { name: "Bravo", project_number: "B1" }],
    ]);
    const groups = groupUpcomingKeyActivities({
      now,
      windowDays: 14,
      projectsById,
      tasks: [
        {
          id: "t1",
          start_date: "2026-08-08",
          status: "Not Started",
          project_id: "p1",
          task_name: "Weld",
          task_type: "Fab",
          phase: "Fab",
        },
        {
          id: "t2",
          start_date: "2026-08-06",
          status: "In Progress",
          project_id: "p2",
          task_name: "Erect",
        },
        {
          id: "t3",
          start_date: "2026-08-07",
          status: "Complete",
          project_id: "p2",
          task_name: "Done",
        },
        {
          id: "parent",
          start_date: "2026-08-09",
          status: "In Progress",
          project_id: "p2",
          task_name: "Parent",
        },
        {
          id: "child",
          start_date: "2026-08-10",
          status: "Not Started",
          project_id: "p2",
          task_name: "Child",
          parent_task_id: "parent",
        },
      ],
    });
    expect(groups.map((g) => g.projectName)).toEqual(["Alpha", "Bravo"]);
    expect(groups[0].tasks.map((t) => t.taskName)).toEqual(["Erect", "Child"]);
    expect(groups[0].tasks[0].daysOut).toBe(1);
    expect(countKeyActivities(groups)).toBe(3);
  });
});

describe("workloadHelpers", () => {
  it("counts statuses per assignee and max load", () => {
    const rows = buildWorkloadRows([
      { assigned_to: "Alice", status: "In Progress" },
      { assigned_to: "Alice", status: "In Progress" },
      { assigned_to: "Alice", status: "Not Started" },
      { assigned_to: "Bob", status: "Delayed" },
      { assigned_to: "  ", status: "In Progress" },
      { assigned_to: "Bob", status: "Complete" },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Alice", "Bob"]);
    expect(rows[0]).toMatchObject({
      inProgress: 2,
      notStarted: 1,
      delayed: 0,
      total: 3,
    });
    expect(rows[1]).toMatchObject({
      inProgress: 0,
      delayed: 1,
      total: 1,
    });
    expect(maxInProgressLoad(rows)).toBe(2);
    expect(maxInProgressLoad([])).toBe(1);
  });
});

describe("taskBoardHelpers", () => {
  it("maps, filters, and groups board columns by end date", () => {
    const projectsById = new Map([
      ["p1", { name: "Alpha", project_number: "A1" }],
    ]);
    const all = mapTasksToBoardRows({
      projectsById,
      tasks: [
        {
          id: "t1",
          task_name: "Weld",
          project_id: "p1",
          status: "In Progress",
          end_date: "2026-08-10",
          phase: "Fab",
        },
        {
          id: "t2",
          task_name: "Paint",
          project_id: "p1",
          status: "In Progress",
          end_date: "2026-08-01",
        },
        {
          id: "t3",
          task_name: "Other",
          project_id: "p2",
          status: "Delayed",
        },
      ],
    });
    expect(all[0]).toMatchObject({
      taskName: "Weld",
      projectName: "Alpha",
      projectNumber: "A1",
    });
    expect(all[2].projectName).toBe("—");

    const filtered = filterTaskBoardRows(all, {
      projectFilter: "p1",
      search: "weld",
    });
    expect(filtered).toHaveLength(1);

    const cols = groupTaskBoardColumns(
      filterTaskBoardRows(all, { projectFilter: "p1" }),
    );
    expect(cols["In Progress"].map((r) => r.taskName)).toEqual(["Paint", "Weld"]);
    expect(cols["Delayed"]).toHaveLength(0);
  });
});
