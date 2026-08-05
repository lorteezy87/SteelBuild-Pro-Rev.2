import { describe, expect, it } from "vitest";
import {
  buildUpcomingMilestoneRows,
  filterUpcomingMilestoneRows,
  startOfDay,
} from "../upcomingMilestonesHelpers";

describe("upcomingMilestonesHelpers", () => {
  it("startOfDay zeros time", () => {
    const d = startOfDay(new Date("2026-08-05T15:30:00"));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("builds milestone rows in window, excludes summaries, sorts by project then date", () => {
    const now = new Date("2026-08-05T12:00:00");
    const projectsById = new Map([
      ["p1", { name: "Bravo", project_number: "B1" }],
      ["p2", { name: "Alpha", project_number: "A1" }],
    ]);
    const rows = buildUpcomingMilestoneRows({
      now,
      windowDays: 30,
      projectsById,
      tasks: [
        {
          id: "m1",
          task_type: "Milestone",
          start_date: "2026-08-10",
          task_name: "Steel erect",
          project_id: "p1",
          phase: "Erect",
          status: "Not Started",
        },
        {
          id: "m2",
          task_type: "Milestone",
          start_date: "2026-08-08",
          task_name: "Fab complete",
          project_id: "p2",
          phase: "Fab",
        },
        {
          id: "m3",
          task_type: "Milestone",
          start_date: "2026-07-01",
          task_name: "Past",
          project_id: "p2",
        },
        {
          id: "m4",
          task_type: "Task",
          start_date: "2026-08-09",
          task_name: "Not a milestone",
          project_id: "p2",
        },
        {
          id: "parent",
          task_type: "Milestone",
          start_date: "2026-08-12",
          task_name: "Summary-ish",
          project_id: "p2",
        },
        {
          id: "child",
          task_type: "Task",
          start_date: "2026-08-13",
          task_name: "Child",
          project_id: "p2",
          parent_task_id: "parent",
        },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["m2", "m1"]);
    expect(rows[0]).toMatchObject({
      projectName: "Alpha",
      daysOut: 3,
      taskName: "Fab complete",
    });
    expect(rows[1].projectName).toBe("Bravo");
  });

  it("filterUpcomingMilestoneRows matches name / project fields", () => {
    const rows = [
      {
        id: "1",
        taskName: "Pour",
        projectId: "p1",
        projectName: "Tower",
        projectNumber: "T-9",
        phase: "",
        startDate: "2026-08-10",
        daysOut: 5,
        status: "Not Started",
      },
    ];
    expect(filterUpcomingMilestoneRows(rows, "tower")).toHaveLength(1);
    expect(filterUpcomingMilestoneRows(rows, "t-9")).toHaveLength(1);
    expect(filterUpcomingMilestoneRows(rows, "pour")).toHaveLength(1);
    expect(filterUpcomingMilestoneRows(rows, "nope")).toHaveLength(0);
    expect(filterUpcomingMilestoneRows(rows, "  ")).toHaveLength(1);
  });
});
