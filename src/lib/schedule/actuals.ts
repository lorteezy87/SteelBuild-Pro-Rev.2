/**
 * actuals — record what happened, and compare it against what was planned.
 *
 * Audit §1.4 / §7.1. `schedule_tasks` had only planned dates, so marking a task
 * Complete stamped `percent_complete = 100` and no date at all — 40 of 178
 * Complete tasks in production have neither a start nor a finish date. Variance
 * was therefore uncomputable, which is the one number a delay claim turns on.
 *
 * Two rules govern everything in this file:
 *
 * 1. **Never infer an actual from a plan.** `end_date` is what was promised;
 *    copying it into `actual_finish_date` would manufacture evidence of an
 *    on-time finish nobody recorded. A NULL actual means "not recorded", and
 *    every function here reports that as unknown rather than as on-time.
 * 2. **Never silently erase one.** Moving a task backwards out of Complete does
 *    not delete a recorded finish date. That date is a statement about the
 *    world, not a function of the current status.
 */

import { todayLocalISO, daysBetween } from "@/lib/dateMath";

/** Statuses that mean work has demonstrably begun. */
const STARTED_STATUSES = new Set(["In Progress", "Delayed", "Complete"]);

/** Statuses that mean work is demonstrably finished. */
const FINISHED_STATUSES = new Set(["Complete"]);

export interface ActualsTaskLike {
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  actual_start_date?: string | null;
  actual_finish_date?: string | null;
}

export interface ActualsPatch {
  actual_start_date?: string;
  actual_finish_date?: string;
}

export interface DeriveActualsInput {
  /** The task as it stands before the status change. */
  task: ActualsTaskLike | null | undefined;
  /** The status being moved to. */
  nextStatus: string | null | undefined;
  /** Override for tests; defaults to today in LOCAL time (Arizona is UTC-7, so
   *  a UTC "today" stamps tomorrow's date for the last 7 hours of every day). */
  today?: string;
}

/**
 * The actual dates a status change implies, as a patch to merge into the write.
 *
 * Returns `{}` when nothing should change — which is the common case, because
 * an actual is only ever stamped the FIRST time a task reaches a status. A task
 * bounced Complete → In Progress → Complete keeps its original finish date; the
 * second transition is a correction to the status, not a second finish.
 */
export function deriveActualsPatch({ task, nextStatus, today }: DeriveActualsInput): ActualsPatch {
  if (!task || !nextStatus) return {};
  const stamp = today || todayLocalISO();
  const patch: ActualsPatch = {};

  const startsWork = STARTED_STATUSES.has(nextStatus);
  const finishesWork = FINISHED_STATUSES.has(nextStatus);

  if ((startsWork || finishesWork) && !task.actual_start_date) {
    patch.actual_start_date = stamp;
  }
  if (finishesWork && !task.actual_finish_date) {
    patch.actual_finish_date = stamp;
  }

  // A task cannot have finished before it started. When both are stamped in the
  // same transition they are equal, so this only bites when a task is marked
  // Complete after an actual start was recorded in the future — a typo, but one
  // the DB CHECK constraint would reject, taking the whole save with it.
  if (
    patch.actual_finish_date &&
    task.actual_start_date &&
    patch.actual_finish_date < task.actual_start_date
  ) {
    patch.actual_finish_date = task.actual_start_date;
  }

  return patch;
}

/** Did this status change imply stamping anything? */
export function hasActualsPatch(patch: ActualsPatch | null | undefined): boolean {
  return !!patch && (!!patch.actual_start_date || !!patch.actual_finish_date);
}

export type VarianceState =
  | "unknown"   // no actual recorded — NOT the same as on-time
  | "no-plan"   // actual recorded but nothing planned to compare against
  | "early"
  | "on-time"
  | "late";

export interface Variance {
  state: VarianceState;
  /** Positive = finished late, negative = early, 0 = on the planned date.
   *  null whenever `state` is "unknown" or "no-plan". */
  days: number | null;
  plannedFinish: string | null;
  actualFinish: string | null;
}

/**
 * Finish variance for one task: actual finish minus planned finish, in days.
 *
 * `baselineFinish` wins over `end_date` when supplied, because variance against
 * a moving current plan flatters every slip — the plan gets dragged to meet the
 * actual and the variance reads zero. Baselines arrive with the
 * `schedule_baselines` work; until a task has one, this falls back to the
 * current plan and the caller labels it accordingly.
 */
