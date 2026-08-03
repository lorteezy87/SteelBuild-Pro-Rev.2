import { describe, expect, it } from "vitest";
import { buildPlannerCalendarEvents } from "../plannerCalendar";

describe("buildPlannerCalendarEvents", () => {
  it("maps action dates before due dates and preserves schedule ranges", () => {
    const actions = [
      {
        id: "a1",
        project_id: "p1",
        title: "Release embeds",
        status: "Open",
        priority: "High",
        archived_at: null,
        action_date: "2026-08-03",
        due_date: "2026-08-04",
      },
      {
        id: "a2",
        project_id: "p1",
        title: "Approve shop drawings",
        status: "Open",
        priority: "Medium",
        archived_at: null,
        action_date: null,
        due_date: "2026-08-04",
      },
    ];
    const scheduleTasks = [
      {
        id: "s1",
        project_id: "p1",
        task_name: "Fabricate columns",
        status: "In Progress",
        assigned_to: "u1",
        start_date: "2026-08-05",
        end_date: "2026-08-07",
      },
    ];

    const events = buildPlannerCalendarEvents({ actions, scheduleTasks });

    expect(events).toContainEqual({
      id: "action:a1",
      kind: "action",
      title: "Release embeds",
      start: "2026-08-03",
      end: "2026-08-03",
      projectId: "p1",
      sourceId: "a1",
    });
    expect(events).toContainEqual({
      id: "action:a2",
      kind: "action",
      title: "Approve shop drawings",
      start: "2026-08-04",
      end: "2026-08-04",
      projectId: "p1",
      sourceId: "a2",
    });
    expect(events).toContainEqual({
      id: "schedule_task:s1",
      kind: "schedule_task",
      title: "Fabricate columns",
      start: "2026-08-05",
      end: "2026-08-07",
      projectId: "p1",
      sourceId: "s1",
    });
  });

  it("flags milestones and excludes terminal or archived source rows", () => {
    const events = buildPlannerCalendarEvents({
      actions: [
        {
          id: "complete",
          project_id: "p1",
          title: "Complete action",
          status: "Complete",
          priority: "Medium",
          archived_at: null,
          due_date: "2026-08-03",
        },
        {
          id: "archived",
          project_id: "p1",
          title: "Archived action",
          status: "Open",
          priority: "Medium",
          archived_at: "2026-08-01T00:00:00Z",
          due_date: "2026-08-03",
        },
      ],
      scheduleTasks: [
        {
          id: "m1",
          project_id: "p1",
          task_name: "Topping out",
          status: "Not Started",
          assigned_to: null,
          start_date: "2026-08-08",
          end_date: null,
          is_milestone: true,
        },
        {
          id: "complete-task",
          project_id: "p1",
          task_name: "Completed task",
          status: "Complete",
          assigned_to: null,
          start_date: "2026-08-08",
          end_date: "2026-08-09",
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "schedule_task:m1",
        kind: "schedule_task",
        title: "Topping out",
        start: "2026-08-08",
        end: "2026-08-08",
        projectId: "p1",
        sourceId: "m1",
        isMilestone: true,
      },
    ]);
  });

  it("omits normalized terminal rows and invalid action or schedule starts", () => {
    const events = buildPlannerCalendarEvents({
      actions: [
        {
          id: "resolved",
          project_id: "p1",
          title: "Resolved action",
          status: " resolved ",
          priority: "Medium",
          archived_at: null,
          due_date: "2026-08-03",
        },
        {
          id: "invalid-action",
          project_id: "p1",
          title: "Invalid action",
          status: "Open",
          priority: "Medium",
          archived_at: null,
          action_date: "2026-02-30",
          due_date: "2026-8-03",
        },
        {
          id: "due-fallback",
          project_id: "p1",
          title: "Due fallback",
          status: "Open",
          priority: "Medium",
          archived_at: null,
          action_date: "2026-02-30",
          due_date: "2026-08-03",
        },
      ],
      scheduleTasks: [
        {
          id: "closed-task",
          project_id: "p1",
          task_name: "Closed task",
          status: " closed ",
          assigned_to: null,
          start_date: "2026-08-03",
          end_date: "2026-08-04",
        },
        {
          id: "missing-start",
          project_id: "p1",
          task_name: "Missing start",
          status: "In Progress",
          assigned_to: null,
          start_date: null,
          end_date: "2026-08-04",
        },
        {
          id: "impossible-start",
          project_id: "p1",
          task_name: "Impossible start",
          status: "In Progress",
          assigned_to: null,
          start_date: "2026-02-30",
          end_date: "2026-08-04",
        },
        {
          id: "invalid-end",
          project_id: "p1",
          task_name: "Invalid end",
          status: "In Progress",
          assigned_to: null,
          start_date: "2026-08-05",
          end_date: "2026-02-30",
        },
        {
          id: "reversed-end",
          project_id: "p1",
          task_name: "Reversed end",
          status: "In Progress",
          assigned_to: null,
          start_date: "2026-08-06",
          end_date: "2026-08-05",
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "action:due-fallback",
        kind: "action",
        title: "Due fallback",
        start: "2026-08-03",
        end: "2026-08-03",
        projectId: "p1",
        sourceId: "due-fallback",
      },
      {
        id: "schedule_task:invalid-end",
        kind: "schedule_task",
        title: "Invalid end",
        start: "2026-08-05",
        end: "2026-08-05",
        projectId: "p1",
        sourceId: "invalid-end",
      },
      {
        id: "schedule_task:reversed-end",
        kind: "schedule_task",
        title: "Reversed end",
        start: "2026-08-06",
        end: "2026-08-06",
        projectId: "p1",
        sourceId: "reversed-end",
      },
    ]);
  });
});
