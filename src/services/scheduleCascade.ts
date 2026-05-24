// Module-scoped set of cycle keys that have already been warned about.
// Persists across calls to computeEffectiveDates so the same cycle
// doesn't spam the console on every cascade pass (Schedule page can
// trigger 3+ passes during initial load via React re-renders).
// Reset via __resetCycleWarnings() in tests.
const _WARNED_CYCLES = new Set<string>();

/**
 * scheduleCascade.ts
 *
 * Single source of truth for "where do these tasks actually sit on the
 * calendar once predecessor links are followed". Every schedule consumer
 * (Gantt bars, Task List view, 6-Week Lookahead, ICS export, dashboards)
 * reads stored `start_date` / `end_date` from `schedule_tasks` and asks
 * THIS module for the effective placement, so the cascade is computed
 * exactly once and looks the same everywhere.
 *
 * Pure-function on purpose: no React, no DB, no clock side-effects.
 * That keeps it testable in isolation (vitest) and reusable from
 * non-React paths like `lib/icsExport.js`.
 *
 * Predecessor link model — the upgraded `schedule_tasks.dependencies`
 * column (see migration 054) holds an array of link objects:
 *
 *   { id: "<predecessor task uuid>",
 *     type: "FS" | "SS" | "FF" | "SF",
 *     lag_days: <integer, may be negative for fast-tracking> }
 *
 * For backwards compatibility with rows that haven't been migrated yet
 * (e.g. mid-deploy, or a freshly imported MPP), `parseDependencies()`
 * also accepts the legacy `["uuid-a", "uuid-b"]` shape and silently
 * normalises each entry to `{ id, type:"FS", lag_days:1 }`. That default
 * mirrors the hardcoded FS+1 behaviour the old `effectiveDates` memo in
 * ScheduleGantt applied — so a row that's been written by the new UI
 * and a row that hasn't both behave the same.
 *
 * Cycle handling: if predecessor links form a directed cycle the
 * affected tasks fall back to their stored dates and `cycle: true` is
 * set on each task in the cycle. We log a single console.warn per cycle
 * so a user with the dev tools open sees it; the UI is free to surface
 * it with a toast or inline indicator.
 */

export interface DependencyLink {
  id: string;
  type: string;
  lag_days: number;
}

export interface EffectiveDate {
  start: string | null;
  end: string | null;
  shifted: boolean;
  shiftedBy: number;
  cycle: boolean;
}

type ScheduleTask = Record<string, any>;

// ── Link-type model ─────────────────────────────────────────────────────

export const LINK_TYPES = ["FS", "SS", "FF", "SF"];

const DAY_MS = 86400000;
const MIN_SANE_YEAR = 1900;
const MAX_SANE_YEAR = 2200;

/** Parse a YYYY-MM-DD or full ISO timestamp as UTC midnight. */
function parseDateUTC(s: any): Date | null {
  if (!s) return null;
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? null : s;
  const str = String(s).trim();
  if (!str) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < MIN_SANE_YEAR || y > MAX_SANE_YEAR) return null;
  // Normalise to UTC midnight so arithmetic is on whole days.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Normalise any date input to a YYYY-MM-DD string (or null). */
export function toDateOnly(s: any): string | null {
  const d = parseDateUTC(s);
  return d ? d.toISOString().slice(0, 10) : null;
}

