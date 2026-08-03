import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResult = { data: unknown; error: Error | null };
type Call = {
  table: string;
  operation: string;
  column?: string;
  value?: unknown;
};

const mocks = vi.hoisted(() => {
  const calls: Call[] = [];
  const results: MockResult[] = [];

  const makeChain = (table: string, result: MockResult) => {
    const chain = {
      select: vi.fn((columns: string) => {
        calls.push({ table, operation: "select", value: columns });
        return chain;
      }),
      update: vi.fn((value: unknown) => {
        calls.push({ table, operation: "update", value });
        return chain;
      }),
      insert: vi.fn((value: unknown) => {
        calls.push({ table, operation: "insert", value });
        return chain;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push({ table, operation: "eq", column, value });
        return chain;
      }),
      not: vi.fn((column: string, operator: string, value: unknown) => {
        calls.push({ table, operation: "not", column, value: `${operator}.${String(value)}` });
        return chain;
      }),
      maybeSingle: vi.fn(() => {
        calls.push({ table, operation: "maybeSingle" });
        return chain;
      }),
      returns: vi.fn(() => chain),
      then: (resolve: (response: MockResult) => void) => resolve(result),
    };
    return chain;
  };

  return {
    calls,
    results,
    from: vi.fn((table: string) => makeChain(table, results.shift() ?? { data: null, error: null })),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

import { PlannerConflictError } from "@planner/data/actionRepository";
import { createScheduleActivity, listScheduleActivities, updateScheduleActivity } from "@planner/data/scheduleRepository";

function pushResult(data: unknown, error: Error | null = null): void {
  mocks.results.push({ data, error });
}

function scheduleRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "schedule-1",
    project_id: "project-1",
    task_name: "Erect bays 1 through 3",
    phase: "Erection",
    status: "Not Started",
    percent_complete: 0,
    updated_at: "2026-08-02T12:00:00.000Z",
    ...overrides,
  };
}

describe("scheduleRepository", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.results.length = 0;
    mocks.from.mockClear();
  });

  it("reads only the planner queue fields within the authorized project boundary", async () => {
    pushResult([scheduleRow({
      assigned_to: "user-1",
      priority: "High",
      is_milestone: true,
      milestone: null,
      start_date: "2026-08-02",
      end_date: "2026-08-02",
    })]);

    await listScheduleActivities("project-1");

    expect(mocks.calls).toContainEqual({
      table: "schedule_tasks",
      operation: "select",
      value: "id,project_id,task_name,start_date,end_date,status,assigned_to,resource_names,priority,is_milestone,milestone",
    });
    expect(mocks.calls).toContainEqual({
      table: "schedule_tasks",
      operation: "eq",
      column: "project_id",
      value: "project-1",
    });
    expect(mocks.calls).toContainEqual({
      table: "schedule_tasks",
      operation: "not",
      column: "status",
      value: "in.(Cancelled,Deleted,Archived)",
    });
  });

  it("sends the required schedule activity fields and project id on create", async () => {
    pushResult(scheduleRow());

    await createScheduleActivity({
      project_id: "project-1",
      task_name: "Erect bays 1 through 3",
      phase: "Erection",
      start_date: "2026-08-10",
      end_date: "2026-08-12",
      status: "Not Started",
      percent_complete: 0,
    });

    expect(mocks.calls).toContainEqual({
      table: "schedule_tasks",
      operation: "insert",
      value: {
        project_id: "project-1",
        task_name: "Erect bays 1 through 3",
        phase: "Erection",
        start_date: "2026-08-10",
        end_date: "2026-08-12",
        status: "Not Started",
        percent_complete: 0,
      },
    });
  });

  it("rejects noncanonical phases before schedule writes", async () => {
    await expect(createScheduleActivity({
      project_id: "project-1",
      task_name: "Unknown activity",
      phase: "Commissioning",
      start_date: "2026-08-10",
      end_date: "2026-08-12",
      status: "Not Started",
      percent_complete: 0,
    })).rejects.toThrow("Unsupported schedule phase");

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("matches narrow schedule updates by project, id, and expected updated_at", async () => {
    pushResult(scheduleRow({ status: "In Progress", percent_complete: 25 }));

    await updateScheduleActivity(
      "project-1",
      "schedule-1",
      { status: "In Progress", percent_complete: 25 },
      "2026-08-02T12:00:00.000Z",
    );

    expect(mocks.calls).toContainEqual({
      table: "schedule_tasks",
      operation: "eq",
      column: "project_id",
      value: "project-1",
    });
    expect(mocks.calls).toContainEqual({
      table: "schedule_tasks",
      operation: "eq",
      column: "id",
      value: "schedule-1",
    });
    expect(mocks.calls).toContainEqual({
      table: "schedule_tasks",
      operation: "eq",
      column: "updated_at",
      value: "2026-08-02T12:00:00.000Z",
    });
  });

  it("reports a conflict when a schedule update matches no current row", async () => {
    pushResult(null);

    await expect(updateScheduleActivity(
      "project-1",
      "schedule-1",
      { notes: "Crane confirmed" },
      "2026-08-02T12:00:00.000Z",
    )).rejects.toBeInstanceOf(PlannerConflictError);
  });
});
