/**
 * Pure row builders / date math for BulkAddTaskModal.
 */
import { addDaysIso } from "@/services/scheduleCascade";

export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

/** Add `days` calendar days to a YYYY-MM-DD string. Returns YYYY-MM-DD. */
export function addDays(dateStr: string | null | undefined, days: number): string | null {
  if (!dateStr || !Number.isFinite(days)) return null;
  return addDaysIso(dateStr, days);
}

/** Day-count between two YYYY-MM-DD strings. */
export function daysBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (isNaN(Number(s)) || isNaN(Number(e))) return null;
  return Math.round((Number(e) - Number(s)) / 86400000);
}

export function emptyBulkTaskRow(id: number) {
  return {
    _id: id,
    task_name: "",
    task_type: "Task",
    phase: "Fabrication",
    start_date: todayIso(),
    end_date: todayIso(),
    duration: 0,
    status: "Not Started",
    priority: "Normal",
    resource_names: "",
    parent_task_id: null as string | null,
  };
}
