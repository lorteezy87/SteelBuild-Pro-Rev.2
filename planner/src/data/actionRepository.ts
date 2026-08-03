import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import { isPlannerTerminalStatus } from "@planner/domain/plannerActions";

type ActionItemRow = Database["public"]["Tables"]["action_items"]["Row"];
type ActionItemInsert = Database["public"]["Tables"]["action_items"]["Insert"];
type ActionItemUpdate = Database["public"]["Tables"]["action_items"]["Update"];

const ACTION_REGISTER_FIELDS = [
  "id",
  "project_id",
  "project_name",
  "title",
  "description",
  "priority",
  "status",
  "workstream",
  "action_date",
  "due_date",
  "follow_up_date",
  "impact_date",
  "waiting_on",
  "assigned_user_id",
  "assigned_to",
  "source_entity_type",
  "source_entity_id",
  "completed_at",
  "archived_at",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof ActionItemRow)[];

const ACTION_REGISTER_COLUMNS = ACTION_REGISTER_FIELDS.join(",");

const ACTION_WRITE_FIELDS = [
  "title",
  "description",
  "priority",
  "status",
  "workstream",
  "action_date",
  "due_date",
  "follow_up_date",
  "impact_date",
  "waiting_on",
  "assigned_user_id",
  "source_entity_type",
  "source_entity_id",
] as const satisfies readonly (keyof ActionItemUpdate)[];

const ONLINE_ACTION_FIELDS = new Set<keyof PlannerActionUpdate>([
  "action_date",
  "due_date",
  "follow_up_date",
  "impact_date",
  "assigned_user_id",
  "source_entity_type",
  "source_entity_id",
]);

const ACTION_SOURCE_TYPES = new Set([
  "rfi",
  "submittal",
  "drawing_set",
  "change_order",
  "work_package",
  "delivery",
  "schedule_task",
  "meeting",
]);

const ACTION_STATUSES = new Set([
  "Open",
  "In Progress",
  "Complete",
  "Cancelled",
  "Resolved",
  "Closed",
]);

const ACTION_PRIORITIES = new Set(["Low", "Medium", "High", "Critical"]);
const BULK_COMPLETION_BATCH_SIZE = 25;

export class PlannerConflictError extends Error {
  constructor(public readonly entityId: string) {
    super("This record changed after you opened it.");
    this.name = "PlannerConflictError";
  }
}

export class PlannerOnlineRequiredError extends Error {
  constructor(operation: string) {
    super(`${operation} requires an online connection.`);
    this.name = "PlannerOnlineRequiredError";
  }
}

export type PlannerActionUpdate = Pick<ActionItemUpdate, (typeof ACTION_WRITE_FIELDS)[number]>;
export type PlannerActionRecord = Pick<ActionItemRow, (typeof ACTION_REGISTER_FIELDS)[number]>;

export type PlannerActionCreate = PlannerActionUpdate & {
  project_id: string;
  title: string;
};

export type UpdatePlannerActionArgs = {
  id: string;
  expectedUpdatedAt: string;
  patch: PlannerActionUpdate;
};

export type PlannerActionIneligibleReason =
  | "not_found_or_unauthorized"
  | "duplicate_selection"
  | "duplicate_returned_row"
  | "unexpected_returned_row"
  | "terminal"
  | "archived"
  | "missing_title";

export type PlannerActionIneligible = {
  id: string;
  reason: PlannerActionIneligibleReason;
};

export type PlannerBulkCompletionResult = {
  ok: boolean;
  ineligible: PlannerActionIneligible[];
  completed: Array<{ id: string }>;
  failed: Array<{ id: string; reason: "conflict" | "write_error" }>;
  rolledBack: Array<{ id: string; ok: boolean }>;
};

const BULK_COMPLETION_FIELDS = [
  "id",
  "project_id",
  "title",
  "status",
  "archived_at",
  "completed_at",
  "updated_at",
] as const satisfies readonly (keyof ActionItemRow)[];

