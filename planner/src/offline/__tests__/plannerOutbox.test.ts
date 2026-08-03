import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: { id: "action-1" }, error: null })));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
import {
  isOfflineQueueable,
  replayPlannerOutbox,
  executePlannerOutboxOperation,
  type PlannerOutboxOperation,
} from "../plannerOutbox";

const eligibleStatusOperation: PlannerOutboxOperation = {
  id: "11111111-1111-4111-8111-111111111111",
  client_op_id: "11111111-1111-4111-8111-111111111111",
  kind: "action-status",
  entityId: "22222222-2222-4222-8222-222222222222",
  projectId: "33333333-3333-4333-8333-333333333333",
  payload: { status: "In Progress" },
  expected_updated_at: "2026-08-02T10:00:00.000Z",
  queuedAt: "2026-08-02T10:01:00.000Z",
};

describe("Planner offline outbox eligibility", () => {
  it("queues only exact server-supported action statuses and bounded schedule progress", () => {
    expect(isOfflineQueueable(eligibleStatusOperation)).toBe(true);
    expect(isOfflineQueueable({ ...eligibleStatusOperation, payload: { status: "Closed" } })).toBe(true);
    expect(isOfflineQueueable({ ...eligibleStatusOperation, payload: { status: "Needs review" } })).toBe(false);
    expect(isOfflineQueueable({ ...eligibleStatusOperation, kind: "action-progress", payload: { percent_complete: 50 } })).toBe(false);
    expect(isOfflineQueueable({ ...eligibleStatusOperation, kind: "schedule-progress", payload: { percent_complete: 50 } })).toBe(true);
    expect(isOfflineQueueable({ ...eligibleStatusOperation, kind: "schedule-progress", payload: { percent_complete: -0.1 } })).toBe(false);
    expect(isOfflineQueueable({ ...eligibleStatusOperation, kind: "schedule-progress", payload: { percent_complete: 100.1 } })).toBe(false);
    expect(isOfflineQueueable({ ...eligibleStatusOperation, kind: "schedule-progress", payload: { percent_complete: "50" } })).toBe(false);
    expect(isOfflineQueueable({ ...eligibleStatusOperation, kind: "readiness", payload: { is_ready: true } })).toBe(false);
  });

  it.each([
    ["client operation", { id: "not-a-uuid", client_op_id: "not-a-uuid" }],
    ["entity", { entityId: "not-a-uuid" }],
    ["project", { projectId: "not-a-uuid" }],
  ])("rejects a non-UUID %s identifier", (_label, patch) => {
    expect(isOfflineQueueable({ ...eligibleStatusOperation, ...patch })).toBe(false);
  });

  it.each([
    ["action-date", { due_date: "2026-08-05" }],
    ["action-owner", { assigned_user_id: "user-2" }],
    ["action-create", { title: "Create action" }],
    ["action-archive", {}],
    ["action-source-link", { source_entity_type: "rfi", source_entity_id: "44444444-4444-4444-8444-444444444444" }],
    ["action-bulk-complete", { ids: ["22222222-2222-4222-8222-222222222222", "55555555-5555-4555-8555-555555555555"] }],
  ] as const)("rejects %s operations", (kind, payload) => {
    expect(isOfflineQueueable({ ...eligibleStatusOperation, kind, payload })).toBe(false);
  });

  it("requires an optimistic concurrency version before accepting an operation", () => {
    expect(isOfflineQueueable({ ...eligibleStatusOperation, expected_updated_at: "" })).toBe(false);
  });
});

describe("Planner offline outbox replay", () => {
  it("replays supported status writes through the idempotent RPC with UUID identifiers", async () => {
    await executePlannerOutboxOperation(eligibleStatusOperation);

    expect(rpc).toHaveBeenCalledWith("apply_planner_offline_operation", {
      p_project_id: "33333333-3333-4333-8333-333333333333",
      p_entity_id: "22222222-2222-4222-8222-222222222222",
      p_kind: "action-status",
      p_patch: { status: "In Progress" },
      p_expected_updated_at: "2026-08-02T10:00:00.000Z",
      p_client_op_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("replays in order and stops at a conflict without removing the conflicted operation", async () => {
    const second: PlannerOutboxOperation = { ...eligibleStatusOperation, id: "44444444-4444-4444-8444-444444444444", client_op_id: "44444444-4444-4444-8444-444444444444", entityId: "55555555-5555-4555-8555-555555555555" };
    const calls: string[] = [];

    const result = await replayPlannerOutbox([eligibleStatusOperation, second], async (operation) => {
      calls.push(operation.id);
      if (operation.id === second.id) throw { code: "PGRST116", status: 409 };
    });

    expect(calls).toEqual([eligibleStatusOperation.id, second.id]);
    expect(result.synced).toEqual([eligibleStatusOperation.id]);
    expect(result.remaining.map((operation) => operation.id)).toEqual([second.id]);
    expect(result.state).toBe("conflict");
  });

  it.each([
    ["40001", { code: "40001" }, "conflict"],
    ["22023", { code: "22023" }, "blocked"],
    ["22P02", { code: "22P02" }, "blocked"],
    ["42501", { code: "42501" }, "blocked"],
    ["network failure", new TypeError("Network request failed"), "retry"],
  ] as const)("maps RPC %s failures without discarding the queued operation", async (_label, error, state) => {
    const result = await replayPlannerOutbox([eligibleStatusOperation], async () => { throw error; });

    expect(result.synced).toEqual([]);
    expect(result.remaining).toEqual([eligibleStatusOperation]);
    expect(result.state).toBe(state);
  });
});
