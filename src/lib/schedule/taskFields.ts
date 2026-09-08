/**
 * taskFields — the milestone flag and the assignment field, each written one way.
 *
 * Audit §4.3. Both facts are spread over more columns than they need, and the
 * readers and writers had drifted apart.
 *
 * ## Milestone — three columns, three writers, one reader
 *
 *   | column       | who writes it            | who reads it                    |
 *   |--------------|--------------------------|---------------------------------|
 *   | task_type    | AddTaskModal, the drawer | isMilestoneTask                 |
 *   | is_milestone | nothing                  | calendar / reports / PCC / margin|
 *   | milestone    | the MS Project importer  | isMilestoneTask                 |
 *
 * `isMilestoneTask` ORs all three, so reads are consistent. Writes are not: a
 * milestone authored in the app sets `task_type` and leaves `is_milestone`
 * null, which is the column the calendar and reports read directly. In
 * production that is 3 rows with task_type='Milestone' and 0 with is_milestone —
 * every one of them invisible to those consumers.
 *
 * The columns agree today only because nothing writes the other two. That is not
 * a guarantee, it is an absence of writers. {@link milestonePatch} makes a
 * milestone write all three, so a row can no longer be half a milestone.
 *
 * Collapsing to one column would be better and is a migration: three columns,
 * four consumers outside the schedule module, and no way to tell a false from a
 * null on the two that were never written. Keeping the reader as the OR and
 * making every writer set all three is the change that can ship without one.
 *
 * ## Assignment — four columns
 *
 *   resource_names · assigned_to · crew_id · crew_name
 *
 * `taskOwner` reads `resource_names || assigned_to`. `buildScheduleResourceAssignPatch`
 * (the bulk path) writes both. The two add paths wrote only `resource_names`,
 * which is why production holds 315 rows with resource_names against 151 with
 * assigned_to, and 4 rows where both are set and disagree.
 *
 * The crew pair belongs to Crew Scheduling and is deliberately left alone: it is
 * a foreign key to a crew record, not a free-text owner, and folding it in here
 * would let a typed name overwrite a real assignment.
 */

/**
 * A task shaped enough to ask whether it is a milestone.
 *
 * The index signature is load-bearing: callers pass DB rows typed by several
 * different local `TaskLike` aliases across the schedule module, and a closed
 * interface would reject any of them that happens not to declare these three
 * optional columns.
 */
export interface MilestoneTaskLike {
  task_type?: string | null;
  is_milestone?: boolean | null;
  milestone?: boolean | null;
  [key: string]: unknown;
}

/**
 * Whether the user flagged this task as a milestone.
 *
 * Auto-detection (duration === 0, or start === end) was deliberately removed
 * once: both add paths default the two dates to today, which flagged every
 * newly created task as a milestone. Only explicit signals count.
 */
export function isMilestoneTask(task: MilestoneTaskLike | null | undefined): boolean {
  if (!task) return false;
  if (task.task_type === "Milestone") return true;
  if (task.is_milestone === true) return true;
  if (task.milestone === true) return true;
  return false;
}

/**
 * The columns to write so a task's milestone flag is unambiguous.
 *
 * Both booleans are set explicitly — including to `false` — so that clearing a
 * milestone actually clears it. Writing only `true` and leaving the false case
 * to a null would make "not a milestone" and "never asked" the same value, and
 * `isMilestoneTask` would keep returning true off the stale column.
 *
 * `task_type` is not touched: it carries more than the milestone bit (a
 * Fabrication task is not "not a milestone", it is a Fabrication task), so the
 * caller sets it and passes the resulting type in.
 */
export function milestonePatch(taskType: string | null | undefined): {
  is_milestone: boolean;
  milestone: boolean;
} {
  const isMilestone = taskType === "Milestone";
  return { is_milestone: isMilestone, milestone: isMilestone };
}

/**
 * Apply the milestone columns to a payload that carries a `task_type`.
 *
 * A no-op when the payload does not set `task_type` — a partial update that
 * only moves a date must not restate a flag it was never asked about.
 */
export function withMilestoneFlags<T extends Record<string, any>>(fields: T): T {
  if (!fields || !("task_type" in fields) || fields.task_type === undefined) return fields;
  return { ...fields, ...milestonePatch(fields.task_type) };
}