const BULK_COMPLETION_COLUMNS = BULK_COMPLETION_FIELDS.join(",");

export type PlannerBulkCompletionCandidate = Pick<
  ActionItemRow,
  (typeof BULK_COMPLETION_FIELDS)[number]
>;

const ACTION_VERSION_FIELDS = ["id", "updated_at"] as const satisfies readonly (keyof ActionItemRow)[];
const ACTION_VERSION_COLUMNS = ACTION_VERSION_FIELDS.join(",");
type PlannerActionVersion = Pick<ActionItemRow, (typeof ACTION_VERSION_FIELDS)[number]>;
type PlannerActionIdentifier = Pick<ActionItemRow, "id">;

type BulkCompletionAttempt =
  | { id: string; ok: true; row: PlannerActionVersion }
  | { id: string; ok: false; reason: "conflict" | "write_error" };

function assertOnline(operation: string): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new PlannerOnlineRequiredError(operation);
  }
}

function assertNonEmptyIdentifier(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required.`);
  }
}

function assertExpectedUpdatedAt(value: string): void {
  if (!value.trim()) {
    throw new Error("expectedUpdatedAt is required.");
  }
}

function isFieldProvided<T extends object, K extends keyof T>(input: T, field: K): boolean {
  return input[field] !== undefined;
}

function assertActionPatchFields(input: PlannerActionUpdate): void {
  const permittedFields = new Set<string>(ACTION_WRITE_FIELDS);
  const unexpected = Object.keys(input).filter((field) => !permittedFields.has(field));
  if (unexpected.length > 0) {
    throw new Error(`Unsupported action fields: ${unexpected.join(", ")}`);
  }

  if (isFieldProvided(input, "title") && !input.title?.trim()) {
    throw new Error("Action title must not be empty.");
  }
  if (isFieldProvided(input, "status") && !ACTION_STATUSES.has(input.status ?? "")) {
    throw new Error("Unsupported action status.");
  }
  if (isFieldProvided(input, "priority") && !ACTION_PRIORITIES.has(input.priority ?? "")) {
    throw new Error("Unsupported action priority.");
  }

  const hasSourceType = isFieldProvided(input, "source_entity_type");
  const hasSourceId = isFieldProvided(input, "source_entity_id");
  if (hasSourceType !== hasSourceId) {
    throw new Error("Action source type and source id must be changed together.");
  }
  if (hasSourceType && hasSourceId) {
    if (input.source_entity_type === null && input.source_entity_id === null) return;
    if (
      !ACTION_SOURCE_TYPES.has(input.source_entity_type ?? "")
      || !input.source_entity_id?.trim()
    ) {
      throw new Error("Unsupported action source type or source id.");
    }
  }
}

function assertOnlineActionFields(input: PlannerActionUpdate, operation: string): void {
  if (ACTION_WRITE_FIELDS.some((field) => ONLINE_ACTION_FIELDS.has(field) && isFieldProvided(input, field))) {
    assertOnline(operation);
  }
}

function compactActionPatch(input: PlannerActionUpdate): PlannerActionUpdate {
  return Object.fromEntries(
    ACTION_WRITE_FIELDS.flatMap((field) => (
      input[field] === undefined ? [] : [[field, input[field]] as const]
    )),
  ) as PlannerActionUpdate;
}

function actionInsertPayload(input: PlannerActionCreate): ActionItemInsert {
  const patch = compactActionPatch(input);
  return {
    project_id: input.project_id,
    ...patch,
    title: input.title.trim(),
  };
}

function throwIfDatabaseError(error: Error | null): void {
  if (error) throw error;
}

export async function listPlannerActions(projectId: string): Promise<PlannerActionRecord[]> {
  assertNonEmptyIdentifier(projectId, "projectId");

  const { data, error } = await supabase
    .from("action_items")
    .select(ACTION_REGISTER_COLUMNS)
    .eq("project_id", projectId)
    .order("due_date", { ascending: true })
    .order("id", { ascending: true })
    .returns<PlannerActionRecord[]>();

  throwIfDatabaseError(error);
  return data ?? [];
}

export async function createPlannerAction(input: PlannerActionCreate): Promise<PlannerActionRecord> {
  assertOnline("Creating an action");
  assertNonEmptyIdentifier(input.project_id, "project_id");
  const patch = compactActionPatch(input);
  assertActionPatchFields(patch);
  assertOnlineActionFields(patch, "Creating an action");

  const { data, error } = await supabase
    .from("action_items")
    .insert(actionInsertPayload(input))
    .select(ACTION_REGISTER_COLUMNS)
    .maybeSingle()
    .returns<PlannerActionRecord>();

  throwIfDatabaseError(error);
  if (!data) throw new Error("Action creation did not return a row.");
  return data;
}

export async function updatePlannerAction(
  id: string,
  patch: PlannerActionUpdate,
  expectedUpdatedAt: string,
): Promise<PlannerActionRecord> {
  assertNonEmptyIdentifier(id, "id");
  assertExpectedUpdatedAt(expectedUpdatedAt);
  assertActionPatchFields(patch);
  assertOnlineActionFields(patch, "Updating this action");

  const { data, error } = await supabase
    .from("action_items")
    .update(compactActionPatch(patch))
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(ACTION_REGISTER_COLUMNS)
    .maybeSingle()
    .returns<PlannerActionRecord>();

  throwIfDatabaseError(error);
  if (!data) throw new PlannerConflictError(id);
  return data;
}

export async function archivePlannerAction(
  projectId: string,
  id: string,
  expectedUpdatedAt: string,
): Promise<PlannerActionRecord> {
  assertOnline("Archiving this action");
  assertNonEmptyIdentifier(projectId, "projectId");
  assertNonEmptyIdentifier(id, "id");
  assertExpectedUpdatedAt(expectedUpdatedAt);

  const { data, error } = await supabase
    .from("action_items")
    .update({ archived_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(ACTION_REGISTER_COLUMNS)
    .maybeSingle()
    .returns<PlannerActionRecord>();

  throwIfDatabaseError(error);
  if (!data) throw new PlannerConflictError(id);
  return data;
}

function describeBulkIneligibility(
  projectId: string,
  selectedIds: readonly string[],
  rows: readonly PlannerBulkCompletionCandidate[],
): PlannerActionIneligible[] {
  const requestedIds = new Set(selectedIds);
  const rowsById = new Map<string, PlannerBulkCompletionCandidate[]>();
  for (const row of rows) {
    rowsById.set(row.id, [...(rowsById.get(row.id) ?? []), row]);
  }

  const ineligible: PlannerActionIneligible[] = [];
  for (const id of requestedIds) {
    if (selectedIds.filter((selectedId) => selectedId === id).length > 1) {
      ineligible.push({ id, reason: "duplicate_selection" });
    }

    const matchingRows = rowsById.get(id) ?? [];
    if (matchingRows.length === 0) {
      ineligible.push({ id, reason: "not_found_or_unauthorized" });
      continue;
    }
    if (matchingRows.length > 1) {
      ineligible.push({ id, reason: "duplicate_returned_row" });
      continue;
    }

    const [row] = matchingRows;
    if (row.project_id !== projectId) ineligible.push({ id, reason: "not_found_or_unauthorized" });
    else if (row.archived_at) ineligible.push({ id, reason: "archived" });
    else if (isPlannerTerminalStatus(row.status)) ineligible.push({ id, reason: "terminal" });
    else if (!row.title?.trim()) ineligible.push({ id, reason: "missing_title" });
  }

  for (const row of rows) {
    if (!requestedIds.has(row.id)) {
      ineligible.push({ id: row.id, reason: "unexpected_returned_row" });
    }
  }

  return ineligible;
}

async function completeSingleAction(
  projectId: string,
  row: PlannerBulkCompletionCandidate,
  completedAt: string,
): Promise<BulkCompletionAttempt> {
  try {
    if (!row.updated_at) return { id: row.id, ok: false, reason: "write_error" };
    const { data, error } = await supabase
      .from("action_items")
      .update({ status: "Complete", completed_at: completedAt })
      .eq("project_id", projectId)
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select(ACTION_VERSION_COLUMNS)
      .maybeSingle()
      .returns<PlannerActionVersion>();

    throwIfDatabaseError(error);
    if (!data) return { id: row.id, ok: false, reason: "conflict" };
    return { id: row.id, ok: true, row: data };
  } catch {
    return { id: row.id, ok: false, reason: "write_error" };
  }
}

async function rollbackCompletedAction(
  projectId: string,
  original: PlannerBulkCompletionCandidate,
  completed: PlannerActionVersion,
): Promise<{ id: string; ok: boolean }> {
  if (!completed.updated_at) return { id: original.id, ok: false };

  try {
    const { data, error } = await supabase
      .from("action_items")
      .update({ status: original.status, completed_at: original.completed_at })
      .eq("project_id", projectId)
      .eq("id", original.id)
      .eq("updated_at", completed.updated_at)
      .select("id")
      .maybeSingle()
      .returns<PlannerActionIdentifier>();

    throwIfDatabaseError(error);
    return { id: original.id, ok: data !== null };
  } catch {
    return { id: original.id, ok: false };
  }
}

export async function completePlannerActions(
  projectId: string,
  selectedIds: readonly string[],
): Promise<PlannerBulkCompletionResult> {
  assertOnline("Bulk completion");
  assertNonEmptyIdentifier(projectId, "projectId");
  if (selectedIds.length === 0) {
    return { ok: false, ineligible: [], completed: [], failed: [], rolledBack: [] };
  }

  const { data, error } = await supabase
    .from("action_items")
    .select(BULK_COMPLETION_COLUMNS)
    .eq("project_id", projectId)
    .in("id", [...new Set(selectedIds)])
    .returns<PlannerBulkCompletionCandidate[]>();

  throwIfDatabaseError(error);
  const selectedRows = data ?? [];
  const ineligible = describeBulkIneligibility(projectId, selectedIds, selectedRows);
  if (ineligible.length > 0) {
    return { ok: false, ineligible, completed: [], failed: [], rolledBack: [] };
  }

  const rowsById = new Map(selectedRows.map((row) => [row.id, row]));
  const completed: Array<{ id: string }> = [];
  const completedAttempts: Array<{ original: PlannerBulkCompletionCandidate; current: PlannerActionVersion }> = [];
  const failed: Array<{ id: string; reason: "conflict" | "write_error" }> = [];
  const completedAt = new Date().toISOString();

  for (let index = 0; index < selectedIds.length; index += BULK_COMPLETION_BATCH_SIZE) {
    const batchRows = selectedIds.slice(index, index + BULK_COMPLETION_BATCH_SIZE)
      .map((id) => rowsById.get(id))
      .filter((row): row is PlannerBulkCompletionCandidate => row !== undefined);
    const attempts = await Promise.all(batchRows.map((row) => completeSingleAction(projectId, row, completedAt)));

    for (const attempt of attempts) {
      if (attempt.ok === true) {
        const original = rowsById.get(attempt.id);
        if (!original) {
          failed.push({ id: attempt.id, reason: "write_error" });
          continue;
        }
        completed.push({ id: attempt.id });
        completedAttempts.push({
          original,
          current: attempt.row,
        });
      } else {
        failed.push({ id: attempt.id, reason: attempt.reason });
      }
    }

    if (failed.length > 0) break;
  }

  if (failed.length === 0) {
    return { ok: true, ineligible: [], completed, failed: [], rolledBack: [] };
  }

  const rolledBack = await Promise.all(completedAttempts.map(({ original, current }) => (
    rollbackCompletedAction(projectId, original, current)
  )));
  return { ok: false, ineligible: [], completed, failed, rolledBack };
}
