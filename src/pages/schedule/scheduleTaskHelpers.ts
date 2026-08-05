// Pure predicates/derivations for the Schedule page. No React, no DB, no clock
// — testable in isolation and shared by the bulk-edit mutations + the bulk
// "Set Parent" picker so the logic can't drift between call sites.
import { validReparentTargets } from "@/lib/schedule/hierarchy";
import type { ScheduleTask } from "./types";

/**
 * The subset of tasks that can have their dates/durations bulk-edited: leaf
 * rows only. Summary rows (parents, rolled-up summaries, explicit summaries)
 * roll their dates up from children, so editing them directly would be
 * overwritten on the next recompute — they're excluded.
 */
export function filterEditableTasks(tasks: ScheduleTask[]): ScheduleTask[] {
  return tasks.filter((t) => !t._hasChildren && !t._isRolledUpSummary && !t.is_summary);
}

/**
 * Legal parent options for the bulk "Set Parent" picker — the intersection of
 * valid reparent targets across every selected task, minus the selected tasks
 * themselves. A parent must be valid for ALL selected children.
 *
 * Returns [] when nothing is selected. Preserves the order of `enrichedTasks`.
 */
export function computeBulkParentOptions(
  enrichedTasks: ScheduleTask[],
  selectedIds: Set<string>,
): ScheduleTask[] {
  const ids = Array.from(selectedIds);
  if (!ids.length) return [];
  let allowed: Set<string> | null = null;
  for (const childId of ids) {
    const v = validReparentTargets(enrichedTasks, childId);
    allowed = allowed ? new Set([...allowed].filter((x) => v.has(x))) : v;
  }
  const allowedSet = allowed || new Set<string>();
  ids.forEach((id) => allowedSet.delete(id));
  return enrichedTasks.filter((t: any) => allowedSet.has(t.id));
}
