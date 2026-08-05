/**
 * Pure helpers for ScheduleTaskList filter/sort/group.
 */
import { PHASES, PHASE_NUMBER, derivePhase } from "../../utils/phases";
import { buildTreeOrder } from "./scheduleTree";
import { formatDateShort } from "../shared/formatters";

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

export const PRIORITY_COLORS: Record<string, string> = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Normal: "var(--status-info)",
  Low: "var(--text-muted)",
};

export const STATUS_COLORS: Record<string, string> = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  Delayed: "var(--status-error)",
  "On Hold": "var(--status-info)",
};

export const STATUSES = [
  "Not Started",
  "In Progress",
  "Complete",
  "Delayed",
  "On Hold",
  "Cancelled",
] as const;

export const PRIORITIES = ["Critical", "High", "Normal", "Low"] as const;

export const TASK_LIST_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "select", label: "" },
  { key: "wbs", label: "WBS" },
  { key: "task", label: "Task" },
  { key: "start", label: "Start" },
  { key: "finish", label: "Finish" },
  { key: "assigned-to", label: "Assigned To" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "actions", label: "" },
];

export function getScheduleTaskRowKey(
  task: {
    id?: string | null;
    _stored_wbs_code?: string | null;
    wbs_code?: string | null;
    task_number?: string | number | null;
    task_name?: string | null;
  } | null | undefined,
  index: number,
  phase: string = "task",
): string {
  const id = String(task?.id || "").trim();
  if (id) return id;

  const fallback = [
    phase,
    task?._stored_wbs_code || task?.wbs_code,
    task?.task_number,
    task?.task_name,
    index,
  ]
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) => String(part).trim())
    .join(":");

  return fallback || `${phase}:task:${index}`;
}

export function fmtScheduleTaskDate(d: string | null | undefined): string {
  if (!d) return "TBD";
  return formatDateShort(d);
}

export const INLINE_INPUT: Record<string, string | number> = {
  background: "var(--accent-muted)",
  border: "1px solid var(--accent-border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  padding: "2px 6px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export const INLINE_SELECT: Record<string, string | number> = {
  background: "var(--accent-muted)",
  border: "1px solid var(--accent-border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  padding: "2px 4px",
  outline: "none",
  width: "100%",
  cursor: "pointer",
};

export const TASK_LIST_GRID =
  "28px 70px 2fr 90px 90px 1fr 80px 90px 130px";

export const TASK_LIST_SELECT_STYLE: Record<string, string | number> = {
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "8px",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
};
