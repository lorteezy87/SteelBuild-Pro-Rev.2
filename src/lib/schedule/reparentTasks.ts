import { entities } from "@/api/supabaseClient";
import { logActivity } from "@/services/auditLogger";
import { wouldCreateCycle, computeSiblingSortOrder, type HierarchyTask } from "./hierarchy";

/** A schedule_tasks row as far as a reparent reads it. */
export interface ReparentTask extends HierarchyTask {
  project_id?: string | null;
  task_name?: string | null;
}

export interface ReparentOptions {
  tasks?: ReparentTask[];
  dropIndex?: number | null;
  projectId?: string | null;
  projectName?: string | null;
}

/**
 * Reparent one or many tasks under `newParentId` (null = root), writing
 * parent_task_id + a computed sort_order. Single audited path shared by the
 * Gantt drag, the drawer picker, and bulk "Set parent".
 *
 *  - Validates EVERY id first; if any would create a cycle the whole batch is
 *    rejected (no partial structural change).
 *  - Writes SEQUENTIALLY (avoids the parallel sort_order race the old
 *    swapOrder had) and logs each change via auditLogger.
 */
export async function reparentTasks(
  taskIds: ReadonlyArray<string | null | undefined> | null | undefined,
  newParentId: string | null,
  opts: ReparentOptions = {},
): Promise<void> {
  const { tasks = [], dropIndex = null, projectId = null, projectName = null } = opts;
  const ids = (Array.isArray(taskIds) ? taskIds : []).filter((id): id is string => !!id);
  if (!ids.length) return;

  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Validate the entire batch before any write.
  for (const id of ids) {
    if (wouldCreateCycle(tasks, id, newParentId)) {
      throw new Error("That move would make a task its own descendant (cycle).");
    }
  }

  // Sequential writes. For a multi-task drop we append in selection order so
  // their relative ordering is preserved under the new parent.
  let order = computeSiblingSortOrder(tasks, newParentId, dropIndex);
  for (const id of ids) {
    const before = byId.get(id);
    await entities.ScheduleTask.update(id, {
      parent_task_id: newParentId,
      sort_order: order,
    });
    void logActivity("schedule_task", "updated", before || { id }, {
      projectId: projectId || before?.project_id || null,
      projectName,
      description: `Reparented ${before?.task_name || id} → ${
        newParentId ? byId.get(newParentId)?.task_name || newParentId : "top level"
      }`,
    });
    order += 1000; // keep multi-task drops in order
  }
}
