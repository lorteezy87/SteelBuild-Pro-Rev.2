/**
 * Backward-pass CPM float on top of stored/effective dates.
 * Forward placement stays in scheduleCascade.computeEffectiveDates.
 */
import { parseDependencies, type DependencyLink } from "@/services/scheduleCascade";
import { isSummaryTask } from "@/lib/schedule/summaryTasks";

const DAY_MS = 86_400_000;

export type CpmRow = {
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  critical: boolean;
};

function toISO(s: unknown): string | null {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : null;
  return iso;
}

function fromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / DAY_MS);
}

function minDate(dates: Array<string | null | undefined>): string | null {
  let min: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!min || d < min) min = d;
  }
  return min;
}

function maxDate(dates: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d > max) max = d;
  }
  return max;
}

function activityDuration(task: Record<string, any>): number {
  if (task.milestone) return 0;
  const start = toISO(task.start_date);
  const end = toISO(task.end_date);
  if (start && end) return Math.max(task.milestone ? 0 : 1, diffDays(start, end));
  const dur = Number(task.duration);
  return Number.isFinite(dur) && dur > 0 ? Math.trunc(dur) : 1;
}

function finishFromStart(start: string, duration: number): string {
  if (duration <= 0) return start;
  return addDays(start, duration);
}

function startFromFinish(finish: string, duration: number): string {
  if (duration <= 0) return finish;
  return addDays(finish, -duration);
}

/**
 * Compute ES/EF/LS/LF/total float. Leaves + milestones participate in the
 * network; summaries inherit min float / any-critical from descendants.
 */
