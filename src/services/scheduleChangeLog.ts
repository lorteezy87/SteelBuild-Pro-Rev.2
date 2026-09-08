/**
 * scheduleChangeLog — read the schedule's change history back as English.
 *
 * Audit §1.3 / §7.6. The trail itself already exists: `record_planner_action_event`
 * has logged every `schedule_tasks` insert and update to `planner_action_events`
 * since 2026-08-05, with before/after state and the acting user, and the
 * 20260908150000 migration adds deletes and the fields it was missing.
 *
 * What did not exist was any way to read it. This module turns raw
 * before/after JSONB into "Start 2026-03-10 → 2026-03-15, by Nick, 4 Sep" —
 * the per-task History tab and the project-level change log a delay argument
 * actually needs.
 *
 * The one rule that matters here: report only what CHANGED. An event echoing
 * fifteen unchanged fields buries the one date that moved, and a log nobody
 * reads is the same as no log.
 */

import { parseDependencies } from "@/services/scheduleCascade";

export type ChangeKind = "date" | "actual" | "logic" | "status" | "progress" | "other";

export interface ScheduleChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
  kind: ChangeKind;
}

export type ChangeEventType = "created" | "updated" | "deleted" | "unknown";

export interface ScheduleChangeEntry {
  id: string;
  taskId: string | null;
  taskName: string | null;
  eventType: ChangeEventType;
  occurredAt: string | null;
  actorUserId: string | null;
  changes: ScheduleChange[];
  /** True when any planned or actual date moved — the delay-claim filter. */
  movedDates: boolean;
}

interface FieldSpec {
  label: string;
  kind: ChangeKind;
  format?: (value: unknown) => string | null;
}

/**
 * Ordered: dates first, because they are what the log is read for. Fields not
 * listed here are ignored rather than rendered raw — `blockers` is a JSONB blob
 * and dumping it would swamp the entry it appears in.
 */
const FIELDS: Record<string, FieldSpec> = {
  start_date:         { label: "Start",         kind: "date" },
  end_date:           { label: "Finish",        kind: "date" },
  duration:           { label: "Duration",      kind: "date",     format: (v) => (v == null ? null : `${v}d`) },
  actual_start_date:  { label: "Actual start",  kind: "actual" },
  actual_finish_date: { label: "Actual finish", kind: "actual" },
  dependencies:       { label: "Predecessors",  kind: "logic",    format: formatDependencies },
  parent_task_id:     { label: "Parent",        kind: "logic" },
  status:             { label: "Status",        kind: "status" },
  percent_complete:   { label: "% Complete",    kind: "progress", format: (v) => (v == null ? null : `${v}%`) },
  task_name:          { label: "Name",          kind: "other" },
  wbs_code:           { label: "WBS",           kind: "other" },
  phase:              { label: "Phase",         kind: "other" },
  assigned_to:        { label: "Assigned to",   kind: "other" },
  priority:           { label: "Priority",      kind: "other" },
};

const FIELD_ORDER = Object.keys(FIELDS);

/** Kinds that represent a date moving — planned or actual. */
const DATE_KINDS = new Set<ChangeKind>(["date", "actual"]);

/**
 * Predecessor links as "3 preds (FS+1, SS+0)" rather than raw JSON.
 * Uses the canonical parser so a legacy id-string array and the current link
 * object shape read the same, instead of appearing to be a change when only the
 * storage shape moved.
 */
function formatDependencies(value: unknown): string | null {
  const links = parseDependencies(value);
  if (links.length === 0) return "none";
  return links.map((l) => `${l.type}${l.lag_days >= 0 ? "+" : ""}${l.lag_days}`).join(", ");
}

function normalise(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

interface PlannerEventLike {
  id?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  event_type?: string | null;
  occurred_at?: string | null;
  actor_user_id?: string | null;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
}

function classify(eventType: string | null | undefined): ChangeEventType {
  if (!eventType) return "unknown";
  if (eventType.endsWith("_created")) return "created";
  if (eventType.endsWith("_deleted")) return "deleted";
  if (eventType.endsWith("_updated")) return "updated";
  return "unknown";
}

/**
 * Turn one raw event into a change entry.
 *
 * A create reports its opening values (before_state is NULL), a delete reports
 * what was lost (after_state is NULL), and an update reports only the fields
 * whose value actually differs.
 */
export function diffPlannerEvent(event: PlannerEventLike | null | undefined): ScheduleChangeEntry | null {
  if (!event) return null;

  const before = (event.before_state || {}) as Record<string, unknown>;
  const after = (event.after_state || {}) as Record<string, unknown>;
  const eventType = classify(event.event_type);

  const changes: ScheduleChange[] = [];

  for (const field of FIELD_ORDER) {
    const spec = FIELDS[field];
    const fmt = spec.format ?? normalise;

    // Compare on the RAW values, render with the formatter. Comparing formatted
    // strings would hide a change the format collapses (two different dependency
    // arrays that happen to render the same), and invent one where a formatter
    // is non-deterministic.
    const rawFrom = eventType === "created" ? undefined : before[field];
    const rawTo = eventType === "deleted" ? undefined : after[field];

    const hasFrom = rawFrom !== undefined;
    const hasTo = rawTo !== undefined;
    if (!hasFrom && !hasTo) continue;

    if (hasFrom && hasTo && normalise(rawFrom) === normalise(rawTo)) continue;

    const from = hasFrom ? fmt(rawFrom) : null;
    const to = hasTo ? fmt(rawTo) : null;
    if (from === null && to === null) continue;

    changes.push({ field, label: spec.label, from, to, kind: spec.kind });
  }

  return {
    id: String(event.id ?? ""),
    taskId: event.entity_id ? String(event.entity_id) : null,
    // A delete's name lives only in before_state — after_state is NULL.
    taskName: normalise(after.task_name) ?? normalise(before.task_name),
    eventType,
    occurredAt: event.occurred_at ?? null,
    actorUserId: event.actor_user_id ?? null,
    changes,
    movedDates: changes.some((c) => DATE_KINDS.has(c.kind)),
  };
}

export interface BuildChangeLogOptions {
  /** Drop entries where nothing tracked changed — a save that touched only
   *  untracked columns produces an event with an empty change list. */
  hideEmpty?: boolean;
  /** Keep only entries where a planned or actual date moved. */
  datesOnly?: boolean;
}

export function buildChangeLog(
  events: readonly PlannerEventLike[] | null | undefined,
  { hideEmpty = true, datesOnly = false }: BuildChangeLogOptions = {},
): ScheduleChangeEntry[] {
  if (!Array.isArray(events)) return [];
  const out: ScheduleChangeEntry[] = [];

  for (const event of events) {
    const entry = diffPlannerEvent(event);
    if (!entry) continue;
    // A delete is always worth showing even with no tracked field changes —
    // "this task existed and no longer does" is the event, not its diff.
    if (hideEmpty && entry.changes.length === 0 && entry.eventType !== "deleted") continue;
    if (datesOnly && !entry.movedDates && entry.eventType !== "deleted") continue;
    out.push(entry);
  }

  return out;
}

/** One-line summary for a collapsed row. */
export function summarizeEntry(entry: ScheduleChangeEntry | null | undefined): string {
  if (!entry) return "";
  if (entry.eventType === "deleted") return "Task deleted";
  if (entry.eventType === "created") return "Task created";
  if (entry.changes.length === 0) return "No tracked fields changed";
  if (entry.changes.length === 1) {
    const c = entry.changes[0];
    return `${c.label} ${c.from ?? "—"} → ${c.to ?? "—"}`;
  }
  return entry.changes.map((c) => c.label).join(", ") + " changed";
}
