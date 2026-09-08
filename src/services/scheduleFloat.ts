/**
 * scheduleFloat — the backward pass: total float, free float, critical path.
 *
 * Audit §2.2 / §7.3. "Critical path" was a checkbox. `isCriticalTask` ORed three
 * manual flags and the drawer exposed a "Mark as Critical Path" toggle; there
 * was no forward/backward pass and no float calculation anywhere in the repo.
 *
 * Everything downstream inherited the fiction. The Rivet brief writes "directly
 * impacting the critical path" and "+Nd pressure on the critical path" — all
 * from a box someone ticked, possibly months ago, possibly before the dates
 * moved underneath it.
 *
 * The forward pass already exists: `computeEffectiveDates` walks the same graph
 * to produce early start / early finish. This module runs the backward pass over
 * it, so float can never disagree with the bars the Gantt actually draws.
 *
 * ## Mirroring applyLink
 *
 * The backward relations are the algebraic inverse of the forward ones in
 * `applyLink`, and MUST be kept in step with it. `dur` throughout is the
 * cascade's own exclusive day offset (`end = start + dur`), not the inclusive
 * display duration — mixing the two shifts every float by a day.
 *
 *   forward (successor is pushed)          backward (predecessor is capped)
 *   FS: succ.ES >= pred.EF + lag           pred.LF <= succ.LS - lag
 *   SS: succ.ES >= pred.ES + lag           pred.LF <= succ.LS - lag + dur
 *   FF: succ.EF >= pred.EF + lag           pred.LF <= succ.LF - lag
 *   SF: succ.EF >= pred.ES + lag           pred.LF <= succ.LF - lag + dur
 *
 * ## What float means here
 *
 * Total float — how long a task can slip before it delays the PROJECT finish.
 * Free float — how long it can slip before it delays its own SUCCESSORS.
 * Critical — total float <= 0. Near-critical — 0 < total float <= 5 days, which
 * is where steel jobs actually get hurt.
 *
 * Float is in CALENDAR days, matching the cascade. A working-day calendar is a
 * separate concern (§2.1/§7.4); until it lands, a 2-day float spanning a
 * weekend is 2 calendar days, not 2 shifts.
 */

import {
  computeEffectiveDates,
  parseDependencies,
  addDaysIso,
  toDateOnly,
} from "./scheduleCascade";
import type { EffectiveDate } from "./scheduleCascade";

const MS_PER_DAY = 86_400_000;

/** Near-critical threshold in days. Steel jobs get hurt in this band. */
export const NEAR_CRITICAL_DAYS = 5;

export interface TaskFloat {
  /** Days of slip before the PROJECT finish moves. Null when uncomputable. */
  totalFloat: number | null;
  /** Days of slip before this task's own successors move. Null when uncomputable. */
  freeFloat: number | null;
  /** totalFloat <= 0 — calculated, not a flag someone ticked. */
  isCritical: boolean;
  /** 0 < totalFloat <= NEAR_CRITICAL_DAYS. */
  isNearCritical: boolean;
  lateStart: string | null;
  lateFinish: string | null;
  /** Member of a predecessor cycle — float is meaningless, everything is null. */
  cycle: boolean;
}

type Task = Record<string, any>;

function diffDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

const UNKNOWN: TaskFloat = Object.freeze({
  totalFloat: null,
  freeFloat: null,
  isCritical: false,
  isNearCritical: false,
  lateStart: null,
  lateFinish: null,
  cycle: false,
});

/**
 * Total and free float for every task, plus the calculated critical path.
 *
 * `effectiveDates` is injectable so a caller that has already run the cascade
 * (Schedule.tsx computes it once for the whole project) does not pay for it
 * twice, and so float and the bars are guaranteed to describe the same graph.
 */