export function computeFinishVariance(
  task: ActualsTaskLike | null | undefined,
  baselineFinish?: string | null,
): Variance {
  const actualFinish = task?.actual_finish_date || null;
  const plannedFinish = baselineFinish || task?.end_date || null;

  if (!actualFinish) {
    return { state: "unknown", days: null, plannedFinish, actualFinish: null };
  }
  if (!plannedFinish) {
    return { state: "no-plan", days: null, plannedFinish: null, actualFinish };
  }

  const days = daysBetween(plannedFinish, actualFinish);
  const state: VarianceState = days > 0 ? "late" : days < 0 ? "early" : "on-time";
  return { state, days, plannedFinish, actualFinish };
}

/** Short cell label: "+4d", "−2d", "On time", "—". */
export function formatVariance(v: Variance | null | undefined): string {
  if (!v) return "—";
  switch (v.state) {
    case "unknown":
    case "no-plan":
      return "—";
    case "on-time":
      return "On time";
    default: {
      const d = v.days ?? 0;
      // U+2212 minus, not a hyphen — it aligns with digits in the tabular
      // numeric font the schedule tables use.
      return d > 0 ? `+${d}d` : `−${Math.abs(d)}d`;
    }
  }
}

/**
 * Why a variance cell is blank. The distinction matters: "nobody recorded a
 * finish" and "finished exactly on plan" render identically as a bare dash
 * otherwise, and the audit's standing rule is that absence is not evidence.
 */
export function describeVariance(v: Variance | null | undefined): string {
  if (!v) return "No data";
  switch (v.state) {
    case "unknown":
      return "No actual finish recorded — not the same as finished on time";
    case "no-plan":
      return `Finished ${v.actualFinish}, but this task has no planned finish to compare against`;
    case "on-time":
      return `Finished ${v.actualFinish}, exactly as planned`;
    case "late":
      return `Planned ${v.plannedFinish}, finished ${v.actualFinish} — ${v.days} day${v.days === 1 ? "" : "s"} late`;
    case "early":
      return `Planned ${v.plannedFinish}, finished ${v.actualFinish} — ${Math.abs(v.days ?? 0)} day${Math.abs(v.days ?? 0) === 1 ? "" : "s"} early`;
  }
}

export interface VarianceRollup {
  /** Tasks with a recorded actual finish AND something to compare it to. */
  measured: number;
  /** Tasks with no actual finish recorded — the denominator's missing half. */
  unmeasured: number;
  late: number;
  early: number;
  onTime: number;
  /** Mean signed variance across measured tasks; null when none are measured. */
  averageDays: number | null;
  /** Worst single slip; null when nothing is late. */
  worstDays: number | null;
}

/**
 * Project-level rollup. Reports `unmeasured` alongside the averages on purpose:
 * an average slip of +1d across 3 measured tasks out of 400 is not a project
 * running one day late, and a headline that hid the denominator would say so.
 */
export function rollupVariance(
  tasks: readonly ActualsTaskLike[] | null | undefined,
  baselineFor?: (task: ActualsTaskLike) => string | null | undefined,
): VarianceRollup {
  const out: VarianceRollup = {
    measured: 0, unmeasured: 0, late: 0, early: 0, onTime: 0,
    averageDays: null, worstDays: null,
  };
  if (!Array.isArray(tasks)) return out;

  let total = 0;
  let worst: number | null = null;

  for (const task of tasks) {
    const v = computeFinishVariance(task, baselineFor?.(task) ?? null);
    if (v.state === "unknown" || v.state === "no-plan") {
      out.unmeasured += 1;
      continue;
    }
    out.measured += 1;
    total += v.days ?? 0;
    if (v.state === "late") {
      out.late += 1;
      if (worst === null || (v.days ?? 0) > worst) worst = v.days ?? 0;
    } else if (v.state === "early") {
      out.early += 1;
    } else {
      out.onTime += 1;
    }
  }

  if (out.measured > 0) out.averageDays = Math.round((total / out.measured) * 10) / 10;
  out.worstDays = worst;
  return out;
}
