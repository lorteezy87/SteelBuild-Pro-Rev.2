/**
 * Pure schedule-stats / weather-overlay helpers extracted from ScheduleGantt.
 * Behavior-preserving — the useMemo wrappers in ScheduleGantt keep the same deps.
 */
import { parseDateUTC } from "./scheduleDateUtils";
import { percentCompleteOrNull, isMilestoneTask } from "./scheduleTaskUtils";
import { parseDeps } from "./scheduleDependencies";
import {
  isActionableScheduleTask,
  isCriticalTask,
  isLookaheadTask,
  isStalledTask,
  isUnassignedTask,
} from "./scheduleGanttHelpers";

export const WEATHER_SENSITIVE_PHASES = new Set([
  "Installation",
  "Delivery",
  "Erection",
  "Erection/Installation",
]);

export type WeatherRiskHit = Record<string, unknown>;

type TaskLike = {
  id?: string;
  phase?: string | null;
  status?: string | null;
  dependencies?: unknown;
  [key: string]: unknown;
};

type EffectiveDateEntry = {
  shifted?: boolean;
  shiftedBy?: number | string | null;
};

type RisksForWindow = (
  risks: WeatherRiskHit[],
  start: string | null | undefined,
  end: string | null | undefined,
) => WeatherRiskHit[];

export function buildWeatherRiskByTask(
  weatherRisk: { risks?: WeatherRiskHit[] } | null | undefined,
  allTasks: TaskLike[],
  effStart: (task: TaskLike) => string | null | undefined,
  effEnd: (task: TaskLike) => string | null | undefined,
  risksForTaskWindow: RisksForWindow,
  sensitivePhases: Set<string> = WEATHER_SENSITIVE_PHASES,
): Record<string, WeatherRiskHit[]> {
  const out: Record<string, WeatherRiskHit[]> = {};
  if (!weatherRisk?.risks?.length || !allTasks?.length) return out;
  for (const t of allTasks) {
    if (!sensitivePhases.has(String(t.phase || ""))) continue;
    const hits = risksForTaskWindow(weatherRisk.risks, effStart(t), effEnd(t));
    if (hits.length > 0 && t.id) out[t.id] = hits;
  }
  return out;
}

export type ScheduleStats = {
  totalTasks: number;
  completeTasks: number;
  overdueTasks: number;
  inProgressTasks: number;
  unscheduledTasks: number;
  lookaheadTasks: number;
  stalledTasks: number;
  criticalTasks: number;
  milestoneTasks: number;
  shiftedTasks: number;
  totalShiftDays: number;
  unassignedTasks: number;
  weatherRiskTasks: number;
  dependencyLinks: number;
  progressTotal: number;
  progressCount: number;
  avgProgress: number;
};

export function computeScheduleStats(
  allTasks: TaskLike[],
  opts: {
    today: Date;
    effectiveDates: Record<string, EffectiveDateEntry | undefined>;
    weatherRiskByTask: Record<string, WeatherRiskHit[] | undefined>;
    effStart: (task: TaskLike) => string | null | undefined;
    effEnd: (task: TaskLike) => string | null | undefined;
    isOverdue: (task: TaskLike) => boolean;
  },
): ScheduleStats {
  const { today, effectiveDates, weatherRiskByTask, effStart, effEnd, isOverdue } = opts;
  const stats = {
    totalTasks: allTasks.length,
    completeTasks: 0,
    overdueTasks: 0,
    inProgressTasks: 0,
    unscheduledTasks: 0,
    lookaheadTasks: 0,
    stalledTasks: 0,
    criticalTasks: 0,
    milestoneTasks: 0,
    shiftedTasks: 0,
    totalShiftDays: 0,
    unassignedTasks: 0,
    weatherRiskTasks: 0,
    dependencyLinks: 0,
    progressTotal: 0,
    progressCount: 0,
  };

  for (const task of allTasks) {
    const actionable = isActionableScheduleTask(task);
    if (task.status === "Complete") stats.completeTasks += 1;
    if (task.status === "In Progress") stats.inProgressTasks += 1;
    if (actionable && isOverdue(task)) stats.overdueTasks += 1;
    if (actionable && (!effStart(task) || !effEnd(task))) stats.unscheduledTasks += 1;
    if (actionable && isLookaheadTask(task, today, effStart, effEnd)) stats.lookaheadTasks += 1;
    if (actionable && isStalledTask(task, today, (item) => parseDateUTC(effStart(item)))) {
      stats.stalledTasks += 1;
    }
    if (actionable && isCriticalTask(task)) stats.criticalTasks += 1;
    if (actionable && isMilestoneTask(task)) stats.milestoneTasks += 1;
    const taskId = task.id;
    if (actionable && taskId && effectiveDates[taskId]?.shifted) stats.shiftedTasks += 1;
    if (actionable && taskId) stats.totalShiftDays += Number(effectiveDates[taskId]?.shiftedBy) || 0;
    if (actionable && isUnassignedTask(task)) stats.unassignedTasks += 1;
    if (actionable && taskId && weatherRiskByTask[taskId]) stats.weatherRiskTasks += 1;
    if (actionable) stats.dependencyLinks += parseDeps(task.dependencies).length;
    if (actionable) {
      // Only tasks with a known percent count toward the average. Adding an
      // unknown as 0 would drag the headline down by asserting no progress.
      const pct = percentCompleteOrNull(task);
      if (pct !== null) {
        stats.progressTotal += pct;
        stats.progressCount += 1;
      }
    }
  }

  return {
    ...stats,
    avgProgress: stats.progressCount > 0 ? Math.round(stats.progressTotal / stats.progressCount) : 0,
  };
}