export function computeFloat(
  tasks: Task[] | null | undefined,
  effectiveDates?: Record<string, EffectiveDate> | null,
): Record<string, TaskFloat> {
  const out: Record<string, TaskFloat> = Object.create(null);
  if (!Array.isArray(tasks) || tasks.length === 0) return out;

  const eff = effectiveDates ?? computeEffectiveDates(tasks);
  const byId: Record<string, Task> = Object.create(null);
  for (const t of tasks) if (t?.id) byId[t.id] = t;

  // successors[predId] = [{ succId, type, lag }]
  const successors: Record<string, Array<{ id: string; type: string; lag: number }>> =
    Object.create(null);
  for (const task of tasks) {
    if (!task?.id) continue;
    for (const link of parseDependencies(task.dependencies)) {
      // A link to a task that no longer exists constrains nothing (§1.6).
      if (!byId[link.id]) continue;
      (successors[link.id] ||= []).push({
        id: String(task.id),
        type: link.type,
        lag: link.lag_days ?? 0,
      });
    }
  }

  /** Early start / early finish, from the forward pass the Gantt already draws. */
  const es = (id: string): string | null => toDateOnly(eff[id]?.start ?? null);
  const ef = (id: string): string | null => toDateOnly(eff[id]?.end ?? null);

  /** The cascade's own exclusive offset: end = start + dur. */
  const durOf = (id: string): number | null => diffDays(es(id), ef(id));

  // Project finish: the latest early finish anywhere. Tasks with no successors
  // are held to this, which is what makes their float measure slip against the
  // PROJECT rather than against nothing.
  let projectFinish: string | null = null;
  for (const task of tasks) {
    const end = task?.id ? ef(task.id) : null;
    if (end && (!projectFinish || end > projectFinish)) projectFinish = end;
  }
  if (!projectFinish) {
    for (const task of tasks) if (task?.id) out[task.id] = UNKNOWN;
    return out;
  }

  // ── backward pass ─────────────────────────────────────────────────────────
  // Memoised recursion rather than a topological sort: the graph is small
  // (largest project is 88 tasks) and this reuses the cycle handling shape the
  // forward pass already established.
  const lateFinish: Record<string, string | null> = Object.create(null);
  const resolving = new Set<string>();
  const inCycle = new Set<string>();

  function resolveLateFinish(id: string): string | null {
    if (id in lateFinish) return lateFinish[id];
    if (resolving.has(id)) {
      // Cycle. The forward pass already warns about these and falls back to
      // stored dates; float over a cycle is meaningless, so mark and bail.
      for (const member of resolving) inCycle.add(member);
      inCycle.add(id);
      return null;
    }

    resolving.add(id);
    let lf: string | null = projectFinish;

    for (const succ of successors[id] || []) {
      const succLf = resolveLateFinish(succ.id);
      if (succLf === null) continue; // cycle or unresolvable — cannot constrain

      const succDur = durOf(succ.id);
      const succLs = succDur === null ? null : addDaysIso(succLf, -succDur);
      const myDur = durOf(id);
      let cap: string | null = null;

      // Inverse of applyLink, case for case.
      if (succ.type === "FS") {
        cap = succLs === null ? null : addDaysIso(succLs, -succ.lag);
      } else if (succ.type === "SS") {
        const capStart = succLs === null ? null : addDaysIso(succLs, -succ.lag);
        cap = capStart === null || myDur === null ? null : addDaysIso(capStart, myDur);
      } else if (succ.type === "FF") {
        cap = addDaysIso(succLf, -succ.lag);
      } else if (succ.type === "SF") {
        const capStart = addDaysIso(succLf, -succ.lag);
        cap = capStart === null || myDur === null ? null : addDaysIso(capStart, myDur);
      }

      if (cap && (lf === null || cap < lf)) lf = cap;
    }

    resolving.delete(id);
    lateFinish[id] = lf;
    return lf;
  }

  for (const task of tasks) if (task?.id) resolveLateFinish(task.id);

  // ── assemble ──────────────────────────────────────────────────────────────
  for (const task of tasks) {
    const id = task?.id;
    if (!id) continue;

    if (inCycle.has(id) || eff[id]?.cycle) {
      out[id] = { ...UNKNOWN, cycle: true };
      continue;
    }

    const earlyFinish = ef(id);
    const lf = lateFinish[id] ?? null;
    const total = diffDays(earlyFinish, lf);

    if (earlyFinish === null || lf === null || total === null) {
      out[id] = UNKNOWN;
      continue;
    }

    // Free float: slip before this task's OWN successors move. A task with no
    // successors has no free float distinct from its total float — nothing
    // downstream to protect — so it inherits it.
    let free: number | null = null;
    for (const succ of successors[id] || []) {
      const succEs = es(succ.id);
      const succEf = ef(succ.id);
      let slack: number | null = null;

      if (succ.type === "FS") {
        slack = diffDays(addDaysIso(earlyFinish, succ.lag), succEs);
      } else if (succ.type === "SS") {
        slack = diffDays(addDaysIso(es(id), succ.lag), succEs);
      } else if (succ.type === "FF") {
        slack = diffDays(addDaysIso(earlyFinish, succ.lag), succEf);
      } else if (succ.type === "SF") {
        slack = diffDays(addDaysIso(es(id), succ.lag), succEf);
      }

      if (slack === null) continue;
      if (free === null || slack < free) free = slack;
    }
    if (free === null) free = total;

    out[id] = {
      totalFloat: total,
      // Free float can never exceed total float, and rounding through separate
      // paths can make it appear to. Clamp rather than publish a contradiction.
      freeFloat: Math.max(0, Math.min(free, total)),
      isCritical: total <= 0,
      isNearCritical: total > 0 && total <= NEAR_CRITICAL_DAYS,
      lateStart: durOf(id) === null ? null : addDaysIso(lf, -(durOf(id) as number)),
      lateFinish: lf,
      cycle: false,
    };
  }

  return out;
}

