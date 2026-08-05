// ── Canonical summary-task predicate ──────────────────────────────────────
//
// A "summary" (a.k.a. parent / rolled-up) schedule task is one whose dates are
// DERIVED from its children (min start / max end). Its stored dates are
// maintained by the DB rollup trigger (see the schedule_summary_rollup
// migration) and, on the Gantt, overlaid by scheduleTree.rollupSummary() for
// display. Because a parent's window merely spans its children, it must NEVER
// be counted as "overdue", "at-risk", "behind schedule", or appear on any
// hit list — the child work items are the real actionable rows. Excluding the
// parent also avoids double-counting (the parent + its late child).
//
// This is the ONE canonical predicate for that question, app-wide. It treats a
// task as a summary if ANY of the following hold:
//   • is_summary           — the persisted flag (now reliably maintained by the
//                            DB trigger; trustworthy going forward)
//   • _hasChildren         — set by the Gantt tree builder (buildTreeOrder)
//   • _isRolledUpSummary   — set by rollupSummary() on the enriched display row
//   • the task's id appears as some OTHER task's parent_task_id — the OR-branch
//     that stays correct even for rows fetched BEFORE the trigger backfill ran,
//     or on surfaces that never run the Gantt tree enrichment. Requires the
//     caller to pass the parent-id set (build it once with buildParentIdSet).
//
// Keeping the parent-id OR-branch means the exclusion is correct regardless of
// whether is_summary has been backfilled yet — belt and suspenders.

/**
 * Collect every non-null parent_task_id in a task list into a Set. Any task
 * whose id is in this set is a parent (has at least one child), even if its
 * is_summary flag hasn't been refreshed yet.
 *
 * Accepts any array of record-shaped rows (callers pass entity rows,
 * TS `ScheduleTaskSource`, enriched Gantt rows, etc.) — we only read
 * `parent_task_id`, coercing to a string key.
 *
 * @param {ReadonlyArray<Record<string, any>>} tasks
 * @returns {Set<string>}
 */
export function buildParentIdSet(tasks) {
  const set = new Set();
  if (!Array.isArray(tasks)) return set;
  for (const t of tasks) {
    const pid = t?.parent_task_id;
    if (pid) set.add(pid);
  }
  return set;
}

/**
 * True when `task` is a summary/parent row that should be excluded from
 * overdue / at-risk / hit-list computations.
 *
 * @param {Record<string, any> | null | undefined} task
 * @param {Set<string>} [parentIds] pass buildParentIdSet(tasks) to also catch
 *   not-yet-refreshed parents by parent_task_id linkage. Optional — when
 *   omitted, only the row-level flags are consulted.
 * @returns {boolean}
 */
export function isSummaryTask(task, parentIds) {
  if (!task) return false;
  if (task.is_summary || task._hasChildren || task._isRolledUpSummary) return true;
  if (parentIds && task.id && parentIds.has(task.id)) return true;
  return false;
}

/**
 * Negation of isSummaryTask — the actionable leaf rows.
 *
 * @param {Record<string, any> | null | undefined} task
 * @param {Set<string>} [parentIds]
 * @returns {boolean}
 */
export function isWorkTask(task, parentIds) {
  return !isSummaryTask(task, parentIds);
}

/**
 * Convenience: filter a task list down to actionable (non-summary) rows,
 * detecting parents via parent_task_id linkage across the whole list. Use this
 * when a surface has the full list and wants a one-shot "leaf rows only".
 *
 * @template T
 * @param {T[]} tasks
 * @returns {T[]}
 */
export function excludeSummaryTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  const parentIds = buildParentIdSet(tasks);
  return tasks.filter((t) => isWorkTask(t, parentIds));
}
