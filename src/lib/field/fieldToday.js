/**
 * fieldToday.js — pure helpers for the Field Today capture surface.
 *
 * The page is a thumb-first capture lane for a superintendent/foreman on a
 * phone: see the work that matters *today* and update progress in one tap.
 * All the date/percent/selection logic lives here as pure functions so it is
 * deterministic and unit-testable (callers pass `todayIso` explicitly — these
 * helpers never read the clock).
 *
 * Progress→status mapping mirrors the canonical rule in Schedule.tsx
 * (`pct >= 100 ? "Complete" : pct > 0 ? "In Progress" : "Not Started"`) so a
 * task edited from the field reconciles with the schedule board exactly.
 */

import { isSummaryTask, buildParentIdSet } from "@/lib/schedule/summaryTasks";

/** Quick-set progress buttons offered on each task card. */
export const PROGRESS_STEPS = [0, 25, 50, 75, 100];

/** Coerce to an integer percent in [0, 100]. */
export function clampPercent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Canonical schedule status for a completion percentage. Mirrors
 * Schedule.tsx so field edits and the Gantt agree.
 */
export function statusForPercent(pct) {
  const p = clampPercent(pct);
  if (p >= 100) return "Complete";
  if (p > 0) return "In Progress";
  return "Not Started";
}

/** The `ScheduleTask.update` patch for a progress change (percent + derived status). */
export function progressPatch(pct) {
  const percent_complete = clampPercent(pct);
  return { percent_complete, status: statusForPercent(percent_complete) };
}

/** Human-readable task label, tolerant of column drift. */
export function taskLabel(task) {
  return (
    String(task?.task_name || task?.name || task?.title || task?.activity || "").trim() ||
    "(untitled task)"
  );
}

/** Assigned crew/resource for a task ("" when none). */
export function taskCrew(task) {
  return String(task?.resource_names || task?.assigned_to || "").trim();
}

/** Add `days` to an ISO date (YYYY-MM-DD) — deterministic from its input. */
function addDaysIso(iso, days) {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Bucket a task by how urgent it is *relative to todayIso*:
 *   done        — 100% / Complete (excluded from the list)
 *   overdue     — end date is in the past, not done
 *   due-today   — end date is today, not done
 *   active      — in its window (or started, open end), underway
 *   unscheduled — no start AND no end (TBD) — kept visible per the schedule
 *                 contract: never hide real work just because dates are missing
 *   upcoming    — starts in the future
 */
export function taskUrgency(task, todayIso) {
  const pct = clampPercent(task?.percent_complete);
  if (pct >= 100 || task?.status === "Complete") return "done";

  const start = String(task?.start_date || "").slice(0, 10);
  const end = String(task?.end_date || "").slice(0, 10);

  if (end && end < todayIso) return "overdue";
  if (end && end === todayIso) return "due-today";
  if (!start && !end) return "unscheduled";
  if (start && start > todayIso) return "upcoming";
  // start <= today (or absent) and end absent/future → underway now
  return "active";
}

const URGENCY_RANK = {
  overdue: 0,
  "due-today": 1,
  active: 2,
  unscheduled: 3,
  upcoming: 4,
  done: 5,
};

function compareTasks(a, b, todayIso) {
  const ra = URGENCY_RANK[taskUrgency(a, todayIso)] ?? 9;
  const rb = URGENCY_RANK[taskUrgency(b, todayIso)] ?? 9;
  if (ra !== rb) return ra - rb;

  // Within a bucket, soonest end date first (dated before undated).
  const ea = String(a?.end_date || "").slice(0, 10);
  const eb = String(b?.end_date || "").slice(0, 10);
  if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;

  return taskLabel(a).localeCompare(taskLabel(b));
}

/**
 * The tasks a foreman should act on today: anything overdue, due today, or
 * underway, plus unscheduled (TBD) work, plus upcoming work that starts within
 * `horizonDays`. Completed tasks and far-future work are dropped. Sorted most
 * urgent first.
 */
export function tasksForToday(tasks, todayIso, { horizonDays = 7 } = {}) {
  const horizonIso = addDaysIso(todayIso, horizonDays);
  // Drop summary/parent rows: a foreman acts on leaf work items, not rolled-up
  // parents. A summary's dates only span its children, so it would otherwise
  // show up as "overdue"/"active" noise duplicating the child rows.
  const parentIds = buildParentIdSet(Array.isArray(tasks) ? tasks : []);
  const live = (Array.isArray(tasks) ? tasks : []).filter(
    (t) => t && !t.is_deleted && !isSummaryTask(t, parentIds),
  );

  const relevant = live.filter((t) => {
    const u = taskUrgency(t, todayIso);
    if (u === "done") return false;
    if (u === "upcoming") {
      const start = String(t.start_date || "").slice(0, 10);
      return !!start && start <= horizonIso;
    }
    return true; // overdue, due-today, active, unscheduled
  });

  return relevant.sort((a, b) => compareTasks(a, b, todayIso));
}
