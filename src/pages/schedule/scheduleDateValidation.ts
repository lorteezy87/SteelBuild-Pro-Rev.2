import type { ScheduleTask } from "./types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Enforce the schedule-window invariant at every UI mutation boundary.
 * A null date is a supported TBD state; two known dates must form a
 * non-negative window. The database still validates date syntax/types.
 */
export function assertScheduleDateRange(
  task: Pick<ScheduleTask, "start_date" | "end_date"> & {
    actual_start_date?: string | null;
    actual_finish_date?: string | null;
  },
): void {
  assertOrderedPair(
    task?.start_date,
    task?.end_date,
    "Finish date cannot be before the start date. Set a valid finish date or mark it TBD.",
  );
  // Mirrors the schedule_tasks_actual_range_chk CHECK constraint. Without this
  // the DB rejects the row and the user gets a raw Postgres constraint name
  // instead of a sentence telling them which field to fix.
  assertOrderedPair(
    task?.actual_start_date,
    task?.actual_finish_date,
    "Actual finish cannot be before the actual start. Correct one of the two dates.",
  );
}

function assertOrderedPair(
  start: string | null | undefined,
  end: string | null | undefined,
  message: string,
): void {
  if (!start || !end) return;
  if (!DATE_ONLY.test(String(start)) || !DATE_ONLY.test(String(end))) return;
  if (String(end) < String(start)) throw new Error(message);
}
