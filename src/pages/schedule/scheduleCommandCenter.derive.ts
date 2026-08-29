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
import { excludeSummaryTasks } from "@/lib/schedule/summaryTasks";
import { applySteelOpsSchedule } from "@/lib/schedule/applySteelOpsSchedule";

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
  parent_task_id?: string | null;
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
  /** Unique leaf tasks with total float ≤ 0 (float_gone). */
  floatGone: number;
  /** Unique leaf tasks with 1–9d total float (float_thin). */
  floatThin: number;
  /** Unique leaf tasks with 10–14d total float (float_watch). */
  floatWatch: number;
  /** Unique leaf tasks gated/blocked/rfi/vif for install. */
  gated: number;
  /** Unique ship/erect pairs with ship-after-erect start clash. */
  loadClashes: number;
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
  return isStalledTask(task as any, today, (t: any) => parseDateUTC(t.start_date));
}

/**
 * Adapter: isLookaheadTask takes (task, today, getStart, getEnd, days).
 * We pass simple field accessors matching the Gantt's usage.
 */
function adaptedIsLookaheadTask(task: TaskRecord, today: Date, days = 14): boolean {
  return isLookaheadTask(
    task as any,
    today,
    (t: any) => t.start_date ?? null,
    (t: any) => t.end_date ?? null,
    days,
  );
}

function overlayTasks(tasks: TaskRecord[]): TaskRecord[] {
  const already = tasks.some(
    (t) => t._floatFlags != null || t._readiness != null || t._cpm != null,
  );
  if (already) return tasks;
  return applySteelOpsSchedule(tasks as Record<string, any>[]).tasks as TaskRecord[];
}

function flagCodes(task: TaskRecord): string[] {
  const flags = Array.isArray(task._floatFlags) ? (task._floatFlags as { code?: string }[]) : [];
  return flags.map((f) => String(f?.code || ""));
}

function readinessStatus(task: TaskRecord): string {
  const r = task._readiness as { status?: string } | undefined;
  return String(r?.status || "");
}

function hasLoadClash(task: TaskRecord): boolean {
  return Array.isArray(task._loadClashes) && (task._loadClashes as unknown[]).length > 0;
}

function countUniqueBy(
  tasks: TaskRecord[],
  pred: (t: TaskRecord) => boolean,
): number {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (!pred(t)) continue;
    ids.add(String(t.id ?? t.task_name ?? Math.random()));
  }
  return ids.size;
}

/**
 * Risk score for a task — higher = more urgent.
 * Overdue dominates, then stalled, then critical-path, then unassigned, then blocked.
 * SteelOps float-gone / gates / load clashes add pressure but never outrank overdue.
 */
function riskScore(task: TaskRecord, today: Date, isOverdue: boolean): number {
  let score = 0;
  if (isOverdue) score += 900;
  if (adaptedIsStalledTask(task, today)) score += 400;
  if (isCriticalTask(task as any)) score += 300;
  if (isUnassignedTask(task as any)) score += 200;
  if (task.blockers && String(task.blockers).trim()) score += 150;
  const codes = flagCodes(task);
  if (codes.includes("float_gone")) score += 250;
  else if (codes.includes("float_thin")) score += 180;
  else if (codes.includes("float_watch") || codes.includes("slip_window")) score += 80;
  if (codes.includes("slip_over")) score += 120;
  const ready = readinessStatus(task);
  if (ready === "blocked") score += 220;
  else if (ready === "rfi" || ready === "vif" || ready === "gated") score += 160;
  if (hasLoadClash(task)) score += 210;
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
  const steelOps = overlayTasks(tasks);
  const steelOpsById = new Map(steelOps.filter((t) => t.id).map((t) => [String(t.id), t]));

  // --- base populations ---
  // Raw entity rows are not always enriched with _hasChildren. The canonical
  // list-aware predicate also identifies parents through child parent_task_id
  // links, preventing parent rollups from being counted as leaf progress.
  const actionable = (excludeSummaryTasks(tasks) as TaskRecord[])
    .filter((t) => isActionableScheduleTask(t as any));
  const open = actionable.filter((t) => isOpenScheduleTask(t as any));

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
  const lookaheadAll = actionable.filter((t) => adaptedIsLookaheadTask(t, today, 14));

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
    .map((t) => {
      const overlaid = (t.id && steelOpsById.get(String(t.id))) || t;
      return { task: t, score: riskScore(overlaid, today, overdueSet.has(t.id)) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ task }) => {
      const overlaid = (task.id && steelOpsById.get(String(task.id))) || task;
      return overlaid;
    });

  const leafOps = (excludeSummaryTasks(steelOps) as TaskRecord[])
    .filter((t) => isActionableScheduleTask(t as any));

  return {
    total: tasks.length,
    critical: tasks.filter((t) => isCriticalTask(t as any)).length,
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
    floatGone: countUniqueBy(leafOps, (t) => flagCodes(t).includes("float_gone")),
    floatThin: countUniqueBy(leafOps, (t) => flagCodes(t).includes("float_thin")),
    floatWatch: countUniqueBy(leafOps, (t) => flagCodes(t).includes("float_watch")),
    gated: countUniqueBy(leafOps, (t) => {
      const st = readinessStatus(t);
      return st === "gated" || st === "blocked" || st === "rfi" || st === "vif";
    }),
    loadClashes: countUniqueBy(leafOps, hasLoadClash),
  };
}
