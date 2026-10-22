/**
 * Site readiness — one checklist per erection sequence, stored as an
 * `action_items` row (category SITE_READINESS) so it inherits that table's
 * RLS (field role and up may write), the planner audit trigger, and a place in
 * the Action Items register.
 *
 * The checklist is the erector's half of OSHA 1926.752: before steel is set the
 * controlling contractor must give written notice that concrete is at strength
 * and anchor-bolt repairs are approved. The rest is what keeps a crew and crane
 * from mobilizing to a site that cannot take them.
 */
import { addWorkingDays, snapToWorkingDay, workingDaysBetween, DEFAULT_CALENDAR } from "@/lib/schedule/workingCalendar";
import type { WorkingCalendar } from "@/lib/schedule/workingCalendar";
import type { Json } from "@/types/supabase";
import {
  dateOnlyOrNull, metadataSection, textOrNull, withMetadataSection, isLive,
} from "./types";
import type { ActionItemLike, IsoDate, ProjectLike, ScheduleTaskLike } from "./types";

export const READINESS_CATEGORY = "SITE_READINESS";
export const READINESS_METADATA_KEY = "site_readiness";

export type ReadinessParty = "GC" | "EOR" | "Fabricator" | "Erector";

export interface ReadinessItemDef {
  key: string;
  label: string;
  /** Who normally has to produce this — drives the request letter. */
  party: ReadinessParty;
}

export const READINESS_ITEMS: readonly ReadinessItemDef[] = Object.freeze([
  { key: "anchors", label: "Anchor bolts and embeds surveyed and accepted", party: "GC" },
  { key: "concrete", label: "Footings, piers and walls at required strength — written notice", party: "GC" },
  { key: "repairs", label: "Anchor bolt repairs or field modifications approved by the EOR", party: "EOR" },
  { key: "access", label: "Site access and crane path firm, drained and clear", party: "GC" },
  { key: "pad", label: "Crane pad / setup area prepared and compacted", party: "GC" },
  { key: "laydown", label: "Laydown and shakeout area confirmed", party: "GC" },
  { key: "steel", label: "Steel for this sequence delivered or confirmed shipping", party: "Fabricator" },
  { key: "overhead", label: "Overhead power and utilities cleared or protected", party: "GC" },
  { key: "controlling", label: "Controlling contractor's written OK to start (OSHA 1926.752(a))", party: "GC" },
  { key: "lift", label: "Lift plan and critical picks reviewed", party: "Erector" },
  { key: "inspector", label: "Special inspector scheduled for bolting and welding", party: "GC" },
]);

export type ReadinessState = "done" | "na";

export interface ReadinessMark {
  state: ReadinessState;
  by: string | null;
  at: string | null;
}

export interface ReadinessChecklist {
  version: 1;
  sequence: string;
  marks: Record<string, ReadinessMark>;
}

export interface ReadinessRecord {
  id: string;
  sequence: string;
  scheduleTaskId: string | null;
  /** Planned mobilization: the linked task's start, else the action item's due date. */
  start: IsoDate | null;
  startSource: "task" | "due_date" | null;
  owner: string | null;
  marks: Record<string, ReadinessMark>;
  open: ReadinessItemDef[];
  doneCount: number;
  /** Rows written by a newer checklist version are shown but not rewritten. */
  raw: ActionItemLike;
}

function parseMark(value: unknown): ReadinessMark | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.state !== "done" && v.state !== "na") return null;
  return { state: v.state, by: textOrNull(v.by), at: textOrNull(v.at) };
}

export function readChecklist(metadata: Json | null | undefined): ReadinessChecklist | null {
  const section = metadataSection(metadata, READINESS_METADATA_KEY);
  if (!section) return null;
  const marks: Record<string, ReadinessMark> = {};
  const rawMarks = section.marks;
  if (typeof rawMarks === "object" && rawMarks !== null) {
    for (const [key, value] of Object.entries(rawMarks as Record<string, unknown>)) {
      const mark = parseMark(value);
      if (mark && READINESS_ITEMS.some((item) => item.key === key)) marks[key] = mark;
    }
  }
  return { version: 1, sequence: textOrNull(section.sequence) ?? "", marks };
}

