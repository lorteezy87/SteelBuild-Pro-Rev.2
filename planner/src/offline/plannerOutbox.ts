import { createPlannerOutboxScopePrefix, PLANNER_OUTBOX_STORE, runPlannerOfflineStore, type PlannerOfflineScope } from "./plannerSnapshots";
import type { Json } from "@/types/supabase";

export type PlannerOfflineOperationKind = "action-status" | "action-progress" | "schedule-progress" | "readiness" | "action-date" | "action-owner" | "action-create" | "action-archive" | "action-source-link" | "action-bulk-complete";
export type PlannerOutboxOperation = { id: string; client_op_id: string; kind: PlannerOfflineOperationKind; entityId: string; projectId: string; payload: Record<string, unknown>; expected_updated_at: string; queuedAt: string };
type StoredPlannerOutboxOperation = PlannerOutboxOperation & { storageKey: string; scope: PlannerOfflineScope };
export type PlannerReplayState = "complete" | "conflict" | "blocked" | "retry";
export type PlannerReplayResult = { synced: string[]; remaining: PlannerOutboxOperation[]; state: PlannerReplayState; error: unknown | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OFFLINE_ACTION_STATUSES = new Set(["Open", "In Progress", "Complete", "Cancelled", "Resolved", "Closed"]);

function hasOnlyKeys(payload: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(payload).length === keys.length && keys.every((key) => key in payload); }
function isNonEmpty(value: string): boolean { return value.trim().length > 0; }
function isExpectedVersion(value: string): boolean { return isNonEmpty(value) && Number.isFinite(Date.parse(value)); }
function isUuid(value: string): boolean { return UUID_PATTERN.test(value); }

/** Strict allow-list: no create, dates, ownership, archive, source linking, or bulk operations can enter the outbox. */
export function isOfflineQueueable(operation: PlannerOutboxOperation): boolean {
  if (!isUuid(operation.id) || operation.id !== operation.client_op_id || !isUuid(operation.entityId) || !isUuid(operation.projectId) || !isExpectedVersion(operation.expected_updated_at)) return false;
  const payload = operation.payload;
  if (operation.kind === "action-status") return hasOnlyKeys(payload, ["status"]) && typeof payload.status === "string" && OFFLINE_ACTION_STATUSES.has(payload.status);
  if (operation.kind === "action-progress" || operation.kind === "readiness") return false;
  if (operation.kind === "schedule-progress") return hasOnlyKeys(payload, ["percent_complete"]) && typeof payload.percent_complete === "number" && Number.isFinite(payload.percent_complete) && payload.percent_complete >= 0 && payload.percent_complete <= 100;
  return false;
}

export async function loadPlannerOutbox(scope: PlannerOfflineScope): Promise<PlannerOutboxOperation[]> {
  try {
    const prefix = createPlannerOutboxScopePrefix(scope);
    const all = await runPlannerOfflineStore<StoredPlannerOutboxOperation[]>(PLANNER_OUTBOX_STORE, "readonly", (store) => store.getAll());
    return all.filter((item) => item.storageKey.startsWith(prefix) && item.scope.userId === scope.userId && item.scope.organizationId === scope.organizationId).sort((left, right) => left.queuedAt.localeCompare(right.queuedAt) || left.id.localeCompare(right.id)).map(({ storageKey: _storageKey, scope: _scope, ...operation }) => operation);
  } catch { return []; }
}

export async function enqueuePlannerOutboxOperation(scope: PlannerOfflineScope, operation: PlannerOutboxOperation): Promise<void> {
  if (!isOfflineQueueable(operation)) throw new Error("This Planner operation requires an online connection.");
  const stored: StoredPlannerOutboxOperation = { ...operation, scope, storageKey: `${createPlannerOutboxScopePrefix(scope)}${encodeURIComponent(operation.id)}` };
  await runPlannerOfflineStore(PLANNER_OUTBOX_STORE, "readwrite", (store) => store.put(stored));
}

export async function removePlannerOutboxOperation(scope: PlannerOfflineScope, operationId: string): Promise<void> {
  await runPlannerOfflineStore(PLANNER_OUTBOX_STORE, "readwrite", (store) => store.delete(`${createPlannerOutboxScopePrefix(scope)}${encodeURIComponent(operationId)}`));
}

/** Uses the server-authoritative, idempotent RPC; direct table writes are never used for replay. */
export async function executePlannerOutboxOperation(operation: PlannerOutboxOperation): Promise<void> {
  if (!isOfflineQueueable(operation)) throw new Error("Unsupported Planner outbox operation.");
  const { supabase } = await import("@/lib/supabase");
  const { error } = await supabase.rpc("apply_planner_offline_operation", {
    p_project_id: operation.projectId,
    p_entity_id: operation.entityId,
    p_kind: operation.kind,
    p_patch: operation.payload as Json,
    p_expected_updated_at: operation.expected_updated_at,
    p_client_op_id: operation.client_op_id,
  });
  if (error) throw error;
}

function errorProperty(error: unknown, property: "code" | "status" | "name"): unknown { return typeof error === "object" && error !== null ? (error as Record<string, unknown>)[property] : undefined; }
function replayStateFor(error: unknown): PlannerReplayState {
  const status = errorProperty(error, "status");
  const code = errorProperty(error, "code");
  const name = errorProperty(error, "name");
  if (name === "PlannerConflictError" || status === 409 || code === "PGRST116" || code === "40001") return "conflict";
  if (status === 401 || status === 403 || code === "42501" || code === "22023" || code === "22P02") return "blocked";
  return "retry";
}

/** Replays serially. Confirmed writes are removed by the provider; the first conflict/auth/transient failure stops the queue. */
export async function replayPlannerOutbox(operations: readonly PlannerOutboxOperation[], replay: (operation: PlannerOutboxOperation) => Promise<void>): Promise<PlannerReplayResult> {
  const remaining = [...operations];
  const synced: string[] = [];
  while (remaining.length > 0) {
    const operation = remaining[0];
    if (!isOfflineQueueable(operation)) return { synced, remaining, state: "blocked", error: new Error("Unsupported Planner outbox operation.") };
    try { await replay(operation); synced.push(operation.id); remaining.shift(); }
    catch (error) { return { synced, remaining, state: replayStateFor(error), error }; }
  }
  return { synced, remaining: [], state: "complete", error: null };
}
