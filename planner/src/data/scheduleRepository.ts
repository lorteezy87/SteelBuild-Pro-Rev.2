import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import { PHASES } from "@/utils/phases";
import { PlannerConflictError, PlannerOnlineRequiredError } from "@planner/data/actionRepository";

type ScheduleTaskRow = Database["public"]["Tables"]["schedule_tasks"]["Row"];
type ScheduleTaskInsert = Database["public"]["Tables"]["schedule_tasks"]["Insert"];
type ScheduleTaskUpdate = Database["public"]["Tables"]["schedule_tasks"]["Update"];

const SCHEDULE_DETAIL_FIELDS = [
  "id",
  "project_id",
  "task_name",
  "start_date",
  "end_date",
  "phase",
  "crew_id",
  "crew_name",
  "resource_names",
  "notes",
  "status",
  "percent_complete",
  "updated_at",
] as const satisfies readonly (keyof ScheduleTaskRow)[];

const SCHEDULE_DETAIL_COLUMNS = SCHEDULE_DETAIL_FIELDS.join(",");

const SCHEDULE_QUEUE_FIELDS = [
  "id",
  "project_id",
  "task_name",
  "start_date",
  "end_date",
  "status",
  "assigned_to",
  "resource_names",
  "priority",
  "is_milestone",
  "milestone",
] as const satisfies readonly (keyof ScheduleTaskRow)[];

const SCHEDULE_QUEUE_COLUMNS = SCHEDULE_QUEUE_FIELDS.join(",");

const SCHEDULE_WRITE_FIELDS = [
  "task_name",
  "start_date",
  "end_date",
  "phase",
  "crew_id",
  "crew_name",
  "resource_names",
  "notes",
  "status",
  "percent_complete",
] as const satisfies readonly (keyof ScheduleTaskUpdate)[];

const SCHEDULE_STATUSES = new Set([
  "Not Started",
  "In Progress",
  "Complete",
  "On Hold",
  "Delayed",
]);

const ONLINE_SCHEDULE_FIELDS = new Set<keyof ScheduleActivityUpdate>([
  "start_date",
  "end_date",
  "crew_id",
  "crew_name",
  "resource_names",
]);

const modulePhases: unknown = PHASES;
if (!Array.isArray(modulePhases) || modulePhases.length === 0 || modulePhases.some((phase) => typeof phase !== "string" || !phase.trim())) {
  throw new Error("Planner schedule phases must be a non-empty string list.");
}
const CANONICAL_PHASES = new Set(modulePhases);

export type ScheduleActivityUpdate = Pick<ScheduleTaskUpdate, (typeof SCHEDULE_WRITE_FIELDS)[number]>;
export type PlannerScheduleActivityRecord = Pick<ScheduleTaskRow, (typeof SCHEDULE_DETAIL_FIELDS)[number]>;
export type PlannerScheduleQueueRecord = Pick<ScheduleTaskRow, (typeof SCHEDULE_QUEUE_FIELDS)[number]>;

export type ScheduleActivityCreate = ScheduleActivityUpdate & {
  project_id: string;
  task_name: string;
  phase: string;
  start_date: string;
  end_date: string;
  status: string;
  percent_complete: number;
};

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

