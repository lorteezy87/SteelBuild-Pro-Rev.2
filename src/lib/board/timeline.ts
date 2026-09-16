/**
 * timeline — the touch Gantt lane's date↔pixel mapping.
 *
 * The lane is a horizontal strip below the canvas. It draws a bar per dated task
 * node, and turns three gestures into dates: drag a bar to move it, drag a bar's
 * edge to extend it, and pinch a bar to stretch its duration about its start.
 *
 * ## It does not re-derive duration
 *
 * Duration here means what it means everywhere else in this app: **inclusive
 * calendar days**, Mon→Fri is 5, a same-day task is 1. That rule and its
 * inverse already exist in `src/lib/schedule/duration.ts`, so this module calls
 * them. Re-deriving the arithmetic inline is how the rest of the codebase ended
 * up with three disagreeing conventions, and a lane that computed its own would
 * show a five-day task as a six-day bar next to the real schedule.
 *
 * ## Undated tasks have no bar
 *
 * A task with one date or none is *unscheduled*, not zero-length and not
 * starting today. {@link taskBar} returns null for it and the lane lists it in a
 * separate "not scheduled" tray. Defaulting a missing date to today would put a
 * bar on the timeline that nobody put there, and a foreman reading the lane
 * cannot tell that bar from one they placed.
 */

import { addDaysIso } from "@/services/scheduleCascade";
import { durationFromDates, finishFromDuration } from "@/lib/schedule/duration";
import { parseDateUTC, toDateOnly } from "@/components/schedule/scheduleDateUtils";
import type { BoardDoc, BoardTaskNode } from "./types";
import { isTaskNode } from "./types";

const MS_PER_DAY = 86_400_000;

/** Pixels-per-day limits: a full day must stay tappable, a year must still fit. */
export const MIN_PX_PER_DAY = 2;
export const MAX_PX_PER_DAY = 120;
export const DEFAULT_PX_PER_DAY = 24;

export interface TimelineScale {
  /** Date-only string at x = 0. */
  origin: string;
  pxPerDay: number;
}

/** Whole days from `origin` to `iso`, or null when either is unparseable. */
export function daysBetween(origin: string | null | undefined, iso: string | null | undefined): number | null {
  const a = parseDateUTC(origin);
  const b = parseDateUTC(iso);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function clampPxPerDay(pxPerDay: number): number {
  if (!Number.isFinite(pxPerDay) || pxPerDay <= 0) return DEFAULT_PX_PER_DAY;
  return Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, pxPerDay));
}

/** Lane x for a date. Null when the date is missing or unparseable. */
export function dateToX(scale: TimelineScale, iso: string | null | undefined): number | null {
  const days = daysBetween(scale.origin, iso);
  return days === null ? null : days * scale.pxPerDay;
}

/**
 * The date a lane x falls in.
 *
 * Floored, not rounded: x is a position *within* a day column, so the first
 * pixel and the last pixel of a column are both that day. Rounding would make
 * the right half of every bar report the following day, which is how a drag that
 * visually lands on Thursday saves as Friday.
 */
export function xToDate(scale: TimelineScale, x: number): string | null {
  if (!Number.isFinite(x)) return null;
  return addDaysIso(scale.origin, Math.floor(x / scale.pxPerDay));
}

export interface TaskBar {
  node_id: string;
  x: number;
  width: number;
  days: number;
  start_date: string;
  end_date: string;
}

/**
 * The bar for a dated task, or null when it is unscheduled or inverted.
 *
 * An inverted window (finish before start) is a broken row rather than a
 * negative-width bar — `durationFromDates` returns null for it and so does this.
 */
export function taskBar(scale: TimelineScale, task: BoardTaskNode): TaskBar | null {
  const { start_date: start, end_date: end } = task;
  if (!start || !end) return null;
  const days = durationFromDates(start, end);
  const x = dateToX(scale, start);
  if (days === null || x === null) return null;
  return {
    node_id: task.id,
    x,
    width: days * scale.pxPerDay,
    days,
    start_date: start,
    end_date: end,
  };
}

