/**
 * mappers.ts — pure row → planner-model adapters.
 *
 * Kept separate from the data hooks so they can be unit-tested without mocking
 * Supabase. They tolerate the loose shapes the entity layer returns (free-text
 * priority, string/numeric hours, 'HH:MM:SS' times).
 */

import type { PlannerTask, PlannerPriority, PlannerMeeting } from "./autoSchedule";

const PRIORITIES: PlannerPriority[] = ["Critical", "High", "Medium", "Low"];

function normalizePriority(value: unknown): PlannerPriority {
  const s = String(value ?? "").trim().toLowerCase();
  const match = PRIORITIES.find((p) => p.toLowerCase() === s);
  return match ?? "Medium";
}

function toEpoch(value: unknown): number {
  if (typeof value === "number") return value;
  const t = value ? Date.parse(String(value)) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function toHours(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Loose shape of an action_items row as the planner consumes it. */
export type ActionItemRow = {
  id: string;
  project_id?: string | null;
  title?: string | null;
  priority?: string | null;
  estimated_hours?: number | string | null;
  due_date?: string | null;
  status?: string | null;
  created_at?: string | number | null;
};

export function mapRowToPlannerTask(row: ActionItemRow): PlannerTask {
  return {
    id: row.id,
    projectId: row.project_id ?? "",
    title: row.title ?? "Untitled task",
    priority: normalizePriority(row.priority),
    estimatedHours: toHours(row.estimated_hours),
    deadline: row.due_date ?? null,
    status: row.status ?? "",
    createdAt: toEpoch(row.created_at),
  };
}

/** 'HH:MM:SS' / 'HH:MM' → integer hour, or null if unparseable. */
export function parseHour(time: unknown): number | null {
  if (time == null) return null;
  const m = /^(\d{1,2})(?::\d{2})?/.exec(String(time).trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

/** Loose shape of a meetings row. */
export type MeetingRow = {
  id: string;
  meeting_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  title?: string | null;
};

/** Returns null when the meeting has no usable time block (planner ignores it). */
export function mapRowToPlannerMeeting(row: MeetingRow): PlannerMeeting | null {
  const startHour = parseHour(row.start_time);
  const endHour = parseHour(row.end_time);
  if (row.meeting_date == null || startHour == null || endHour == null) return null;
  if (endHour <= startHour) return null;
  return {
    id: row.id,
    date: row.meeting_date,
    startHour,
    endHour,
    title: row.title ?? "Meeting",
  };
}