function assertExpectedUpdatedAt(value: string): void {
  if (!value.trim()) throw new Error("expectedUpdatedAt is required.");
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function assertOnline(operation: string): void {
  if (!isOnline()) throw new PlannerOnlineRequiredError(operation);
}

function isProvided<T extends object, K extends keyof T>(input: T, field: K): boolean {
  return input[field] !== undefined;
}

function assertDateOnly(value: string | null | undefined, field: string): void {
  if (value !== null && value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be an ISO date.`);
  }
}

function assertSchedulePatch(input: ScheduleActivityUpdate): void {
  const acceptedFields = new Set<string>(SCHEDULE_WRITE_FIELDS);
  const unexpected = Object.keys(input).filter((field) => !acceptedFields.has(field));
  if (unexpected.length > 0) throw new Error(`Unsupported schedule fields: ${unexpected.join(", ")}`);
  if (Object.keys(input).length === 0) throw new Error("Schedule update must include at least one field.");

  if (isProvided(input, "task_name") && !input.task_name?.trim()) {
    throw new Error("Schedule task name must not be empty.");
  }
  if (isProvided(input, "phase")) assertCanonicalPhase(input.phase);
  assertDateOnly(input.start_date, "start_date");
  assertDateOnly(input.end_date, "end_date");
  if (isProvided(input, "status") && !SCHEDULE_STATUSES.has(input.status ?? "")) {
    throw new Error("Unsupported schedule status.");
  }
  if (isProvided(input, "percent_complete")) {
    const progress = input.percent_complete;
    if (typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new Error("Schedule progress must be between 0 and 100.");
    }
  }

  const status = input.status;
  const progress = input.percent_complete;
  if (status !== undefined && progress !== undefined) {
    if (status === "Complete" && progress !== 100) {
      throw new Error("Complete schedule activities must have 100 percent progress.");
    }
    if (status === "Not Started" && progress !== 0) {
      throw new Error("Not Started schedule activities must have zero percent progress.");
    }
    if (status === "In Progress" && progress >= 100) {
      throw new Error("In Progress schedule activities must be below 100 percent.");
    }
  }
}

function assertCanonicalPhase(phase: string | null | undefined): void {
  if (typeof phase !== "string" || !CANONICAL_PHASES.has(phase)) {
    throw new Error("Unsupported schedule phase.");
  }
}

function compactSchedulePatch(input: ScheduleActivityUpdate): ScheduleActivityUpdate {
  return Object.fromEntries(
    SCHEDULE_WRITE_FIELDS.flatMap((field) => (
      input[field] === undefined ? [] : [[field, input[field]] as const]
    )),
  ) as ScheduleActivityUpdate;
}

function scheduleInsertPayload(input: ScheduleActivityCreate): ScheduleTaskInsert {
  const patch = compactSchedulePatch(input);
  return {
    project_id: input.project_id,
    ...patch,
    task_name: input.task_name.trim(),
  };
}

function assertOnlineForScheduleUpdate(input: ScheduleActivityUpdate): void {
  if (SCHEDULE_WRITE_FIELDS.some((field) => ONLINE_SCHEDULE_FIELDS.has(field) && isProvided(input, field))) {
    assertOnline("Changing schedule dates or ownership");
  }
}

function throwIfDatabaseError(error: Error | null): void {
  if (error) throw error;
}

/** RLS-scoped schedule read used by Planner's My Day, calendar, and milestone projections. */
export async function listScheduleActivities(projectId: string): Promise<PlannerScheduleQueueRecord[]> {
  assertNonEmpty(projectId, "projectId");

  const { data, error } = await supabase
    .from("schedule_tasks")
    .select(SCHEDULE_QUEUE_COLUMNS)
    .eq("project_id", projectId)
    .not("status", "in", "(Cancelled,Deleted,Archived)")
    .returns<PlannerScheduleQueueRecord[]>();

  throwIfDatabaseError(error);
  return data ?? [];
}

export async function createScheduleActivity(input: ScheduleActivityCreate): Promise<PlannerScheduleActivityRecord> {
  assertOnline("Creating a schedule activity");
  assertNonEmpty(input.project_id, "project_id");
  assertSchedulePatch(compactSchedulePatch(input));
  if (input.end_date < input.start_date) {
    throw new Error("Schedule end_date must not be before start_date.");
  }

  const { data, error } = await supabase
    .from("schedule_tasks")
    .insert(scheduleInsertPayload(input))
    .select(SCHEDULE_DETAIL_COLUMNS)
    .maybeSingle()
    .returns<PlannerScheduleActivityRecord>();

  throwIfDatabaseError(error);
  if (!data) throw new Error("Schedule activity creation did not return a row.");
  return data;
}

export async function updateScheduleActivity(
  projectId: string,
  id: string,
  patch: ScheduleActivityUpdate,
  expectedUpdatedAt: string,
): Promise<PlannerScheduleActivityRecord> {
  assertNonEmpty(projectId, "projectId");
  assertNonEmpty(id, "id");
  assertExpectedUpdatedAt(expectedUpdatedAt);
  assertSchedulePatch(patch);
  assertOnlineForScheduleUpdate(patch);

  const { data, error } = await supabase
    .from("schedule_tasks")
    .update(compactSchedulePatch(patch))
    .eq("project_id", projectId)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(SCHEDULE_DETAIL_COLUMNS)
    .maybeSingle()
    .returns<PlannerScheduleActivityRecord>();

  throwIfDatabaseError(error);
  if (!data) throw new PlannerConflictError(id);
  return data;
}