/** Dated task nodes, ordered by start date then title — the lane's row order. */
export function scheduledTasks(doc: BoardDoc): BoardTaskNode[] {
  return doc.nodes
    .filter(isTaskNode)
    .filter((t) => t.start_date && t.end_date && durationFromDates(t.start_date, t.end_date) !== null)
    .sort((a, b) => {
      const byDate = String(a.start_date).localeCompare(String(b.start_date));
      return byDate !== 0 ? byDate : a.text.localeCompare(b.text);
    });
}

/** Task nodes the lane cannot place: missing a date, or with an inverted window. */
export function unscheduledTasks(doc: BoardDoc): BoardTaskNode[] {
  return doc.nodes
    .filter(isTaskNode)
    .filter((t) => !t.start_date || !t.end_date || durationFromDates(t.start_date, t.end_date) === null);
}

export interface DatePair {
  start_date: string;
  end_date: string;
}

/**
 * Drag a whole bar: both dates shift by the same number of days, so the duration
 * is untouched. `dx` is in lane pixels; a drag shorter than half a day column
 * changes nothing rather than nudging the task by a day on every jitter.
 */
export function dragBar(scale: TimelineScale, task: BoardTaskNode, dx: number): DatePair | null {
  const days = durationFromDates(task.start_date, task.end_date);
  if (days === null || !task.start_date) return null;
  const shift = Math.round(dx / scale.pxPerDay);
  if (shift === 0) return null;
  const start = addDaysIso(task.start_date, shift);
  const end = finishFromDuration(start, days);
  if (!start || !end) return null;
  return { start_date: start, end_date: end };
}

/**
 * Drag a bar's right edge: the finish moves, the start stays, and the task never
 * goes below one day. Dragging the finish past the start clamps to a same-day
 * task rather than inverting the window — an inverted row is unrenderable
 * everywhere else in the app, so the gesture must not be able to create one.
 */
export function resizeBarEnd(scale: TimelineScale, task: BoardTaskNode, dx: number): DatePair | null {
  const days = durationFromDates(task.start_date, task.end_date);
  if (days === null || !task.start_date) return null;
  const delta = Math.round(dx / scale.pxPerDay);
  if (delta === 0) return null;
  const nextDays = Math.max(1, days + delta);
  if (nextDays === days) return null;
  const end = finishFromDuration(task.start_date, nextDays);
  if (!end) return null;
  return { start_date: task.start_date, end_date: end };
}

/**
 * Drag a bar's left edge: the start moves, the **finish stays put**.
 *
 * This is the gesture a PM uses to say "we can start earlier", and it must not
 * quietly drag the finish with it — that is what `dragBar` is for.
 */
export function resizeBarStart(scale: TimelineScale, task: BoardTaskNode, dx: number): DatePair | null {
  if (!task.end_date || durationFromDates(task.start_date, task.end_date) === null) return null;
  const delta = Math.round(dx / scale.pxPerDay);
  if (delta === 0) return null;
  const start = addDaysIso(task.start_date, delta);
  if (!start) return null;
  // Clamp at a same-day task rather than inverting, as above.
  const days = durationFromDates(start, task.end_date);
  if (days === null) return { start_date: task.end_date, end_date: task.end_date };
  return { start_date: start, end_date: task.end_date };
}

/**
 * Pinch a bar to stretch its duration about its start.
 *
 * The ratio of the finger spread scales the day count directly, so pinching a
 * 4-day bar to twice the spread makes it 8 days. Rounding happens once, on the
 * resulting day count — scaling the finish date instead would accumulate a
 * rounding error over a long pinch and leave the bar a day off where it looked.
 */
export function pinchBar(task: BoardTaskNode, prevDistance: number, nextDistance: number): DatePair | null {
  const days = durationFromDates(task.start_date, task.end_date);
  if (days === null || !task.start_date) return null;
  if (!(prevDistance > 0.5) || !(nextDistance > 0.5)) return null;
  const nextDays = Math.max(1, Math.round(days * (nextDistance / prevDistance)));
  if (nextDays === days) return null;
  const end = finishFromDuration(task.start_date, nextDays);
  if (!end) return null;
  return { start_date: task.start_date, end_date: end };
}