export function isReadinessItem(row: ActionItemLike): boolean {
  return isLive(row) && row.category === READINESS_CATEGORY;
}

export function openReadinessItems(marks: Record<string, ReadinessMark>): ReadinessItemDef[] {
  return READINESS_ITEMS.filter((item) => !marks[item.key]);
}

export function toReadinessRecord(
  row: ActionItemLike,
  tasksById: ReadonlyMap<string, ScheduleTaskLike>,
): ReadinessRecord {
  const checklist = readChecklist(row.metadata);
  const marks = checklist?.marks ?? {};
  const taskId = row.source_entity_type === "schedule_task" ? textOrNull(row.source_entity_id) : null;
  const task = taskId ? tasksById.get(taskId) : undefined;
  const taskStart = task && isLive(task) ? dateOnlyOrNull(task.start_date) : null;
  const due = dateOnlyOrNull(row.due_date);
  const open = openReadinessItems(marks);
  return {
    id: row.id,
    sequence: checklist?.sequence || textOrNull(row.title) || "Erection sequence",
    scheduleTaskId: taskId,
    start: taskStart ?? due,
    startSource: taskStart ? "task" : due ? "due_date" : null,
    owner: textOrNull(row.assigned_to),
    marks,
    open,
    doneCount: READINESS_ITEMS.length - open.length,
    raw: row,
  };
}

export function deriveReadiness(
  rows: readonly ActionItemLike[],
  tasks: readonly ScheduleTaskLike[],
): ReadinessRecord[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return rows
    .filter(isReadinessItem)
    .map((row) => toReadinessRecord(row, tasksById))
    .sort((a, b) => {
      if (a.start && b.start && a.start !== b.start) return a.start < b.start ? -1 : 1;
      if (a.start && !b.start) return -1;
      if (!a.start && b.start) return 1;
      return a.sequence.localeCompare(b.sequence);
    });
}

/**
 * Working days from `today` to the sequence start. Zero is "starts today";
 * negative means the start has passed. Null when no start is recorded.
 */
/**
 * The working day a sequence actually mobilizes: a start recorded on a
 * non-working day (a Saturday on a Mon–Fri calendar) snaps forward.
 */
export function effectiveStart(
  record: Pick<ReadinessRecord, "start">,
  calendar: WorkingCalendar = DEFAULT_CALENDAR,
): IsoDate | null {
  return record.start ? snapToWorkingDay(record.start, calendar) ?? record.start : null;
}

export function workingDaysToStart(
  record: Pick<ReadinessRecord, "start">,
  today: IsoDate,
  calendar: WorkingCalendar = DEFAULT_CALENDAR,
): number | null {
  const start = effectiveStart(record, calendar);
  if (!start) return null;
  if (start === today) return 0;
  if (start > today) {
    // Inclusive count includes today when it is a working day; "in N days"
    // means N working days AFTER today.
    const inclusive = workingDaysBetween(today, start, calendar);
    if (inclusive === null) return null;
    const todayCounts = (workingDaysBetween(today, today, calendar) ?? 0) > 0;
    return Math.max(0, inclusive - (todayCounts ? 1 : 0));
  }
  const back = workingDaysBetween(start, today, calendar);
  return back === null ? null : -Math.max(1, back - 1);
}

/**
 * "started" = the sequence start has passed with items still open. That is
 * the worst case, not a stale one: steel may be going up without the
 * controlling contractor's written OK, so it stays critical until closed.
 */
export type ReadinessTone = "ready" | "critical" | "warning" | "open" | "started";

