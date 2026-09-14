/**
 * duration — one definition of "how long is this task", for the whole module.
 *
 * Audit §2.4. There were three conventions in play and they disagreed about the
 * same row:
 *
 *   | source                                  | Mon → Fri | same-day |
 *   |-----------------------------------------|-----------|----------|
 *   | calcDuration (Gantt, Task List)         | "4d"      | "0d"     |
 *   | calculateTaskDuration (task drawer)     | 4         | 1        |
 *   | the stored `duration` column            | whatever was imported |
 *
 * 199 of 338 dated rows in production carried a `duration` that matched neither
 * of their own dates. Bulk Duration read the stale column and then rewrote
 * `end_date` from it, so a bulk edit could move a finish date using a number the
 * UI had never shown the user.
 *
 * ## The convention
 *
 * **Inclusive calendar days.** Mon → Fri is 5. A same-day task is 1. This is
 * what P6 and MS Project mean by duration, so a schedule exported to a GC or
 * imported from one lines up, and it is what a PM means by "a five-day pour".
 *
 * It is also what this project's own data already mostly says: of the 338 dated
 * rows, 139 matched inclusive and only 76 matched exclusive.
 *
 * ## The source of truth
 *
 * **The dates are the truth; `duration` mirrors them.** When both dates are
 * present the duration is derived and the stored column is ignored on read. The
 * column is kept (importers and the MPP/CSV path still write it, and it is the
 * only signal a row has when a date is missing) and a database trigger keeps it
 * in sync on write — see 20260908160000_schedule_duration_single_source.sql.
 *
 * Working days are deliberately NOT part of this. A working-day calendar is its
 * own concern (§2.1/§7.4) and belongs to a per-project calendar; conflating the
 * two here would make "duration" mean different things on projects with
 * different shift patterns, which is exactly the ambiguity this module removes.
 */

import { parseDateUTC } from "@/components/schedule/scheduleDateUtils";
import { addDaysIso } from "@/services/scheduleCascade";

const MS_PER_DAY = 86_400_000;

export interface DurationTaskLike {
  start_date?: string | null;
  end_date?: string | null;
  duration?: number | string | null;
}

/**
 * Inclusive day count between two dates. Mon → Fri = 5, Mon → Mon = 1.
 *
 * Returns null when either date is missing or unparseable, and when the finish
 * precedes the start — an inverted window is not a negative duration, it is a
 * broken row (2 exist in production, pre-validator). Callers must render null
 * as unknown rather than as 0, which would read as "no work".
 */
export function durationFromDates(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const s = parseDateUTC(start);
  const e = parseDateUTC(end);
  if (!s || !e) return null;
  const days = Math.round((e.getTime() - s.getTime()) / MS_PER_DAY);
  if (days < 0) return null;
  return days + 1;
}

/**
 * The inverse: the finish date for a start plus an inclusive duration.
 *
 * `start + (days - 1)`, because day 1 IS the start date. Getting this wrong by
 * one is how a 5-day task silently becomes 6 on every bulk edit.
 */
export function finishFromDuration(
  start: string | null | undefined,
  days: number | string | null | undefined,
): string | null {
  const n = Number.parseInt(String(days ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return addDaysIso(start, n - 1);
}

/**
 * A task's effective duration in inclusive days.
 *
 * Dates win when both are present. The stored column is the fallback for a row
 * that has not been given a full window yet — that is the only case where it
 * carries information the dates do not.
 */
export function taskDurationDays(task: DurationTaskLike | null | undefined): number | null {
  if (!task) return null;
  const derived = durationFromDates(task.start_date, task.end_date);
  if (derived !== null) return derived;
  const stored = Number.parseInt(String(task.duration ?? ""), 10);
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

/**
 * Display string for a duration cell: "5d", or "TBD" when unknown.
 *
 * TBD rather than "0d" on purpose — absence is not evidence, and a task with no
 * finish date has an unknown duration, not a zero-length one.
 */
export function formatDuration(task: DurationTaskLike | null | undefined): string {
  const days = taskDurationDays(task);
  return days === null ? "TBD" : `${days}d`;
}

/**
 * True when the stored column disagrees with the dates and would therefore
 * mislead anything that reads it directly.
 *
 * Used by the sync check; not used for display, which always derives.
 */
export function durationIsStale(task: DurationTaskLike | null | undefined): boolean {
  const derived = durationFromDates(task?.start_date, task?.end_date);
  if (derived === null) return false; // nothing to disagree with
  const stored = Number.parseInt(String(task?.duration ?? ""), 10);
  if (!Number.isFinite(stored)) return true; // null column on a fully dated row
  return stored !== derived;
}
