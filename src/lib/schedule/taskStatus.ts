/**
 * taskStatus — one status vocabulary for schedule_tasks, and the
 * percent_complete reconciliation the database requires.
 *
 * Audit §4.1 / §4.3. Five surfaces each hard-coded their own status list and no
 * two agreed:
 *
 *   | surface                | list                                                          |
 *   |------------------------|---------------------------------------------------------------|
 *   | AddTaskModal           | Not Started, In Progress, Complete, Delayed, On Hold          |
 *   | BulkAddTaskModal       | Not Started, In Progress, Complete, On Hold, **Cancelled**    |
 *   | ScheduleTaskList       | Not Started, In Progress, Complete, Delayed, On Hold, **Cancelled** |
 *   | TaskDetailDrawer       | Not Started, In Progress, Complete, Delayed, On Hold          |
 *   | GanttTaskRows          | Not Started, In Progress, Complete, Delayed, On Hold          |
 *
 * `Cancelled` is not one of the values the database accepts:
 *
 *   chk_schedule_tasks_status CHECK (status = ANY (ARRAY[
 *     'Not Started', 'In Progress', 'Complete', 'On Hold', 'Delayed']))
 *
 * So picking it never saved. In Bulk Add that is worse than a rejected field:
 * `handleBulkAdd` is a sequential await loop with no rollback (§4.2), so one
 * Cancelled row at position 40 of 60 left 39 tasks created and a generic error
 * that did not say which row failed or that the rest had already been written.
 *
 * It is removed rather than added to the constraint on purpose. A cancelled task
 * is not a scheduling state — it is a task that should not roll up, not count
 * against progress, and not appear on a look-ahead. Adding the word without
 * those semantics would give the schedule a status that quietly inflates every
 * percentage that reads it. That is a product decision with a migration behind
 * it, not a dropdown entry.
 *
 * ## The percent_complete coupling
 *
 * A second constraint ties status to percent_complete:
 *
 *   schedule_status_pct_consistency CHECK (
 *        percent_complete IS NULL
 *     OR (status = 'Complete'    AND percent_complete = 100)
 *     OR (status = 'Not Started' AND percent_complete = 0)
 *     OR (status = 'In Progress' AND percent_complete < 100)
 *     OR status <> ALL (ARRAY['Complete','Not Started','In Progress']))
 *
 * A CHECK is evaluated against the whole resulting row, so an UPDATE that sends
 * `status` alone is validated against the percent already stored. Every write
 * path except the bulk toolbar sent exactly that, which made three ordinary
 * transitions fail with a raw Postgres error:
 *
 *   - → Complete     while the stored percent is not 100  (243 of 427 live rows)
 *   - → In Progress  while the stored percent is 100      (184 rows — every
 *                                                          finished task, i.e.
 *                                                          reopening anything)
 *   - → Not Started  while the stored percent is not 0    (208 rows)
 *
 * {@link reconcileStatusPercent} is the single answer, applied in the canonical
 * create and update paths so no caller has to remember it.
 */

/**
 * The statuses `schedule_tasks.status` accepts. Ordered as a PM moves through
 * them, not alphabetically — this array is what every dropdown renders.
 *
 * Keep in lockstep with chk_schedule_tasks_status. A value here that the
 * constraint rejects is a save that fails at the database with no field-level
 * feedback; a value the constraint accepts but that is missing here is simply
 * unreachable from the UI.
 */
export const SCHEDULE_STATUSES = [
  "Not Started",
  "In Progress",
  "Complete",
  "Delayed",
  "On Hold",
] as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const DEFAULT_SCHEDULE_STATUS: ScheduleStatus = "Not Started";

/**
 * Task types offered by the add/edit surfaces.
 *
 * AddTaskModal and TaskDetailDrawer offered "Install" while BulkAddTaskModal
 * offered neither it nor the same ordering. Unlike status there is no CHECK
 * constraint behind this column, so the drift was invisible rather than fatal —
 * but a task added in bulk and the same task edited in the drawer could not be
 * given the same type.
 */
export const SCHEDULE_TASK_TYPES = [
  "Task",
  "Fabrication",
  "Delivery",
  "Install",
  "Submittal",
  "RFI",
  "Milestone",
] as const;

export type ScheduleTaskType = (typeof SCHEDULE_TASK_TYPES)[number];

/** Priorities, highest first — the order the Task List already sorts by. */
export const SCHEDULE_PRIORITIES = ["Critical", "High", "Normal", "Low"] as const;

export type SchedulePriority = (typeof SCHEDULE_PRIORITIES)[number];

export const DEFAULT_SCHEDULE_PRIORITY: SchedulePriority = "Normal";

