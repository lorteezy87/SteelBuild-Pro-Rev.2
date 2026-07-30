// Minimal types for schedule gantt derive helpers — byte-identical runtime behavior.
type TaskLike = Record<string, unknown> & {
  id: string;
  dependencies?: unknown;
  parent_task_id?: string;
  _hasChildren?: boolean;
  status?: string | null;
};

type GroupedEntry = { phase: { label?: string; key?: string }; tasks: TaskLike[] };

type EffectiveDateEntry = { shifted?: boolean; shiftedBy?: number | string | null };

type FilterOpts = {
  allTasks: TaskLike[];
  grouped: GroupedEntry[];
  normalizedSearch: string;
  quickFilter: string;
  hasActiveRowFilter: boolean;
  effectiveDates: Record<string, EffectiveDateEntry | undefined>;
  successorCountById: Record<string, number>;
  weatherRiskByTask: Record<string, unknown[]>;
  today: Date;
  isOverdue: (task: TaskLike) => boolean;
  effStart: (task: TaskLike) => string | null | undefined;
  effEnd: (task: TaskLike) => string | null | undefined;
};

type LayoutRow =
  | { type: "summary" | "delivery-summary" }
  | { type: "task"; task: TaskLike }
  | { type: string; task?: TaskLike };

type DepArrow = {
  key: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

// Pure derive helpers extracted from ScheduleGantt.jsx — row layout, dependency
// arrows, and viewport windowing. Schedule stats live in scheduleGanttStats.ts.
import { parseDateUTC } from "./scheduleDateUtils";
import { isMilestoneTask } from "./scheduleTaskUtils";
import { parseDeps } from "./scheduleDependencies";
import {
  findFirstRowAtOrAfter,
  findFirstRowAfter,
  isCriticalTask,
  isLookaheadTask,
  isStalledTask,
  isUnassignedTask,
  hasLogicGapTask,
  isSummaryScheduleTask,
  taskSearchHaystack,
} from "./scheduleGanttHelpers";

export const GANTT_ROW_H = 40;
export const GANTT_SUM_H = 36;
export const GANTT_VIRTUAL_OVERSCAN = 320;

export function computeSuccessorCountById(allTasks: TaskLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  allTasks.forEach((task) => {
    parseDeps(task.dependencies).forEach((predId) => {
      out[predId] = (out[predId] || 0) + 1;
    });
  });
  return out;
}

export function computeVisibleTaskIds(opts: FilterOpts): Set<string> | null {
  const {
    allTasks,
    grouped,
    normalizedSearch,
    quickFilter,
    hasActiveRowFilter,
    effectiveDates,
    successorCountById,
    weatherRiskByTask,
    today,
    isOverdue,
    effStart,
    effEnd,
  } = opts;
  if (!hasActiveRowFilter) return null;

  const allById = new Map<string, { parent_task_id?: string }>(
    allTasks.map((task) => [task.id, task]),
  );
  const phaseById = new Map<string, GroupedEntry["phase"]>();
  grouped.forEach(({ phase, tasks }) => {
    tasks.forEach((task) => phaseById.set(task.id, phase));
  });

  const directMatches = new Set<string>();
  allTasks.forEach((task) => {
    const phase = phaseById.get(task.id);
    const matchesText = !normalizedSearch || taskSearchHaystack(task, phase?.label || phase?.key || "").includes(normalizedSearch);
    const matchesQuick = (() => {
      if (quickFilter !== "all" && isSummaryScheduleTask(task)) return false;
      if (quickFilter === "all") return true;
      if (quickFilter === "lookahead") return isLookaheadTask(task, today, effStart, effEnd);
      if (quickFilter === "critical") return isCriticalTask(task);
      if (quickFilter === "delayed") return String(task.status || "").toLowerCase().includes("delay");
      if (quickFilter === "stalled") return isStalledTask(task, today, (item: any) => parseDateUTC(effStart(item)));
      if (quickFilter === "overdue") return isOverdue(task);
      if (quickFilter === "tbd") return !effStart(task) || !effEnd(task);
      if (quickFilter === "logic") return hasLogicGapTask(task, successorCountById);
      if (quickFilter === "unassigned") return isUnassignedTask(task);
      if (quickFilter === "shifted") return Boolean(effectiveDates[task.id]?.shifted);
      if (quickFilter === "deps") return parseDeps(task.dependencies).length > 0 || successorCountById[task.id] > 0;
      if (quickFilter === "unlinked") return parseDeps(task.dependencies).length === 0 && !successorCountById[task.id] && !task.parent_task_id && !task._hasChildren;
      if (quickFilter === "milestones") return isMilestoneTask(task);
      if (quickFilter === "weather") return Boolean(weatherRiskByTask[task.id]);
      return true;
    })();
    if (matchesText && matchesQuick) directMatches.add(task.id);
  });

  const withAncestors = new Set<string>(directMatches);
  directMatches.forEach((taskId) => {
    let parentId = allById.get(taskId)?.parent_task_id;
    const guard = new Set<string>();
    while (parentId && !guard.has(parentId)) {
      guard.add(parentId);
      withAncestors.add(parentId);
      parentId = allById.get(parentId)?.parent_task_id;
    }
  });

  return withAncestors;
}

export function buildTaskPositions(rows: LayoutRow[], rowH = GANTT_ROW_H, sumH = GANTT_SUM_H): Record<string, { y: number }> {
  const posMap: Record<string, { y: number }> = {};
  let y = 0;
  rows.forEach((row) => {
    if (row.type === "summary" || row.type === "delivery-summary") {
      y += sumH;
    } else if (row.type === "task" && row.task) {
      posMap[row.task.id] = { y: y + rowH / 2 };
      y += rowH;
    } else {
      y += rowH;
    }
  });
  return posMap;
}

export function buildDepArrows(opts: {
  rows: LayoutRow[];
  taskPositions: Record<string, { y: number }>;
  taskById: Map<string, TaskLike>;
  effStart: (task: TaskLike) => string | null | undefined;
  effEnd: (task: TaskLike) => string | null | undefined;
  px: (date: string) => number;
}): DepArrow[] {
  const { rows, taskPositions, taskById, effStart, effEnd, px } = opts;
  const arrows: DepArrow[] = [];
  rows.forEach((row) => {
    if (row.type !== "task" || !row.task) return;
    const task = row.task;
    const deps = parseDeps(task.dependencies);
    if (!deps.length) return;
    const toPos = taskPositions[task.id];
    const taskEffStart = effStart(task);
    if (!toPos || !taskEffStart) return;
    const toX = px(taskEffStart);
    deps.forEach((predId) => {
      const predPos = taskPositions[predId];
      if (!predPos) return;
      const predTask = taskById.get(predId);
      const predEnd = predTask ? effEnd(predTask) : null;
      if (!predTask || !predEnd) return;
      const fromX = px(predEnd);
      arrows.push({
        key: `${predId}-${task.id}`,
        fromX,
        fromY: predPos.y,
        toX,
        toY: toPos.y,
      });
    });
  });
  return arrows;
}

export function buildRowLayout(rows: LayoutRow[], rowH = GANTT_ROW_H, sumH = GANTT_SUM_H) {
  let top = 0;
  const items = rows.map((row, index) => {
    const height = (row.type === "summary" || row.type === "delivery-summary") ? sumH : rowH;
    const item = { row, index, top, height };
    top += height;
    return item;
  });
  return { items, totalHeight: top };
}

export function sliceVirtualRows(
  rowLayout: ReturnType<typeof buildRowLayout>,
  scrollTop: number,
  height: number,
  overscan = GANTT_VIRTUAL_OVERSCAN,
) {
  const start = Math.max(0, scrollTop - overscan);
  const end = scrollTop + height + overscan;
  const startIndex = findFirstRowAtOrAfter(rowLayout.items, start);
  const endIndex = findFirstRowAfter(rowLayout.items, end);
  return rowLayout.items.slice(startIndex, endIndex);
}

export function computeVirtualPadding(
  virtualRows: Array<{ top: number; height: number }>,
  totalHeight: number,
) {
  const virtualTopPadding = virtualRows[0]?.top || 0;
  const virtualBottomPadding = virtualRows.length
    ? Math.max(0, totalHeight - (virtualRows[virtualRows.length - 1].top + virtualRows[virtualRows.length - 1].height))
    : 0;
  return { virtualTopPadding, virtualBottomPadding };
}

export function filterVisibleDepArrows(
  depArrows: DepArrow[],
  scrollTop: number,
  height: number,
  overscan = GANTT_VIRTUAL_OVERSCAN,
) {
  const start = Math.max(0, scrollTop - overscan);
  const end = scrollTop + height + overscan;
  return depArrows.filter(({ fromY, toY }) => (
    (fromY >= start && fromY <= end) || (toY >= start && toY <= end)
  ));
}
