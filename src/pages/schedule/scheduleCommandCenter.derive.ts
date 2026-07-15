/**
 * Pure derivations for the canonical Schedule Command Center.
 * No React, no network. Reuses canonical helpers from the schedule layer
 * so the command-center KPIs compute identically to what the Gantt and
 * Task List already show.
 *
 * CLAUDE.md §22: null dates must stay null — never substitute a fake date.
 * TBD is the canonical display for any task with no start_date AND no end_date.
 */
import {
  isCriticalTask,
  isActionableScheduleTask,
  isLookaheadTask,
  isStalledTask,
  isUnassignedTask,
  isOpenScheduleTask,
} from "@/components/schedule/scheduleGanttHelpers";
import { isMilestoneTask, displayPct } from "@/components/schedule/scheduleTaskUtils";
import { parseDateUTC } from "@/components/schedule/scheduleDateUtils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape the derive layer needs — a superset of ScheduleTask. */
export interface TaskRecord {
  id?: string | null;
  task_name?: string | null;
  status?: string | null;
  percent_complete?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  phase?: string | null;
  milestone?: boolean | null;
  priority?: string | null;
  blockers?: string | null;
  resource_names?: string | null;
  assigned_to?: string | null;
  wbs_code?: string | null;
  metadata?: unknown;
  is_critical?: boolean | null;
  is_critical_path?: boolean | null;
  critical_path?: boolean | null;
  _hasChildren?: boolean | null;
  _isRolledUpSummary?: boolean | null;
  is_summary?: boolean | null;
  [key: string]: unknown;
}

export interface ScheduleSummary {
  /** Total task count. */
  total: number;
  /** Count where isCriticalTask() is true. */
  critical: number;
  /** Count where isActionableScheduleTask() is true (leaf tasks, not summaries). */
  activities: number;
  /**
   * Actionable + open tasks where priority === "Critical" OR blockers is
   * non-empty. Distinct from critical-path tasks — this is risk, not CPM.
   */
  atRisk: number;
  /**
   * Actionable tasks that are open, have an end_date, and that end_date is
   * before today. Never counts TBD tasks as overdue.
   */
  overdue: number;
  /** Count of tasks starting/ending within the 14-day lookahead window. */
  inLookahead: number;
  /** Mean displayPct across all actionable tasks, 0-100 rounded. */
  pctComplete: number;
  /** Count of tasks with no start_date AND no end_date (truly TBD). */
  tbd: number;
  /** Count of milestone tasks. */
  milestones: number;
  /** Top 8 lookahead tasks sorted by start_date asc (null-last). */
  lookaheadQueue: TaskRecord[];
  /** Top 8 milestone tasks sorted by start_date asc (null-last). */
  milestoneQueue: TaskRecord[];
  /** Top 5 tasks by risk score. */
  riskQueue: TaskRecord[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** UTC midnight Date for today — stable reference for all predicates in this call. */
function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Adapter: isStalledTask takes (task, today, parseStart) where parseStart is
 * a callback. We supply a simple lambda that reads task.start_date via
 * parseDateUTC — same logic the Gantt uses.
 */
function adaptedIsStalledTask(task: TaskRecord, today: Date): boolean {
  return isStalledTask(task, today, (t: TaskRecord) => parseDateUTC(t.start_date));
}

/**
 * Adapter: isLookaheadTask takes (task, today, getStart, getEnd, days).
 * We pass simple field accessors matching the Gantt's usage.
 */
function adaptedIsLookaheadTask(task: TaskRecord, today: Date, days = 14): boolean {
  return isLookaheadTask(
    task,
    today,
    (t: TaskRecord) => t.start_date ?? null,
    (t: TaskRecord) => t.end_date ?? null,
    days,
  );
}

/**
 * Risk score for a task — higher = more urgent.
 * Overdue dominates, then stalled, then critical-path, then unassigned, then blocked.
 * Used only for riskQueue ranking; not a KPI.
 */
function riskScore(task: TaskRecord, today: Date, isOverdue: boolean): number {
  let score = 0;
  if (isOverdue) score += 900;
  if (adaptedIsStalledTask(task, today)) score += 400;
  if (isCriticalTask(task)) score += 300;
  if (isUnassignedTask(task)) score += 200;
  if (task.blockers && String(task.blockers).trim()) score += 150;
  return score;
}

/** Sort comparator: asc by start_date, null-last. */
function byStartAscNullLast(a: TaskRecord, b: TaskRecord): number {
  const sa = parseDateUTC(a.start_date);
  const sb = parseDateUTC(b.start_date);
  if (sa && sb) return sa.getTime() - sb.getTime();
  if (sa) return -1; // a has date, b doesn't → a first
  if (sb) return 1;  // b has date, a doesn't → b first
  return 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build all KPIs, queues, and counts from the task array.
 * All inputs treated as read-only; returns a new object every call.
 */
export function buildScheduleSummary(tasks: TaskRecord[]): ScheduleSummary {
  const today = todayUTC();

  // --- base populations ---
  const actionable = tasks.filter((t) => isActionableScheduleTask(t));
  const open = actionable.filter((t) => isOpenScheduleTask(t));

  // --- overdue: open actionable with a real end_date before today ---
  const overdueList = open.filter((t) => {
    if (!t.end_date) return false; // no date = TBD, never overdue
    const end = parseDateUTC(t.end_date);
    return end !== null && end < today;
  });

  // --- pctComplete: mean displayPct over all actionable tasks ---
  const pctComplete = actionable.length === 0
    ? 0
    : Math.round(
        actionable.reduce((sum, t) => sum + displayPct(t), 0) / actionable.length
      );

  // --- atRisk: open actionable with Critical priority OR non-empty blockers ---
  const atRisk = open.filter((t) =>
    t.priority === "Critical" || (t.blockers && String(t.blockers).trim()),
  ).length;

  // --- lookahead (14-day window) ---
  const lookaheadAll = tasks.filter((t) => adaptedIsLookaheadTask(t, today, 14));

  // --- milestones ---
  const milestoneAll = tasks.filter((t) => isMilestoneTask(t));

  // --- queues ---
  const lookaheadQueue = [...lookaheadAll]
    .sort(byStartAscNullLast)
    .slice(0, 8);

  const milestoneQueue = [...milestoneAll]
    .sort(byStartAscNullLast)
    .slice(0, 8);

  // riskQueue: open actionable tasks ranked by score, top 5
  const overdueSet = new Set(overdueList.map((t) => t.id));
  const riskQueue = [...open]
    .map((t) => ({ task: t, score: riskScore(t, today, overdueSet.has(t.id)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ task }) => task);

  return {
    total: tasks.length,
    critical: tasks.filter((t) => isCriticalTask(t)).length,
    activities: actionable.length,
    atRisk,
    overdue: overdueList.length,
    inLookahead: lookaheadAll.length,
    pctComplete,
    tbd: tasks.filter((t) => !t.start_date && !t.end_date).length,
    milestones: milestoneAll.length,
    lookaheadQueue,
    milestoneQueue,
    riskQueue,
  };
}