/**
 * Schedule a previously undated task from a lane drop.
 *
 * Defaults to a one-day task, which is the honest reading of a single tap: the
 * user has said *when*, not *how long*.
 */
export function scheduleAt(scale: TimelineScale, x: number, days = 1): DatePair | null {
  const start = xToDate(scale, x);
  const end = finishFromDuration(start, Math.max(1, days));
  if (!start || !end) return null;
  return { start_date: start, end_date: end };
}

export interface TimelineRange {
  start: string;
  end: string;
  days: number;
}

/**
 * The window every dated task fits in, padded by `padDays` on each side.
 * Null for a board with nothing scheduled — the lane shows its empty state then,
 * rather than an arbitrary window around today.
 */
export function timelineRange(doc: BoardDoc, padDays = 3): TimelineRange | null {
  const tasks = scheduledTasks(doc);
  if (tasks.length === 0) return null;
  let min: string | null = null;
  let max: string | null = null;
  for (const t of tasks) {
    if (t.start_date && (min === null || t.start_date < min)) min = t.start_date;
    if (t.end_date && (max === null || t.end_date > max)) max = t.end_date;
  }
  const start = addDaysIso(min, -padDays);
  const end = addDaysIso(max, padDays);
  const days = durationFromDates(start, end);
  if (!start || !end || days === null) return null;
  return { start, end, days };
}

export interface TimelineTick {
  iso: string;
  x: number;
  label: string;
  /** True on the 1st of a month — the lane draws those heavier. */
  monthStart: boolean;
}

/**
 * Tick marks across `width` pixels, at whatever day interval keeps them at least
 * `minSpacing` apart. Zoomed out, that means weekly or monthly gridlines instead
 * of 365 unreadable day ticks.
 */
export function timelineTicks(scale: TimelineScale, width: number, minSpacing = 56): TimelineTick[] {
  if (!(width > 0)) return [];
  const step = Math.max(1, Math.ceil(minSpacing / scale.pxPerDay));
  const ticks: TimelineTick[] = [];
  const count = Math.ceil(width / scale.pxPerDay);
  for (let day = 0; day <= count; day += step) {
    const iso = addDaysIso(scale.origin, day);
    if (!iso) break;
    const d = parseDateUTC(iso);
    if (!d) break;
    ticks.push({
      iso,
      x: day * scale.pxPerDay,
      // UTC getters, to match the UTC-midnight reading of a date-only string.
      // Local getters would label the 1st as the 31st west of Greenwich.
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      monthStart: d.getUTCDate() === 1,
    });
  }
  return ticks;
}

export interface SequenceViolation {
  edge_id: string;
  predecessor_id: string;
  successor_id: string;
  predecessor_finish: string;
  successor_start: string;
  /** Days of overlap. 0 means they meet on the same day, which is still a violation. */
  overlap_days: number;
}

/**
 * Finish-to-start violations along `precedes` connectors.
 *
 * A successor must start **after** its predecessor finishes — starting the same
 * day is an overlap, not a hand-off, because both dates are inclusive whole days.
 * Pairs where either task is undated are skipped: an unscheduled task is not a
 * violation, it is an unanswered question, and reporting it as a conflict would
 * bury the real ones.
 */
export function sequenceViolations(doc: BoardDoc): SequenceViolation[] {
  const byId = new Map(doc.nodes.filter(isTaskNode).map((t) => [t.id, t]));
  const out: SequenceViolation[] = [];
  for (const edge of doc.edges) {
    if (edge.kind !== "precedes") continue;
    const pred = byId.get(edge.from_node_id);
    const succ = byId.get(edge.to_node_id);
    if (!pred?.end_date || !succ?.start_date) continue;
    const gap = daysBetween(pred.end_date, succ.start_date);
    if (gap === null || gap >= 1) continue;
    out.push({
      edge_id: edge.id,
      predecessor_id: pred.id,
      successor_id: succ.id,
      predecessor_finish: pred.end_date,
      successor_start: succ.start_date,
      overlap_days: 1 - gap,
    });
  }
  return out;
}

/** Today as a date-only string in the **local** calendar. */
export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (
    toDateOnly(
      `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`,
    ) ?? ""
  );
}
