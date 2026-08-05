/**
 * Pure helpers for ScheduleTaskList filter/sort/group.
 */
import { PHASES, PHASE_NUMBER, derivePhase } from "../../utils/phases";
import { buildTreeOrder } from "./scheduleTree";

const PRIORITY_ORDER = ["Critical", "High", "Normal", "Low"];

export function filterScheduleTasksByPriorityStatus<
  T extends { priority?: string | null; status?: string | null },
>(
  tasks: T[] | null | undefined,
  opts: { filterPriority?: string; filterStatus?: string } = {},
): T[] {
  const filterPriority = opts.filterPriority ?? "all";
  const filterStatus = opts.filterStatus ?? "all";
  return (tasks || []).filter((t) => {
    const prioMatch = filterPriority === "all" || t.priority === filterPriority;
    const statusMatch = filterStatus === "all" || t.status === filterStatus;
    return prioMatch && statusMatch;
  });
}

export function sortByStartDate<T extends { start_date?: string | null }>(a: T, b: T): number {
  if (!a.start_date) return 1;
  if (!b.start_date) return -1;
  return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
}

export function groupScheduleTasksByPhase<
  T extends {
    id?: string | null;
    parent_task_id?: string | null;
    priority?: string | null;
    start_date?: string | null;
  },
>(
  filtered: T[] | null | undefined,
  opts: {
    sortBy?: string;
    collapsedTasks?: Record<string, boolean>;
  } = {},
): Array<{ phase: string; tasks: T[]; totalTasks: number }> {
  const sortBy = opts.sortBy || "phase";
  const collapsedTasks = opts.collapsedTasks || {};
  const orderSource = [...(filtered || [])];

  if (sortBy === "priority") {
    orderSource.sort(
      (a, b) => PRIORITY_ORDER.indexOf(a.priority || "") - PRIORITY_ORDER.indexOf(b.priority || ""),
    );
  } else if (sortBy === "start_date") {
    orderSource.sort(sortByStartDate);
  }

  return PHASES.map((phase) => {
    const ordered = buildTreeOrder(
      orderSource.filter((t) => derivePhase(t) === phase),
      { rootPrefix: PHASE_NUMBER[phase] ?? null },
    ) as T[];
    const taskById = new Map(ordered.map((task) => [task.id, task]));
    const visibleTasks = ordered.filter((task) => {
      let parentId = task.parent_task_id as string | null | undefined;
      while (parentId) {
        if (collapsedTasks[parentId]) return false;
        const parent = taskById.get(parentId);
        if (!parent) break;
        parentId = parent.parent_task_id as string | null | undefined;
      }
      return true;
    });

    return { phase, tasks: visibleTasks, totalTasks: ordered.length };
  }).filter((g) => g.tasks.length > 0);
}