/** True when `value` is one of the statuses the database will accept. */
export function isScheduleStatus(value: unknown): value is ScheduleStatus {
  return (SCHEDULE_STATUSES as readonly string[]).includes(String(value));
}

/**
 * Coerce an inbound status to one the database accepts.
 *
 * For importers (CSV, MS Project XML), which carry whatever the source file
 * said. An unrecognised value becomes the default rather than being passed
 * through to fail the insert — a P6 export full of "Cancelled" rows should
 * import, not reject 60 tasks one at a time.
 *
 * Returns null for a null/blank input so a caller can tell "not supplied" from
 * "supplied and unrecognised"; only the latter is worth defaulting.
 */
export function normalizeScheduleStatus(value: unknown): ScheduleStatus | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (isScheduleStatus(raw)) return raw;

  const match = SCHEDULE_STATUSES.find(
    (s) => s.toLowerCase() === raw.toLowerCase(),
  );
  if (match) return match;

  // Common synonyms from other planning tools. Deliberately narrow: anything
  // not listed lands on the default rather than being guessed at.
  const lowered = raw.toLowerCase();
  if (lowered === "completed" || lowered === "done" || lowered === "finished") return "Complete";
  if (lowered === "started" || lowered === "active" || lowered === "in-progress") return "In Progress";
  if (lowered === "not started" || lowered === "new" || lowered === "planned") return "Not Started";
  if (lowered === "late" || lowered === "overdue" || lowered === "behind") return "Delayed";
  if (lowered === "hold" || lowered === "on-hold" || lowered === "paused") return "On Hold";
  // "Cancelled" has no scheduling meaning (see the module note) — it parks.
  if (lowered === "cancelled" || lowered === "canceled" || lowered === "void") return "On Hold";

  return DEFAULT_SCHEDULE_STATUS;
}

/**
 * The `percent_complete` that must accompany a status change, or `undefined`
 * when the stored value already satisfies the constraint and should be left
 * alone.
 *
 * `undefined` matters: the update payload is built by omitting undefined keys,
 * so returning it means "don't write this column" rather than "write null".
 *
 * The two definitional cases are safe to set without asking:
 *   - Complete    → 100. Complete means the work is done.
 *   - Not Started → 0.   Not Started means none of it is.
 *
 * The third is not. Moving a finished task back to In Progress — punch work,
 * rework, a failed inspection — says the task is no longer done, but nothing in
 * the transition says how much of it now remains. So it returns **null**:
 * progress is genuinely unknown again, and the constraint accepts null.
 *
 * Inventing a number here was the alternative and both candidates lie. 99%
 * asserts the task is nearly finished; 0% erases work that was really done. A
 * task reopened for a two-hour punch item and one reopened because the sequence
 * was rebuilt from scratch arrive at this function identically.
 *
 * Callers must therefore render null as unknown rather than as 0 — see
 * `displayPct` / `percentCompleteOrNull` in scheduleTaskUtils.
 */
export function reconcileStatusPercent(
  status: unknown,
  storedPercent: unknown,
): number | null | undefined {
  if (!isScheduleStatus(status)) return undefined;

  const stored = Number(storedPercent);
  const hasStored = Number.isFinite(stored);

  switch (status) {
    case "Complete":
      return hasStored && stored === 100 ? undefined : 100;

    case "Not Started":
      return hasStored && stored === 0 ? undefined : 0;

    case "In Progress":
      // Already a legal in-progress percent — leave the user's number alone.
      if (hasStored && stored < 100) return undefined;
      // 100, or nothing stored at all: unknown, not zero.
      return null;

    // Delayed / On Hold are unconstrained — a held task keeps whatever
    // progress it had, which is the whole point of holding it.
    default:
      return undefined;
  }
}

/**
 * Apply {@link reconcileStatusPercent} to an update payload in place of the
 * caller doing it.
 *
 * Reads the percent from the payload first and the stored row second, so a user
 * who moved the drawer's slider AND changed the status in one save has their own
 * number validated — not silently replaced by the row's old one.
 *
 * Returns a new object; the input is not mutated.
 */
export function withReconciledPercent<T extends Record<string, any>>(
  fields: T,
  storedTask?: { percent_complete?: unknown } | null,
): T {
  if (!fields || !("status" in fields)) return fields;

  const proposed = "percent_complete" in fields && fields.percent_complete !== undefined
    ? fields.percent_complete
    : storedTask?.percent_complete;

  const reconciled = reconcileStatusPercent(fields.status, proposed);
  if (reconciled === undefined) return fields;

  return { ...fields, percent_complete: reconciled };
}
