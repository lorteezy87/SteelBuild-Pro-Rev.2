import type { ScheduleTask } from "./types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Enforce the schedule-window invariant at every UI mutation boundary.
 * A null date is a supported TBD state; two known dates must form a
 * non-negative window. The database still validates date syntax/types.
 */
export function assertScheduleDateRange(task: Pick<ScheduleTask, "start_date" | "end_date">): void {
  const start = task?.start_date;
  const end = task?.end_date;
  if (!start || !end) return;
  if (!DATE_ONLY.test(String(start)) || !DATE_ONLY.test(String(end))) return;
  if (String(end) < String(start)) {
    throw new Error("Finish date cannot be before the start date. Set a valid finish date or mark it TBD.");
  }
}
