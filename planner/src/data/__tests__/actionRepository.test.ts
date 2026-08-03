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
      in: vi.fn((column: string, value: unknown) => {
        calls.push({ table, operation: "in", column, value });
        return chain;
      }),
      is: vi.fn((column: string, value: unknown) => {
        calls.push({ table, operation: "is", column, value });
        return chain;
      }),
      order: vi.fn((column: string, value?: unknown) => {
        calls.push({ table, operation: "order", column, value });
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

import {
  completePlannerActions,
  createPlannerAction,
  listPlannerActions,
  PlannerConflictError,
  updatePlannerAction,
} from "@planner/data/actionRepository";

function pushResult(data: unknown, error: Error | null = null): void {
  mocks.results.push({ data, error });
}

function actionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "action-1",
    project_id: "project-1",
    title: "Release embeds",
    status: "Open",
    archived_at: null,
    completed_at: null,
    updated_at: "2026-08-02T12:00:00.000Z",
    ...overrides,
  };
}

describe("actionRepository", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.results.length = 0;
    mocks.from.mockClear();
  });

  it("matches action updates by id and expected updated_at before returning one row", async () => {
    pushResult(actionRow({ title: "Release revised embeds" }));

    await updatePlannerAction(
      "action-1",
      { title: "Release revised embeds" },
      "2026-08-02T12:00:00.000Z",
    );

    expect(mocks.calls).toContainEqual({
      table: "action_items",
      operation: "eq",
      column: "id",
      value: "action-1",
    });
    expect(mocks.calls).toContainEqual({
      table: "action_items",
      operation: "eq",
      column: "updated_at",
      value: "2026-08-02T12:00:00.000Z",
    });
    expect(mocks.calls).toContainEqual({ table: "action_items", operation: "maybeSingle" });
    expect(mocks.calls).toContainEqual(expect.objectContaining({
      table: "action_items",
      operation: "select",
      value: expect.stringContaining("updated_at"),
    }));
  });

  it("reports a PlannerConflictError when an optimistic action update matches no row", async () => {
    pushResult(null);

    await expect(updatePlannerAction(
      "action-1",
      { status: "In Progress" },
      "2026-08-02T12:00:00.000Z",
    )).rejects.toEqual(expect.objectContaining({
      name: "PlannerConflictError",
      entityId: "action-1",
    }));
    await expect(Promise.reject(new PlannerConflictError("action-1"))).rejects.toBeInstanceOf(PlannerConflictError);
  });

  it("scopes action register reads by project in addition to RLS", async () => {
    pushResult([actionRow()]);

    await listPlannerActions("project-1");

    expect(mocks.calls).toContainEqual({
      table: "action_items",
      operation: "eq",
      column: "project_id",
      value: "project-1",
    });
  });

  it("rejects an unallowlisted source type before issuing a create", async () => {
    await expect(createPlannerAction({
      project_id: "project-1",
      title: "Investigate embed conflict",
      source_entity_type: "invoice",
      source_entity_id: "source-1",
    })).rejects.toThrow("Unsupported action source type");

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("fails closed before bulk completion when RLS-filtered rows do not match the selection", async () => {
    pushResult([actionRow({ id: "action-1" })]);

    const result = await completePlannerActions("project-1", ["action-1", "action-2"]);

    expect(result).toEqual({
      ok: false,
      ineligible: [{ id: "action-2", reason: "not_found_or_unauthorized" }],
      completed: [],
      failed: [],
      rolledBack: [],
    });
    expect(mocks.calls.filter((call) => call.operation === "update")).toHaveLength(0);
    expect(mocks.calls).toContainEqual({
      table: "action_items",
      operation: "eq",
      column: "project_id",
      value: "project-1",
    });
  });

  it("fails closed when a returned bulk row is outside the requested project", async () => {
    pushResult([actionRow({ project_id: "project-2" })]);

    const result = await completePlannerActions("project-1", ["action-1"]);

    expect(result).toEqual({
      ok: false,
      ineligible: [{ id: "action-1", reason: "not_found_or_unauthorized" }],
      completed: [],
      failed: [],
      rolledBack: [],
    });
    expect(mocks.calls.filter((call) => call.operation === "update")).toHaveLength(0);
  });

  it("fails closed when the requested bulk IDs contain a duplicate", async () => {
    pushResult([actionRow({ id: "action-1" })]);

    const result = await completePlannerActions("project-1", ["action-1", "action-1"]);

    expect(result).toEqual({
      ok: false,
      ineligible: [{ id: "action-1", reason: "duplicate_selection" }],
      completed: [],
      failed: [],
      rolledBack: [],
    });
    expect(mocks.calls.filter((call) => call.operation === "update")).toHaveLength(0);
  });

  it("fails closed when the bulk read returns the same requested ID more than once", async () => {
    pushResult([actionRow({ id: "action-1" }), actionRow({ id: "action-1" })]);

    const result = await completePlannerActions("project-1", ["action-1"]);

    expect(result).toEqual({
      ok: false,
      ineligible: [{ id: "action-1", reason: "duplicate_returned_row" }],
      completed: [],
      failed: [],
      rolledBack: [],
    });
    expect(mocks.calls.filter((call) => call.operation === "update")).toHaveLength(0);
  });

  it("fails closed when the bulk read returns an extra action outside the requested ID set", async () => {
    pushResult([actionRow({ id: "action-1" }), actionRow({ id: "action-extra" })]);

    const result = await completePlannerActions("project-1", ["action-1"]);

    expect(result).toEqual({
      ok: false,
      ineligible: [{ id: "action-extra", reason: "unexpected_returned_row" }],
      completed: [],
      failed: [],
      rolledBack: [],
    });
    expect(mocks.calls.filter((call) => call.operation === "update")).toHaveLength(0);
  });

  it("reports each completed row and rolls completed rows back if a bounded bulk batch conflicts", async () => {
    pushResult([
      actionRow({ id: "action-1" }),
      actionRow({ id: "action-2" }),
    ]);
    pushResult(actionRow({ id: "action-1", status: "Complete", updated_at: "2026-08-02T12:01:00.000Z" }));
    pushResult(null);
    pushResult(actionRow({ id: "action-1", status: "Open", updated_at: "2026-08-02T12:02:00.000Z" }));

    const result = await completePlannerActions("project-1", ["action-1", "action-2"]);

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      completed: [{ id: "action-1" }],
      failed: [{ id: "action-2", reason: "conflict" }],
      rolledBack: [{ id: "action-1", ok: true }],
    }));
    expect(mocks.calls.filter((call) => call.operation === "update")).toHaveLength(3);
  });
});
