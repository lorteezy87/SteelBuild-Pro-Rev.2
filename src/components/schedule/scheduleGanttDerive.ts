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
  /** Calculated float, so the CRITICAL quick filter selects the real
   *  critical path rather than whatever was ticked (§2.2). */
  floatMap?: Record<string, { isCritical: boolean; totalFloat: number | null }> | null;
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
import { computeEffectiveDates } from "@/services/scheduleCascade";
import { fmtDate } from "./scheduleDateUtils";
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

/**
 * Stable key for the set of cycle-affected tasks the user can actually SEE.
 *
 * The cascade map is computed over the WHOLE project (so cross-phase links
 * resolve), but the Gantt renders a phase-filtered subset. Keying the cycle
 * toast off the raw map would announce loops on rows that aren't on screen —
 * and under a filter the user has no way to reach them. Intersecting with the
 * rendered rows keeps the warning actionable.
 *
 * A cycle that only PARTLY intersects the filter still warns: the member on
 * screen is the one silently sitting on stored dates, which is exactly the
 * confusion the toast exists to explain.
 *
 * Returns a sorted, "|"-joined id list so a caller can use it as a memo/effect
 * dependency without re-firing on every render.
 */
/**
 * The tasks "Update Scheduled Dates" may write.
 *
 * Eligible = the cascade actually moved it, it is not in a dependency cycle,
 * it has both an effective start and end, and it is NOT a summary row.
 *
 * Two rules matter here and both were bugs (audit §1.5):
 *
 *  - Population. Callers must pass the WHOLE project, not the phase-filtered
 *    rows. This is a project-wide write; running it over the visible subset
 *    silently did less than its confirm dialog claimed.
 *  - Summary rows. Their start/end are derived by the DB rollup trigger from
 *    their children. Writing one directly is NOT reverted — the trigger
 *    recomputes the row's PARENT, not the row itself — so a synced summary date
 *    persists as a wrong value until some child happens to move.
 *
 * Cycle members are skipped because their effective dates fall back to stored,
 * and a task with no computed window is skipped so we never invent a date on a
 * TBD task.
 */
export function selectShiftedSyncTasks<T extends TaskLike>(
  projectTasks: T[] | null | undefined,
  effectiveDates: Record<string, { start?: string | null; end?: string | null; shifted?: boolean; cycle?: boolean } | undefined> | null | undefined,
): T[] {
  if (!Array.isArray(projectTasks) || projectTasks.length === 0) return [];
  const eff = effectiveDates || {};
  return projectTasks.filter((task) => {
    if (!task || !task.id) return false;
    if (isSummaryScheduleTask(task)) return false;
    const e = eff[String(task.id)];
    if (!e || !e.shifted || e.cycle) return false;
    const start = e.start ?? (task as Record<string, unknown>).start_date;
    const end = e.end ?? (task as Record<string, unknown>).end_date;
    return Boolean(start) && Boolean(end);
  });
}

export interface DragLanding {
  /** Which edge the gesture aimed at. "both" for a move. */
  axis: "start" | "end" | "both";
  /** Where the bar was drawn when the gesture began (effective dates). */
  renderedStart: string | null;
  renderedEnd: string | null;
  /** What the user was aiming at, per edge. */
  droppedStart: string | null;
  droppedEnd: string | null;
  /** Where the bar will actually be drawn after the write cascades. */
  landedStart: string | null;
  landedEnd: string | null;
  /** Days each edge actually moved on screen (may be 0, or negative). */
  movedDaysStart: number;
  movedDaysEnd: number;
  /** True when either edge will not land where it was dropped. */
  landsOffTarget: boolean;
  /**
   * True when a predecessor is STILL constraining the row at its landing
   * position — i.e. the landed date differs from what was written, so
   * something is holding it there NOW.
   */
  heldAtLanding: boolean;
}

function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : 0;
}

/**
 * Predict where a dragged bar will actually be drawn once the write cascades.
 *
 * The Gantt draws EFFECTIVE dates but a drag writes STORED ones. When a
 * predecessor holds the row, the write lands at stored+N, the cascade re-derives
 * the same floor, and the bar returns to where it started — historically a
 * completely silent no-op (audit §2.6).
 *
 * Method: swap the dragged row's dates for the literal payload about to be
 * saved, re-run the REAL cascade over that array, and read the row back. The
 * constraint is never re-derived locally, so this cannot drift from applyLink's
 * semantics (FS/SS/FF/SF, signed lag, cycles) the way a hand-rolled floor would.
 *
 * `projectTasks` must be ONE SNAPSHOT taken when the gesture began. Reading a
 * live ref at drop time would compare a start-of-gesture rendered position
 * against an end-of-gesture task set, which realtime invalidation and
 * FieldToday's optimistic writes can both change mid-drag.
 *
 * Both edges are always reported. A resize-start under an FS floor changes the
 * row's duration, so the cascade recomputes the END from the new duration — the
 * finish can move even when only the start was dragged.
 */
