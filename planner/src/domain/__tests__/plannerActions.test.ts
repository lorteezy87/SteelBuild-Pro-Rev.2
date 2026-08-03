import { describe, expect, it } from "vitest";
import {
  deriveGateRows,
  deriveMyDayRows,
  deriveWaitingOnRows,
  filterPlannerActions,
  sortPlannerActions,
} from "../plannerActions";

const base = {
  project_id: "p1",
  priority: "Medium",
  status: "Open",
  archived_at: null,
};

describe("deriveGateRows", () => {
  it("includes overdue and next-two-day actions in the 48-hour gate", () => {
    const rows = [
      { ...base, id: "overdue", due_date: "2026-08-01" },
      { ...base, id: "impact", due_date: null, impact_date: "2026-08-04" },
      { ...base, id: "later", due_date: "2026-08-05" },
    ];

    expect(deriveGateRows(rows, 2, "2026-08-02").map((row) => row.id)).toEqual([
      "overdue",
      "impact",
    ]);
  });

  it("excludes terminal and archived actions", () => {
    const rows = [
      { ...base, id: "done", status: "Complete", due_date: "2026-08-02" },
      {
        ...base,
        id: "archived",
        archived_at: "2026-08-01T00:00:00Z",
        due_date: "2026-08-02",
      },
    ];

    expect(deriveGateRows(rows, 2, "2026-08-02")).toEqual([]);
  });

  it("excludes normalized terminal statuses and invalid date candidates", () => {
    const rows = [
      { ...base, id: "complete", status: " complete ", due_date: "2026-08-02" },
      { ...base, id: "cancelled", status: "CANCELLED", due_date: "2026-08-02" },
      { ...base, id: "malformed", due_date: "2026-8-03" },
      { ...base, id: "impossible", due_date: "2026-02-30" },
      { ...base, id: "valid", due_date: "2026-08-03" },
    ];

    expect(deriveGateRows(rows, 2, "2026-08-02").map((row) => row.id)).toEqual(["valid"]);
  });
});

describe("deriveMyDayRows", () => {
  it("includes only the current user's operational actions and assigned schedule tasks", () => {
    const actions = [
      { ...base, id: "overdue", assigned_user_id: "u1", due_date: "2026-08-01" },
      { ...base, id: "active", assigned_user_id: "u1", action_date: "2026-08-02" },
      { ...base, id: "required", assigned_user_id: "u1", due_date: "2026-08-02" },
      { ...base, id: "follow-up", assigned_user_id: "u1", follow_up_date: "2026-08-02" },
      { ...base, id: "future", assigned_user_id: "u1", due_date: "2026-08-03" },
      { ...base, id: "other-user", assigned_user_id: "u2", due_date: "2026-08-02" },
      { ...base, id: "complete", assigned_user_id: "u1", status: "Complete", due_date: "2026-08-02" },
    ];
    const scheduleTasks = [
      {
        id: "in-progress",
        project_id: "p1",
        status: "In Progress",
        assigned_to: "u1",
        start_date: "2026-08-01",
        end_date: "2026-08-04",
      },
      {
        id: "overdue-task",
        project_id: "p1",
        status: "Not Started",
        assigned_to: "u1",
        start_date: "2026-07-30",
        end_date: "2026-08-01",
      },
      {
        id: "starts-today",
        project_id: "p1",
        status: "Not Started",
        assigned_to: "u1",
        start_date: "2026-08-02",
        end_date: "2026-08-05",
      },
      {
        id: "future-task",
        project_id: "p1",
        status: "Not Started",
        assigned_to: "u1",
        start_date: "2026-08-03",
        end_date: "2026-08-04",
      },
      {
        id: "someone-else-task",
        project_id: "p1",
        status: "In Progress",
        assigned_to: "u2",
        start_date: "2026-08-01",
        end_date: "2026-08-04",
      },
    ];

    const rows = deriveMyDayRows({ actions, scheduleTasks }, "u1", "2026-08-02");

    expect(rows.map((row) => row.kind === "action" ? row.action.id : row.scheduleTask.id)).toEqual([
      "overdue",
      "active",
      "required",
      "follow-up",
      "overdue-task",
      "in-progress",
      "starts-today",
    ]);
  });

  it("ignores invalid My Day date candidates and normalized terminal statuses", () => {
    const rows = deriveMyDayRows({
      actions: [
        { ...base, id: "resolved", status: " resolved ", assigned_user_id: "u1", due_date: "2026-08-02" },
        { ...base, id: "impossible-action", assigned_user_id: "u1", due_date: "2026-02-30" },
        { ...base, id: "valid-action", assigned_user_id: "u1", due_date: "2026-08-02" },
      ],
      scheduleTasks: [
        {
          id: "closed-task",
          project_id: "p1",
          status: " Closed ",
          assigned_to: "u1",
          start_date: "2026-08-01",
          end_date: "2026-08-03",
        },
        {
          id: "invalid-task",
          project_id: "p1",
          status: "In Progress",
          assigned_to: "u1",
          start_date: "2026-02-30",
          end_date: "2026-02-31",
        },
      ],
    }, "u1", "2026-08-02");

    expect(rows.map((row) => row.kind === "action" ? row.action.id : row.scheduleTask.id)).toEqual([
      "valid-action",
    ]);
  });

  it("matches normalized UUID, email, and display-name tokens without substring matches", () => {
    const rows = deriveMyDayRows({
      actions: [],
      scheduleTasks: [
        { id: "email", project_id: "p1", status: "In Progress", assigned_to: "alex@example.com", start_date: "2026-08-02", end_date: "2026-08-02" },
        { id: "name", project_id: "p1", status: "In Progress", assigned_to: "Taylor Reed; Shop", start_date: "2026-08-02", end_date: "2026-08-02" },
        { id: "resource", project_id: "p1", status: "In Progress", assigned_to: null, resource_names: "Crane, taylor.reed@example.com", start_date: "2026-08-02", end_date: "2026-08-02" },
        { id: "substring", project_id: "p1", status: "In Progress", assigned_to: "Taylor Reeds", start_date: "2026-08-02", end_date: "2026-08-02" },
      ],
    }, ["550e8400-e29b-41d4-a716-446655440000", "Alex@Example.com", "Taylor Reed", "taylor.reed@example.com"], "2026-08-02");

    expect(rows.map((row) => row.kind === "action" ? row.action.id : row.scheduleTask.id)).toEqual([
      "email",
      "name",
      "resource",
    ]);
  });
});