/** The calculated critical path as a set of task ids. */
export function criticalTaskIds(floats: Record<string, TaskFloat> | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const [id, f] of Object.entries(floats || {})) if (f?.isCritical) out.add(id);
  return out;
}

export type CriticalSource = "calculated" | "manual" | "both" | "none";

/**
 * Why a task is showing as critical.
 *
 * §7.3 keeps the manual flag as an override with a DISTINCT badge rather than
 * deleting it — a PM may know something the logic does not. But a hand-ticked
 * box and a calculated zero-float result are different claims and must not
 * render identically, which is exactly how the old checkbox came to be trusted.
 */
export function criticalSource(
  taskFloat: TaskFloat | null | undefined,
  manuallyFlagged: boolean,
): CriticalSource {
  const calculated = !!taskFloat?.isCritical;
  if (calculated && manuallyFlagged) return "both";
  if (calculated) return "calculated";
  if (manuallyFlagged) return "manual";
  return "none";
}

/** Short label for a float cell: "0d", "+3d", "—" when unknown. */
export function formatFloat(taskFloat: TaskFloat | null | undefined): string {
  if (!taskFloat || taskFloat.totalFloat === null) return "—";
  const d = taskFloat.totalFloat;
  return d > 0 ? `+${d}d` : `${d}d`;
}

/** Why a float cell is blank or what it means, for a tooltip. */
export function describeFloat(taskFloat: TaskFloat | null | undefined): string {
  if (!taskFloat) return "No float data";
  if (taskFloat.cycle) return "In a predecessor cycle — float cannot be calculated until the loop is broken";
  if (taskFloat.totalFloat === null) return "Not enough dates to calculate float";
  if (taskFloat.totalFloat <= 0) return "On the critical path — any slip moves the project finish";
  if (taskFloat.isNearCritical) {
    return `Near critical — ${taskFloat.totalFloat} day${taskFloat.totalFloat === 1 ? "" : "s"} of float before the project finish moves`;
  }
  return `${taskFloat.totalFloat} days of float before the project finish moves; ${taskFloat.freeFloat} before its successors move`;
}