export function readinessTone(
  record: ReadinessRecord,
  today: IsoDate,
  calendar: WorkingCalendar = DEFAULT_CALENDAR,
): ReadinessTone {
  if (!record.open.length) return "ready";
  const wd = workingDaysToStart(record, today, calendar);
  if (wd === null) return "open";
  if (wd < 0) return "started";
  if (wd <= 1) return "critical";
  if (wd <= 5) return "warning";
  return "open";
}

/** Statuses set by hand in the Action Items register that a checklist edit must not undo. */
const HELD_STATUSES = new Set(["Cancelled", "Closed"]);

/**
 * The action_items status a checklist implies: Complete when every item is
 * closed, otherwise Open — except that a sequence someone Cancelled or Closed
 * in the Action Items register stays that way until its checklist completes.
 */
export function readinessStatus(marks: Record<string, ReadinessMark>, current?: string | null): string {
  if (!openReadinessItems(marks).length) return "Complete";
  return current && HELD_STATUSES.has(current) ? current : "Open";
}

/** Cycle one item: open → done → N/A → open. Returns the new marks. */
export function cycleReadinessMark(
  marks: Record<string, ReadinessMark>,
  key: string,
  by: string | null,
  atIso: string,
): Record<string, ReadinessMark> {
  if (!READINESS_ITEMS.some((item) => item.key === key)) return marks;
  const next = { ...marks };
  const current = marks[key]?.state;
  if (!current) next[key] = { state: "done", by, at: atIso };
  else if (current === "done") next[key] = { state: "na", by, at: atIso };
  else delete next[key];
  return next;
}

/** The state a click moves an item to, from the state the user saw. */
export function nextReadinessState(current: ReadinessState | undefined): ReadinessState | null {
  if (!current) return "done";
  return current === "done" ? "na" : null;
}

/** Set one item to an explicit state (null = open) without touching the others. */
export function setReadinessMark(
  marks: Record<string, ReadinessMark>,
  key: string,
  state: ReadinessState | null,
  by: string | null,
  atIso: string,
): Record<string, ReadinessMark> {
  if (!READINESS_ITEMS.some((item) => item.key === key)) return marks;
  const next = { ...marks };
  if (state) next[key] = { state, by, at: atIso };
  else delete next[key];
  return next;
}

/**
 * Apply one item change so that concurrent ticks by different users on the
 * same checklist do not erase each other.
 *
 * action_items has no per-item column and this change adds no migration, so
 * the checklist is one jsonb value. Each attempt re-reads the row from the
 * server, sets ONLY this item on that fresh copy, writes, then re-reads to
 * confirm the item stuck. If another user's write landed in between and
 * dropped it, the item is re-applied on top of theirs.
 *
 * This is the FALLBACK for a database without the `set_site_readiness_mark`
 * function (migration 20261022064000), which does the same under a row lock
 * and has no race. Here a residual window remains: a writer that completes its
 * whole read-write-verify cycle inside this attempt's read→write gap can
 * still have its item dropped.
 */
export async function applyReadinessMark(args: {
  fetchRow: () => Promise<ActionItemLike | null>;
  writePatch: (patch: { metadata: Record<string, Json>; status: string }) => Promise<unknown>;
  key: string;
  state: ReadinessState | null;
  by: string | null;
  atIso: string;
  maxAttempts?: number;
}): Promise<ActionItemLike> {
  const { fetchRow, writePatch, key, state, by, atIso, maxAttempts = 3 } = args;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const row = await fetchRow();
    if (!row) throw new Error("This checklist no longer exists. Refresh the page.");
    const checklist = readChecklist(row.metadata);
    const marks = setReadinessMark(checklist?.marks ?? {}, key, state, by, atIso);
    await writePatch(readinessUpdatePatch(row, checklist?.sequence || textOrNull(row.title) || "", marks));
    const after = await fetchRow();
    const stuck = after ? readChecklist(after.metadata)?.marks[key]?.state ?? null : undefined;
    if (after && stuck === state) return after;
  }
  throw new Error("Another update kept replacing this checklist. Refresh and try again.");
}