describe("deriveWaitingOnRows", () => {
  it("requires a meaningful waiting-on value and ranks by required date then priority", () => {
    const rows = [
      { ...base, id: "later", waiting_on: "Engineer", due_date: "2026-08-04", priority: "Critical" },
      { ...base, id: "high", waiting_on: "Owner", due_date: "2026-08-03", priority: "High" },
      { ...base, id: "medium", waiting_on: "Vendor", due_date: "2026-08-03", priority: "Medium" },
      { ...base, id: "blank", waiting_on: "  ", due_date: "2026-08-02" },
      { ...base, id: "archived", waiting_on: "Owner", archived_at: "2026-08-01T00:00:00Z", due_date: "2026-08-02" },
    ];

    expect(deriveWaitingOnRows(rows).map((row) => row.id)).toEqual(["high", "medium", "later"]);
  });
});

describe("filterPlannerActions", () => {
  const rows = [
    {
      ...base,
      id: "matching",
      title: "Release embeds",
      description: "Await issued drawings",
      workstream: "Detailing",
      assigned_user_id: "u1",
      waiting_on: "Structural engineer",
      priority: "High",
    },
    {
      ...base,
      id: "other",
      project_id: "p2",
      status: "In Progress",
      workstream: "Fabrication",
      assigned_user_id: "u2",
      waiting_on: null,
      priority: "Low",
      title: "Fabricate columns",
    },
  ];

  it("filters by project, status, workstream, owner, waiting-on, and priority", () => {
    expect(filterPlannerActions(rows, { projectId: "p1" }).map((row) => row.id)).toEqual(["matching"]);
    expect(filterPlannerActions(rows, { status: "Open" }).map((row) => row.id)).toEqual(["matching"]);
    expect(filterPlannerActions(rows, { workstream: "Detailing" }).map((row) => row.id)).toEqual(["matching"]);
    expect(filterPlannerActions(rows, { ownerId: "u1" }).map((row) => row.id)).toEqual(["matching"]);
    expect(filterPlannerActions(rows, { waitingOn: true }).map((row) => row.id)).toEqual(["matching"]);
    expect(filterPlannerActions(rows, { priority: "High" }).map((row) => row.id)).toEqual(["matching"]);
  });

  it("normalizes free-text searches without mutating the supplied rows", () => {
    const originalIds = rows.map((row) => row.id);

    expect(filterPlannerActions(rows, { search: "  EMBED  " }).map((row) => row.id)).toEqual(["matching"]);
    expect(rows.map((row) => row.id)).toEqual(originalIds);
  });

  it("excludes terminal and archived actions from operational results", () => {
    const operationalRows = [
      ...rows,
      { ...rows[0], id: "complete", status: "Complete" },
      { ...rows[0], id: "archived", archived_at: "2026-08-01T00:00:00Z" },
    ];

    expect(filterPlannerActions(operationalRows, { projectId: "p1" }).map((row) => row.id)).toEqual([
      "matching",
    ]);
  });

  it("treats whitespace and case variants as terminal statuses", () => {
    expect(filterPlannerActions([
      { ...rows[0], id: "cancelled", status: " cancelled " },
      { ...rows[0], id: "open" },
    ], {}).map((row) => row.id)).toEqual(["open"]);
  });
});

describe("sortPlannerActions", () => {
  it("returns a deterministically ordered copy by required date, priority, then id", () => {
    const rows = [
      { ...base, id: "later", due_date: "2026-08-04", priority: "Critical" },
      { ...base, id: "b-tie", due_date: "2026-08-03", priority: "High" },
      { ...base, id: "a-tie", due_date: "2026-08-03", priority: "High" },
      { ...base, id: "medium", due_date: "2026-08-03", priority: "Medium" },
    ];

    expect(sortPlannerActions(rows).map((row) => row.id)).toEqual(["a-tie", "b-tie", "medium", "later"]);
    expect(rows.map((row) => row.id)).toEqual(["later", "b-tie", "a-tie", "medium"]);
  });
});