export function computeDragLanding(opts: {
  taskId: string;
  mode: string;
  projectTasks: TaskLike[];
  renderedStart: string | null;
  renderedEnd: string | null;
  nextStart: string;
  nextEnd: string;
}): DragLanding | null {
  const { taskId, mode, projectTasks, renderedStart, renderedEnd, nextStart, nextEnd } = opts;
  if (!taskId || !Array.isArray(projectTasks) || projectTasks.length === 0) return null;

  const after = projectTasks.map((t) =>
    t && String(t.id) === String(taskId)
      ? { ...t, start_date: nextStart, end_date: nextEnd }
      : t,
  );

  const eff = computeEffectiveDates(after as Record<string, unknown>[]);
  const landed = eff[String(taskId)];
  if (!landed) return null;

  const landedStart = landed.start ?? null;
  const landedEnd = landed.end ?? null;

  const axis: DragLanding["axis"] =
    mode === "resize-start" ? "start" : mode === "resize-end" ? "end" : "both";

  // "Held" means the cascade moved the row off the dates just written — so
  // something is constraining it at its landing position right now. A row that
  // was pushed earlier but now sits exactly on what the user saved is NOT held,
  // and must not be described as one.
  const heldAtLanding = landedStart !== nextStart || landedEnd !== nextEnd;

  const droppedStart = axis === "end" ? renderedStart : nextStart;
  const droppedEnd = axis === "start" ? renderedEnd : nextEnd;

  return {
    axis,
    renderedStart,
    renderedEnd,
    droppedStart,
    droppedEnd,
    landedStart,
    landedEnd,
    movedDaysStart: daysBetween(renderedStart, landedStart),
    movedDaysEnd: daysBetween(renderedEnd, landedEnd),
    landsOffTarget:
      (axis !== "end" && landedStart !== droppedStart) ||
      (axis !== "start" && landedEnd !== droppedEnd),
    heldAtLanding,
  };
}

/**
 * Plain-language explanation of a drag whose bar did not land where it was
 * dropped. Only called when `landsOffTarget`.
 *
 * The branch on `heldAtLanding` is the whole point. A row that WAS pushed
 * forward by a predecessor and now sits exactly on the dates the user saved is
 * not held by anything — telling them "a predecessor holds this at X" would
 * name the date they themselves just chose and recommend a remedy that does
 * nothing. That false case is the dominant one for a forward drag past the
 * constraint, so it gets its own wording.
 *
 * Both edges are always stated: a resize-start under an FS floor changes the
 * duration, so the cascade recomputes the finish and the far edge can move even
 * though only the near one was dragged. A bare "didn't move" would be false.
 */
export function describeLanding(landing: DragLanding): string {
  const window = `${fmtDate(landing.landedStart)} → ${fmtDate(landing.landedEnd)}`;

  if (landing.heldAtLanding) {
    return (
      `saved, but a predecessor still holds this task — the bar now runs ${window}. ` +
      `Change the link or its lag on the Dependencies tab, or move the predecessor.`
    );
  }

  return (
    `saved. The bar was sitting ahead of its stored dates because a predecessor ` +
    `had pushed it; it now runs ${window}, on the dates you saved.`
  );
}

export function computeCycleTaskIdsKey(
  effectiveDates: Record<string, { cycle?: boolean } | undefined> | null | undefined,
  visibleTasks: TaskLike[] | null | undefined,
): string {
  if (!effectiveDates || !Array.isArray(visibleTasks) || visibleTasks.length === 0) return "";
  const ids: string[] = [];
  for (const task of visibleTasks) {
    const id = task?.id;
    if (!id) continue;
    if (effectiveDates[String(id)]?.cycle) ids.push(String(id));
  }
  return [...new Set(ids)].sort().join("|");
}

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
    floatMap,
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
      if (quickFilter === "critical") return isCriticalTask(task, floatMap);
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
