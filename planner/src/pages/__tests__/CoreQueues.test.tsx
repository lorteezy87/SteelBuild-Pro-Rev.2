import { describe, expect, it, vi } from "vitest";
import type { PlannerAction, PlannerScheduleTask } from "@planner/data/plannerTypes";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/shared/ProjectContext", () => ({ ProjectContext: null }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: null }) }));
import { get48HourGateRows } from "../Gate48HourPage";
import { get10DayLookaheadRows } from "../Lookahead10DayPage";
import { getWaitingOnRows } from "../WaitingOnPage";
import { getMyDayRows } from "../MyDayPage";
import { getMilestoneRows } from "../MilestonesPage";
import { getCommandCenterMetrics } from "../CommandCenterPage";
import { getPlannerTodayIsoForTimeZone, PlannerQueueBoundary, type PlannerQueueData } from "../usePlannerQueueData";

const TODAY = "2026-08-02";
const actionBase: Omit<PlannerAction, "id" | "title" | "due_date"> = {
  project_id: "project-1",
  status: "Open",
  priority: "High",
  archived_at: null,
};

const actions: PlannerAction[] = [
  { ...actionBase, id: "overdue", title: "Resolve embed detail", due_date: "2026-08-01", assigned_user_id: "user-1" },
  { ...actionBase, id: "within-48", title: "Release anchor rods", due_date: "2026-08-04" },
  { ...actionBase, id: "within-10", title: "Confirm crane plan", due_date: "2026-08-12" },
  { ...actionBase, id: "outside", title: "Prepare turnover", due_date: "2026-08-13" },
  { ...actionBase, id: "waiting", title: "Await field dimensions", due_date: "2026-08-05", waiting_on: "Field superintendent" },
  { ...actionBase, id: "empty-waiting", title: "No dependency party", due_date: "2026-08-05", waiting_on: "  " },
];

const scheduleTasks: PlannerScheduleTask[] = [
  {
    id: "milestone",
    project_id: "project-1",
    status: "In Progress",
    assigned_to: "user-1",
    task_name: "Structural steel complete",
    start_date: TODAY,
    end_date: TODAY,
    is_milestone: true,
  },
  {
    id: "ordinary-task",
    project_id: "project-1",
    status: "In Progress",
    assigned_to: "user-1",
    task_name: "Set joists",
    start_date: TODAY,
    end_date: "2026-08-04",
    is_milestone: false,
  },
];

describe("Planner core queues", () => {
  it("keeps overdue actions through August 4 in the 48-Hour Gate", () => {
    expect(get48HourGateRows(actions, TODAY).map((action) => action.id)).toEqual([
      "overdue",
      "within-48",
    ]);
  });

  it("keeps actions through August 12 in the 10-Day Lookahead", () => {
    expect(get10DayLookaheadRows(actions, TODAY).map((action) => action.id)).toEqual([
      "overdue",
      "within-48",
      "empty-waiting",
      "waiting",
      "within-10",
    ]);
  });

  it("requires a named party for Waiting On", () => {
    expect(getWaitingOnRows(actions).map((action) => action.id)).toEqual(["waiting"]);
  });

  it("selects signed-in user action and schedule work for My Day", () => {
    expect(getMyDayRows({ actions, scheduleTasks }, "user-1", TODAY).map((row) => (
      row.kind === "action" ? `action:${row.action.id}` : `schedule:${row.scheduleTask.id}`
    ))).toEqual(["action:overdue", "schedule:milestone", "schedule:ordinary-task"]);
  });

  it("shows only milestone schedule activities", () => {
    expect(getMilestoneRows(scheduleTasks).map((task) => task.id)).toEqual(["milestone"]);
  });

  it("places every action in one mutually exclusive command date bucket", () => {
    const metrics = getCommandCenterMetrics([
      { ...actionBase, id: "overdue-first", due_date: "2026-08-01", follow_up_date: "2026-08-04" },
      { ...actionBase, id: "today", due_date: TODAY },
      { ...actionBase, id: "next", due_date: "2026-08-04" },
      { ...actionBase, id: "follow-up", due_date: null, follow_up_date: "2026-08-03" },
      { ...actionBase, id: "impact", due_date: null, impact_date: "2026-08-04" },
      { ...actionBase, id: "outside", due_date: "2026-08-05" },
    ], [], 1, TODAY);
    const byLabel = new Map(metrics.map((metric) => [metric.label, metric]));

    expect(byLabel.get("Overdue")).toMatchObject({ count: 1, to: "/task-register?metric=overdue" });
    expect(byLabel.get("Due today")).toMatchObject({ count: 1, to: "/task-register?metric=due-today" });
    expect(byLabel.get("Next 48 hours")).toMatchObject({ count: 3, to: "/task-register?metric=next-48" });
  });

  it("uses the organization timezone instead of browser-local date components", () => {
    expect(getPlannerTodayIsoForTimeZone(new Date("2026-08-03T02:30:00.000Z"), "America/Phoenix")).toBe("2026-08-02");
    expect(getPlannerTodayIsoForTimeZone(new Date("2026-08-03T02:30:00.000Z"), "not/a-timezone")).toBe("2026-08-02");
  });

  it("renders an exclusive unavailable state after organization loading finishes without an org", () => {
    const queue: PlannerQueueData = {
      actions: [],
      scheduleTasks: [],
      currentUserIdentityTokens: [],
      todayIso: TODAY,
      projectCount: 0,
      isLoading: false,
      isReady: false,
      errorMessage: null,
      unavailableMessage: "No active SteelBuild workspace is available for Planner.",
    };

    render(<PlannerQueueBoundary queue={queue} isEmpty emptyMessage="No records."><p>Queue content</p></PlannerQueueBoundary>);

    expect(screen.getByText("No active SteelBuild workspace is available for Planner.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("No records.")).not.toBeInTheDocument();
  });
});
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