/** The update payload for a checklist change: metadata merged, status reconciled. */
export function readinessUpdatePatch(
  row: ActionItemLike,
  sequence: string,
  marks: Record<string, ReadinessMark>,
): { metadata: Record<string, Json>; status: string } {
  const checklist: ReadinessChecklist = { version: 1, sequence, marks };
  return {
    metadata: withMetadataSection(row.metadata, READINESS_METADATA_KEY, checklist as unknown as Record<string, unknown>),
    status: readinessStatus(marks, row.status),
  };
}

export interface ReadinessDraft {
  sequence: string;
  scheduleTaskId: string | null;
  mobilizationDate: IsoDate | null;
  owner: string | null;
  notes: string | null;
}

/** Insert payload for a new sequence. project_id is added by the caller. */
export function readinessCreateInput(draft: ReadinessDraft): Record<string, unknown> {
  const sequence = draft.sequence.trim();
  const checklist: ReadinessChecklist = { version: 1, sequence, marks: {} };
  return {
    title: `Site readiness — ${sequence}`,
    description: draft.notes || null,
    category: READINESS_CATEGORY,
    priority: "High",
    status: "Open",
    due_date: draft.mobilizationDate || null,
    assigned_to: draft.owner || null,
    source_entity_type: draft.scheduleTaskId ? "schedule_task" : null,
    source_entity_id: draft.scheduleTaskId || null,
    metadata: { [READINESS_METADATA_KEY]: checklist },
  };
}

/** Update payload for the editable header fields, keeping the checklist. */
export function readinessEditInput(row: ActionItemLike, draft: ReadinessDraft, marks: Record<string, ReadinessMark>): Record<string, unknown> {
  const sequence = draft.sequence.trim();
  const patch = readinessUpdatePatch(row, sequence, marks);
  return {
    title: `Site readiness — ${sequence}`,
    description: draft.notes || null,
    due_date: draft.mobilizationDate || null,
    assigned_to: draft.owner || null,
    source_entity_type: draft.scheduleTaskId ? "schedule_task" : null,
    source_entity_id: draft.scheduleTaskId || null,
    ...patch,
  };
}

function fmtLongDate(iso: IsoDate | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * A paste-ready request to the GC listing everything the erector does not
 * own. The sender is the signed-in organization — never a literal company.
 */
export function buildReadinessRequest(args: {
  record: ReadinessRecord;
  project: ProjectLike | null;
  senderName: string | null;
  orgName: string | null;
}): string {
  const { record, project, senderName, orgName } = args;
  const items = record.open.filter((item) => item.party !== "Erector");
  const job = [project?.project_number, project?.name].filter(Boolean).join(" ");
  const lines = [
    `Subject: ${job ? `[${job}] ` : ""}Site readiness — ${record.sequence}`,
    "",
    project?.general_contractor ? `${project.general_contractor} team,` : "Team,",
    "",
    `${orgName ?? "We"} ${orgName ? "is" : "are"} scheduled to start erection on ${record.sequence}${record.start ? ` ${fmtLongDate(record.start)}` : ""}. Before we mobilize the crew and crane we need the following confirmed:`,
    "",
    ...items.map((item, i) => `${i + 1}. ${item.label}${item.party !== "GC" ? ` (${item.party})` : ""}`),
    "",
    "Per OSHA 1926.752(a), we need written notification from the controlling contractor that the concrete has reached the required strength and that any anchor bolt repairs, replacements or modifications are complete and approved before steel is set.",
    "",
    "If any of these will not be ready, please tell us as early as possible so we can re-sequence the crew and crane rather than stand by.",
    "",
    "Thank you,",
    senderName ?? "",
    orgName ?? "",
  ];
  return lines.join("\n").replace(/\n+$/, "\n");
}

/** Suggested mobilization for a new, unlinked sequence: five working days out. */
export function defaultMobilizationDate(today: IsoDate, calendar: WorkingCalendar = DEFAULT_CALENDAR): IsoDate | null {
  return addWorkingDays(today, 5, calendar);
}