export function computeCpmFloat(tasks: Record<string, any>[]): Map<string, CpmRow> {
  const result = new Map<string, CpmRow>();
  if (!Array.isArray(tasks) || tasks.length === 0) return result;

  const activities = tasks.filter((t) => t?.id && !isSummaryTask(t));
  const byId = new Map(activities.map((t) => [String(t.id), t]));

  const incoming = new Map<string, Array<DependencyLink & { predecessorId: string }>>();
  const outgoing = new Map<string, Array<DependencyLink & { successorId: string }>>();

  for (const task of activities) {
    const id = String(task.id);
    for (const link of parseDependencies(task.dependencies)) {
      if (!link.id || !byId.has(link.id) || link.id === id) continue;
      const edge = { ...link, predecessorId: link.id, successorId: id };
      incoming.set(id, [...(incoming.get(id) ?? []), edge]);
      outgoing.set(link.id, [...(outgoing.get(link.id) ?? []), edge]);
    }
  }

  const order: string[] = [];
  const indeg = new Map<string, number>();
  for (const a of activities) indeg.set(String(a.id), incoming.get(String(a.id))?.length ?? 0);
  const queue = activities.filter((a) => (indeg.get(String(a.id)) ?? 0) === 0).map((a) => String(a.id));
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const dep of outgoing.get(id) ?? []) {
      const n = (indeg.get(dep.successorId) ?? 1) - 1;
      indeg.set(dep.successorId, n);
      if (n === 0) queue.push(dep.successorId);
    }
  }
  for (const a of activities) {
    const id = String(a.id);
    if (!order.includes(id)) order.push(id);
  }

  const es = new Map<string, string>();
  const ef = new Map<string, string>();

  for (const id of order) {
    const task = byId.get(id)!;
    const dur = activityDuration(task);
    let start = toISO(task.start_date);
    for (const dep of incoming.get(id) ?? []) {
      const predEs = es.get(dep.predecessorId);
      const predEf = ef.get(dep.predecessorId);
      if (dep.type === "FS" && predEf) {
        const c = addDays(predEf, dep.lag_days ?? 0);
        if (!start || c > start) start = c;
      } else if (dep.type === "SS" && predEs) {
        const c = addDays(predEs, dep.lag_days ?? 0);
        if (!start || c > start) start = c;
      } else if (dep.type === "FF" && predEf) {
        const finishNeed = addDays(predEf, dep.lag_days ?? 0);
        const c = startFromFinish(finishNeed, dur);
        if (!start || c > start) start = c;
      } else if (dep.type === "SF" && predEs) {
        const finishNeed = addDays(predEs, dep.lag_days ?? 0);
        const c = startFromFinish(finishNeed, dur);
        if (!start || c > start) start = c;
      }
    }
    if (!start) start = toISO(task.start_date) ?? toISO(task.end_date);
    if (!start) continue;
    es.set(id, start);
    ef.set(id, finishFromStart(start, dur));
  }

  const projectFinish = maxDate([...ef.values(), ...activities.map((a) => toISO(a.end_date))]);
  const ls = new Map<string, string>();
  const lf = new Map<string, string>();

  for (const id of [...order].reverse()) {
    const task = byId.get(id)!;
    const dur = activityDuration(task);
    let finish = projectFinish;
    for (const dep of outgoing.get(id) ?? []) {
      const succLs = ls.get(dep.successorId);
      const succLf = lf.get(dep.successorId);
      if (dep.type === "FS" && succLs) {
        const c = addDays(succLs, -(dep.lag_days ?? 0));
        if (!finish || c < finish) finish = c;
      } else if (dep.type === "SS" && succLs) {
        const predStart = addDays(succLs, -(dep.lag_days ?? 0));
        const c = finishFromStart(predStart, dur);
        if (!finish || c < finish) finish = c;
      } else if (dep.type === "FF" && succLf) {
        const c = addDays(succLf, -(dep.lag_days ?? 0));
        if (!finish || c < finish) finish = c;
      } else if (dep.type === "SF" && succLf) {
        const predStart = addDays(succLf, -(dep.lag_days ?? 0));
        const c = finishFromStart(predStart, dur);
        if (!finish || c < finish) finish = c;
      }
    }
    if (!finish) finish = ef.get(id) ?? toISO(task.end_date) ?? toISO(task.start_date);
    if (!finish) continue;
    lf.set(id, finish);
    ls.set(id, startFromFinish(finish, dur));
  }

  for (const task of tasks) {
    if (!task?.id || isSummaryTask(task)) continue;
    const id = String(task.id);
    const earlyStart = es.get(id) ?? toISO(task.start_date);
    const earlyFinish = ef.get(id) ?? toISO(task.end_date);
    const lateStart = ls.get(id) ?? toISO(task.start_date);
    const lateFinish = lf.get(id) ?? toISO(task.end_date);
    const totalFloat =
      earlyStart && lateStart
        ? diffDays(earlyStart, lateStart)
        : earlyFinish && lateFinish
          ? diffDays(earlyFinish, lateFinish)
          : null;
    result.set(id, {
      earlyStart,
      earlyFinish,
      lateStart,
      lateFinish,
      totalFloat,
      critical: totalFloat !== null && totalFloat <= 0,
    });
  }

  const kids = new Map<string, Record<string, any>[]>();
  for (const t of tasks) {
    if (!t?.parent_task_id) continue;
    const pid = String(t.parent_task_id);
    kids.set(pid, [...(kids.get(pid) ?? []), t]);
  }

  const inherit = (id: string): CpmRow => {
    const existing = result.get(id);
    if (existing) return existing;
    const children = kids.get(id) ?? [];
    const childResults = children.filter((c) => c?.id).map((c) => inherit(String(c.id)));
    const floats = childResults.map((c) => c.totalFloat).filter((n): n is number => n !== null);
    const row: CpmRow = {
      earlyStart: minDate(childResults.map((c) => c.earlyStart)),
      earlyFinish: maxDate(childResults.map((c) => c.earlyFinish)),
      lateStart: minDate(childResults.map((c) => c.lateStart)),
      lateFinish: maxDate(childResults.map((c) => c.lateFinish)),
      totalFloat: floats.length ? Math.min(...floats) : null,
      critical: childResults.some((c) => c.critical),
    };
    result.set(id, row);
    return row;
  };

  for (const t of tasks) {
    if (t?.id && isSummaryTask(t)) inherit(String(t.id));
  }

  return result;
}