function addDaysIso(iso: any, n: number): string | null {
  const d = parseDateUTC(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: any, b: any): number {
  const da = parseDateUTC(a);
  const db = parseDateUTC(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

// ── Dependency parsing / validation ─────────────────────────────────────

/**
 * Validate an integer lag (may be negative for fast-tracking). Anything
 * NaN, Infinity, or non-integer is coerced to the FS+1 default of 1 so a
 * single bad row can't crash the cascade for the whole project.
 */
function normaliseLag(raw: any, fallback = 1): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normaliseType(raw: any): string {
  const t = typeof raw === "string" ? raw.toUpperCase() : "FS";
  return LINK_TYPES.includes(t) ? t : "FS";
}

/**
 * Parse a `schedule_tasks.dependencies` value into an array of canonical
 * link objects: `{ id, type, lag_days }`. Accepts:
 *   - null / "" / "null" / "[]"            → []
 *   - already-an-array (object or string elements)
 *   - JSON-stringified array (the column type is TEXT)
 *
 * Legacy string elements (predecessor IDs only) are normalised to FS+1
 * so the new cascade renders identically to the old one for unmigrated
 * rows — preserves the regression-test bar.
 */
export function parseDependencies(raw: any): DependencyLink[] {
  let arr: any = raw;
  if (raw == null || raw === "" || raw === "null") return [];
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  const out: DependencyLink[] = [];
  for (const elem of arr) {
    if (!elem) continue;
    if (typeof elem === "string") {
      // Legacy shape — id-only, default to FS + 1 day.
      out.push({ id: elem, type: "FS", lag_days: 1 });
      continue;
    }
    if (typeof elem === "object" && elem.id) {
      out.push({
        id: String(elem.id),
        type: normaliseType(elem.type),
        lag_days: normaliseLag(elem.lag_days, 1),
      });
    }
    // anything else silently dropped — don't blow up the whole task
  }
  return out;
}

/**
 * Round-trip helper for writers (entity wrappers, TaskDetailDrawer).
 * Validates an array of link objects and returns the canonical JSON
 * string for storage. Throws on unrecognised link types so a programming
 * error surfaces loudly, but coerces non-integer lags to the FS+1 default
 * to match parseDependencies' tolerance on read.
 */
export function serializeDependencies(links: any): string | null {
  if (!Array.isArray(links) || links.length === 0) return null;
  const valid: DependencyLink[] = [];
  for (const link of links) {
    if (!link || !link.id) continue;
    const t = typeof link.type === "string" ? link.type.toUpperCase() : "FS";
    if (!LINK_TYPES.includes(t)) {
      throw new Error(
        `serializeDependencies: invalid link type '${link.type}' for predecessor ${link.id}`
      );
    }
    valid.push({
      id: String(link.id),
      type: t,
      lag_days: normaliseLag(link.lag_days, 1),
    });
  }
  return valid.length > 0 ? JSON.stringify(valid) : null;
}

// ── Effective-date cascade ──────────────────────────────────────────────

interface LinkResult {
  start: string;
  end: string;
  drove: boolean;
}

/**
 * Apply one predecessor link to a successor candidate window and return
 * `{ start, end, drove }` — `drove` is true iff the predecessor pulled
 * the successor away from its currently-best window.
 *
 * Semantics mirror typical scheduling tools:
 *   FS  successor.start  >= predecessor.end   + lag
 *   SS  successor.start  >= predecessor.start + lag
 *   FF  successor.end    >= predecessor.end   + lag
 *   SF  successor.end    >= predecessor.start + lag
 *
 * Duration is preserved on every shift.
 */
function applyLink(
  currentStart: string,
  currentEnd: string,
  dur: number,
  predResolved: { start: string | null; end: string | null },
  link: DependencyLink,
): LinkResult {
  const { type } = link;
  const lag = link.lag_days ?? 0;
  let candStart = currentStart;
  let candEnd = currentEnd;

  if (type === "FS") {
    const minStart = addDaysIso(predResolved.end, lag);
    if (minStart && minStart > candStart) {
      candStart = minStart;
      candEnd = addDaysIso(candStart, dur);
    }
  } else if (type === "SS") {
    const minStart = addDaysIso(predResolved.start, lag);
    if (minStart && minStart > candStart) {
      candStart = minStart;
      candEnd = addDaysIso(candStart, dur);
    }
  } else if (type === "FF") {
    const minEnd = addDaysIso(predResolved.end, lag);
    if (minEnd && minEnd > candEnd) {
      candEnd = minEnd;
      // pull start back to preserve duration
      candStart = addDaysIso(candEnd, -dur) || candStart;
    }
  } else if (type === "SF") {
    const minEnd = addDaysIso(predResolved.start, lag);
    if (minEnd && minEnd > candEnd) {
      candEnd = minEnd;
      candStart = addDaysIso(candEnd, -dur) || candStart;
    }
  }

  const drove = candStart !== currentStart || candEnd !== currentEnd;
  return { start: candStart, end: candEnd, drove };
}

/**
 * Compute the effective placement of every task once predecessor links
 * are followed. Stored task fields (`start_date`, `end_date`) are NOT
 * mutated — this is purely derived data for downstream consumers.
 *
 * Returns `Record<taskId, { start, end, shifted, shiftedBy, cycle }>`:
 *   - start / end       canonical YYYY-MM-DD strings (effective)
 *   - shifted           true iff effective ≠ stored start
 *   - shiftedBy         number of days the start moved forward (≥ 0)
 *   - cycle             true if a predecessor cycle was detected — the
 *                       cascade falls back to stored dates for this task
 *
 * The result is keyed by task.id only; tasks missing valid dates appear
 * in the map with whatever stored values were parseable, so callers can
 * treat the returned map as authoritative.
 *
 * Stable / deterministic — given the same input array (same task order)
 * the output is identical, so React `useMemo` consumers get cache hits.
 */
export function computeEffectiveDates(tasks: ScheduleTask[]): Record<string, EffectiveDate> {
  const out: Record<string, EffectiveDate> = {};
  if (!Array.isArray(tasks) || tasks.length === 0) return out;

  // Index tasks once. Cycles are detected by tracking the in-flight
  // resolution chain via the `visiting` set — if `resolve` is called
  // for a task already on the stack we mark every member of the cycle
  // and bail out without infinite-recursing.
  const taskById: Record<string, ScheduleTask> = Object.create(null);
  for (const t of tasks) {
    if (t && t.id) taskById[t.id] = t;
  }

  const cycleNodes = new Set<string>();

  function warnCycle(chain: string[]): void {
    const key = [...chain].sort().join("|");
    // Module-scoped dedupe (see _WARNED_CYCLES at the bottom of the
    // file). The previous per-call Set re-warned every time the
    // cascade ran, which on Schedule page load can be 3+ times,
    // spamming the console. A cycle is a data issue — one warning
    // per unique cycle per session is enough.
    if (_WARNED_CYCLES.has(key)) return;
    _WARNED_CYCLES.add(key);

    console.warn(
      `[scheduleCascade] Predecessor cycle detected, falling back to stored dates for: ${[...chain].join(" → ")}`
    );
  }

  function resolve(taskId: string, visiting: Set<string>): EffectiveDate | null {
    if (out[taskId]) return out[taskId];
    if (visiting.has(taskId)) {
      // H7 fix: only mark the actual cycle members, not ancestors that
      // merely led to its discovery. If visiting = [A, B, C] and we hit
      // B again, the cycle is B→C→B — A is not part of it.
      const chain = [...visiting];
      const cycleStart = chain.indexOf(taskId);
      const cycleMembers = cycleStart >= 0 ? chain.slice(cycleStart) : chain;
      warnCycle([...cycleMembers, taskId]);
      for (const id of cycleMembers) cycleNodes.add(id);
      cycleNodes.add(taskId);
      return null;
    }

    const task = taskById[taskId];
    if (!task) return null;

    visiting.add(taskId);

    const startOnly = toDateOnly(task.start_date);
    const endOnly = toDateOnly(task.end_date);

    if (!startOnly || !endOnly) {
      // Without dates we can't do anything but echo whatever's parseable.
      const fallback: EffectiveDate = {
        start: startOnly,
        end: endOnly,
        shifted: false,
        shiftedBy: 0,
        cycle: cycleNodes.has(taskId),
      };
      out[taskId] = fallback;
      visiting.delete(taskId);
      return fallback;
    }

    // Drop self-references — a task that lists itself would otherwise
    // trip cycle detection on its own first hop and stop the cascade.
    const links = parseDependencies(task.dependencies).filter(
      (l) => l.id && l.id !== taskId
    );

    const dur = Math.max(0, diffDays(startOnly, endOnly));
    let curStart = startOnly;
    let curEnd = endOnly;
    let shifted = false;

    for (const link of links) {
      const predResolved = resolve(link.id, visiting);
      if (!predResolved || !predResolved.start || !predResolved.end) continue;
      const next = applyLink(curStart, curEnd, dur, predResolved, link);
      if (next.drove) {
        curStart = next.start;
        curEnd = next.end;
        shifted = true;
      }
    }

    const shiftedBy = shifted ? Math.max(0, diffDays(startOnly, curStart)) : 0;
    const result: EffectiveDate = {
      start: curStart,
      end: curEnd,
      shifted,
      shiftedBy,
      cycle: cycleNodes.has(taskId),
    };
    out[taskId] = result;
    visiting.delete(taskId);
    return result;
  }

  for (const t of tasks) {
    if (t && t.id) resolve(t.id, new Set());
  }

  // Decorate cycle members AFTER everything resolves, in case a cycle
  // was discovered after the task itself was first cached.
  for (const id of cycleNodes) {
    if (out[id]) {
      out[id] = { ...out[id], cycle: true };
      // Cycle members fall back to stored dates so the bar still renders
      // somewhere useful; we already have those — re-derive from task.
      const t = taskById[id];
      if (t) {
        out[id].start = toDateOnly(t.start_date);
        out[id].end = toDateOnly(t.end_date);
        out[id].shifted = false;
        out[id].shiftedBy = 0;
      }
    }
  }

  return out;
}

/**
 * Test-only: reset the module-scoped cycle-warning dedupe set so a
 * test can re-trigger the warning path without leaking state from a
 * prior test.
 */
export function __resetCycleWarnings(): void {
  _WARNED_CYCLES.clear();
}

/**
 * Convenience: return the same array of tasks, with each task's
 * `start_date` and `end_date` overlaid by their effective values, plus
 * `_stored_start_date` / `_stored_end_date` preserving the originals
 * for any consumer that still wants the stored value.
 *
 * The returned objects are SHALLOW COPIES — passing them through to
 * React renderers is safe; mutations on the wrappers don't leak back to
 * the originals or to the database.
 */
export function applyEffectiveDates(
  tasks: ScheduleTask[],
  effective: Record<string, EffectiveDate> | null = null,
): ScheduleTask[] {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];
  const eff = effective || computeEffectiveDates(tasks);
  return tasks.map((t) => {
    if (!t || !t.id) return t;
    const e = eff[t.id];
    if (!e || !e.start || !e.end) return t;
    return {
      ...t,
      _stored_start_date: t.start_date,
      _stored_end_date: t.end_date,
      start_date: e.start,
      end_date: e.end,
      _shifted: !!e.shifted,
      _shifted_by: e.shiftedBy || 0,
      _cycle: !!e.cycle,
    };
  });
}
