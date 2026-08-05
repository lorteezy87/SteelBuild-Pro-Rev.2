import { describe, expect, it } from "vitest";
import {
  buildTeamPeople,
  isOpenScheduleTask,
  teamOpenTotals,
} from "../teamDashboardHelpers";
import {
  countActiveTasks,
  groupInProgressByAssignee,
} from "../whosDoingWhatHelpers";

describe("teamDashboardHelpers", () => {
  it("isOpenScheduleTask excludes Complete and Cancelled", () => {
    expect(isOpenScheduleTask({ status: "In Progress" })).toBe(true);
    expect(isOpenScheduleTask({ status: "Complete" })).toBe(false);
    expect(isOpenScheduleTask({ status: "Cancelled" })).toBe(false);
    expect(isOpenScheduleTask({})).toBe(true);
  });

  it("buildTeamPeople aggregates open work and sorts by total desc", () => {
    const people = buildTeamPeople({
      tasks: [
        { status: "In Progress", assigned_to: " Alice " },
        { status: "Complete", assigned_to: "Alice" },
        { status: "Not Started", assigned_to: "Bob" },
        { status: "In Progress", assigned_to: "  " },
      ],
      rfis: [
        { status: "Open", assigned_to: "Alice" },
        { status: "Closed", ball_in_court: "Bob" },
        { status: "Under Review", ball_in_court: "Bob" },
      ],
      actionItems: [
        { status: "Open", assigned_to: "Bob" },
        { status: "Complete", assigned_to: "Alice" },
      ],
    });
    // Alice: 1 task + 1 rfi = 2; Bob: 1 task + 1 rfi + 1 action = 3
    expect(people.map((p) => p.name)).toEqual(["Bob", "Alice"]);
    expect(people[0]).toMatchObject({ tasks: 1, rfis: 1, actions: 1, total: 3 });
    expect(people[1]).toMatchObject({ tasks: 1, rfis: 1, actions: 0, total: 2 });
  });

  it("teamOpenTotals counts open queues", () => {
    expect(
      teamOpenTotals({
        tasks: [{ status: "In Progress" }, { status: "Complete" }],
        rfis: [{ status: "Open" }, { status: "Void" }],
        actionItems: [{ status: "In Progress" }, { status: "Cancelled" }],
      }),
    ).toEqual({ tasks: 1, rfis: 1, actions: 1 });
  });
});

describe("whosDoingWhatHelpers", () => {
  it("groups in-progress tasks by assignee with project enrichment", () => {
    const projectsById = new Map([
      ["p1", { name: "Alpha", project_number: "A-1" }],
    ]);
    const groups = groupInProgressByAssignee({
      tasks: [
        {
          id: "t1",
          status: "In Progress",
          assigned_to: "Alice",
          task_name: "Weld",
          project_id: "p1",
          phase: "Fab",
          end_date: "2026-08-10",
          percent_complete: 40,
        },
        {
          id: "t2",
          status: "In Progress",
          assigned_to: "",
          task_name: "Paint",
          project_id: "missing",
          end_date: null,
          percent_complete: 0,
        },
        {
          id: "t3",
          status: "Complete",
          assigned_to: "Alice",
          task_name: "Done",
          project_id: "p1",
        },
        {
          id: "t4",
          status: "In Progress",
          assigned_to: "Alice",
          task_name: "Earlier",
          project_id: "p1",
          end_date: "2026-08-01",
        },
      ],
      projectsById,
    });
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("Alice");
    expect(groups[0].items.map((i) => i.taskName)).toEqual(["Earlier", "Weld"]);
    expect(groups[0].items[1]).toMatchObject({
      projectName: "Alpha",
      projectNumber: "A-1",
      pct: 40,
    });
    expect(groups[1].name).toBe("Unassigned");
    expect(groups[1].items[0].projectName).toBe("—");
    expect(countActiveTasks(groups)).toBe(3);
  });
});
