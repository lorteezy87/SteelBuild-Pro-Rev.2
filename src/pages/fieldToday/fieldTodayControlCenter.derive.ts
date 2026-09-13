/**
 * Pure derivations for the Field Today Control Center (canonical presentation redesign).
 * No React, no network. All inputs are real data shapes from the existing
 * hooks and entities — no fabricated fields.
 *
 * Real data sources (mapped from FieldToday.jsx + fieldToday.js helpers):
 *   tasks      — ScheduleTask[] from useScheduleTasks
 *   photos     — Photo[] (today's, passed in from the parent query)
 *   punchItems — PunchlistItem[] (open, passed in from the parent query)
 *   todayIso   — localToday() string
 *   pendingSync — number from useFieldOutbox
 */

import {
  clampPercent,
  partitionFieldTasks,
  taskUrgency,
  taskLabel,
  taskCrew,
} from "@/lib/field/fieldToday";
import { canonicalFieldPhase, PHASE_SOURCE } from "@/lib/field/fieldPhase";
import { derivePhase } from "@/utils/phases";
import { isPunchlistOpen } from "@/lib/entityPredicates";

// ── Type shapes (real DB column names) ────────────────────────────────────────

export interface ScheduleTaskRecord {
  id?: string;
  task_name?: string | null;
  name?: string | null;
  title?: string | null;
  activity?: string | null;
  status?: string | null;
  percent_complete?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  resource_names?: string | null;
  assigned_to?: string | null;
  is_deleted?: boolean | null;
  /** Real column on schedule_tasks — the lifecycle phase of this activity. */
  phase?: string | null;
  [key: string]: unknown;
}

export interface PhotoRecord {
  id?: string;
  project_id?: string | null;
  taken_date?: string | null;
  category?: string | null;
  title?: string | null;
  file_url?: string | null;
  [key: string]: unknown;
}

export interface PunchlistItemRecord {
  id?: string;
  project_id?: string | null;
  status?: string | null;
  priority?: string | null;
  title?: string | null;
  location?: string | null;
  description?: string | null;
  [key: string]: unknown;
}

// ── Urgency display mapping (mirrors FieldToday.jsx URGENCY object) ──────────

export type UrgencyBucket = "overdue" | "due-today" | "active" | "unscheduled" | "upcoming";

export interface UrgencyDisplay {
  label: string;
  /** CSS color value to pass as inline style — uses design-token var() strings */
  color: string;
}

export const URGENCY_DISPLAY: Record<UrgencyBucket, UrgencyDisplay> = {
  overdue:      { label: "OVERDUE",    color: "var(--status-error)" },
  "due-today":  { label: "DUE TODAY",  color: "var(--status-warning)" },
  active:       { label: "ACTIVE",     color: "var(--accent)" },
  unscheduled:  { label: "TBD",        color: "var(--text-muted)" },
  upcoming:     { label: "UPCOMING",   color: "var(--status-info)" },
};

// ── Output shapes ─────────────────────────────────────────────────────────────

export interface FieldKpiSummary {
  /** Due-today and active-window leaf work only. */
  todaysTasks: number;
  /** Overdue leaf work, surfaced separately from today's plan. */
  recoveryTasks: number;
  /** Unavailable until schedule tasks record a completion timestamp. */
  completedToday: null;
  /** Open punchlist items (real: PunchlistItem.status != "Closed"/"Resolved") */
  openPunchItems: number;
  /** Photos taken today (real: Photo.taken_date = todayIso) */
  photosToday: number;
}

export interface TaskSection {
  bucket: UrgencyBucket;
  tasks: ScheduleTaskRecord[];
  display: UrgencyDisplay;
}

/** Prep row shape for the DataTable — one row per task in todaysWork */
export interface FieldTaskRow {
  id: string;
  time: string;
  activity: string;
  type: string;
  location: string;
  status: string;
  /** urgency bucket — drives the status pill tone */
  urgencyBucket: UrgencyBucket;
  nextAction: string;
  reportedBy: string;
  /** raw percent for the table cell */
  pct: number;
  /**
   * Lifecycle phase. Unlike the field registers, schedule_tasks has a real
   * `phase` column, so this is usually "stored" rather than inferred.
   */
  phase: string | null;
  /** "stored" when the column is set, "derived" when inferred from the name. */
  phaseSource: string;
  _task: ScheduleTaskRecord;
}

export interface FieldRecoveryRow {
  id: string;
  activity: string;
  location: string;
  dueDate: string;
  _task: ScheduleTaskRecord;
}

export interface OpenPunchRow {
  id: string;
  title: string;
  priority: string | null;
  location: string | null;
  status: string;
}

export interface PhotoThumbnailRow {
  id: string;
  fileUrl: string | null;
  title: string | null;
  takenDate: string | null;
}

export interface FieldTodaySummary {
  kpis: FieldKpiSummary;
  /** Used for Today's Plan panel (top 6 by urgency rank) */
  planQueue: ScheduleTaskRecord[];
  /** Presentation rows for Today's Plan, in the same order as planQueue. */
  planRows: FieldTaskRow[];
  /** Overdue work, separate from today's plan. */
  recoveryQueue: ScheduleTaskRecord[];
  /** Presentation rows for the complete recovery backlog. */
  recoveryRows: FieldRecoveryRow[];
  /** Work missing the start date needed for trustworthy planning. */
  planningGapCount: number;
  /** Future work beginning within seven days. */
  upcomingCount: number;
  /** Average progress of the tasks in today's plan. */
  todayProgressPct: number;
  /** Used for Daily Photos panel (today's photos, up to 6) */
  photoThumbnails: PhotoThumbnailRow[];
  /** Full task list for the DataTable */
  tableRows: FieldTaskRow[];
  /** Open punch items for the Crew Status panel */
  openPunchRows: OpenPunchRow[];
  /** Tone for the offline sync status (warn when pendingSync > 0) */
  syncTone: "warn" | "neutral";
}

// ── Pure derivation ───────────────────────────────────────────────────────────

/** Derives the "next action" label for a task row — deterministic. */
function nextActionForTask(task: ScheduleTaskRecord, bucket: UrgencyBucket): string {
  const pct = clampPercent(task.percent_complete);
  if (pct === 0 && bucket === "overdue") return "Start immediately";
  if (pct === 0) return "Start task";
  if (pct < 100 && bucket === "overdue") return "Update progress — past due";
  if (pct < 100) return "Update progress";
  return "Mark complete";
}

/** Formats an ISO date as short date (Jun 28) for the time column. Returns "TBD" when absent. */
export function formatFieldDay(iso?: string | null): string {
  if (!iso) return "TBD";
  const day = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "TBD";
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== date
  ) return "TBD";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function isoDatePlusDays(iso: string, days: number): string {
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function deriveFieldTaskPhase(
  task: ScheduleTaskRecord,
): Pick<FieldTaskRow, "phase" | "phaseSource"> {
  const storedPhase = task.phase || null;
  return {
    phase: canonicalFieldPhase(
      storedPhase || derivePhase({ task_name: taskLabel(task), phase: storedPhase }),
    ),
    phaseSource: storedPhase ? PHASE_SOURCE.STORED : PHASE_SOURCE.DERIVED,
  };
}

export function deriveFieldTaskRows(
  tasks: ScheduleTaskRecord[],
  todayIso: string,
): FieldTaskRow[] {
  return tasks.map((task, index) => {
    const bucket = taskUrgency(task, todayIso) as UrgencyBucket;
    const pct = clampPercent(task.percent_complete);
    return {
      id: task.id ? String(task.id) : `task-${index}`,
      time: formatFieldDay(task.end_date),
      activity: taskLabel(task),
      type: String(task.task_type || task.type || "Task"),
      location: String(task.location || task.area || ""),
      status: pct >= 100 ? "Complete" : pct > 0 ? "In Progress" : "Not Started",
      urgencyBucket: bucket,
      nextAction: nextActionForTask(task, bucket),
      reportedBy: taskCrew(task),
      pct,
      ...deriveFieldTaskPhase(task),
      _task: task,
    };
  });
}

export function filterFieldTaskRows(
  rows: FieldTaskRow[],
  search: string,
  statusFilter: string,
): FieldTaskRow[] {
  const statusRows =
    statusFilter && statusFilter !== "all"
      ? rows.filter((row) => row.urgencyBucket === statusFilter)
      : rows;
  const query = search.trim().toLowerCase();
  if (!query) return statusRows;
  return statusRows.filter(
    (row) =>
      row.activity.toLowerCase().includes(query) ||
      row.type.toLowerCase().includes(query) ||
      row.location.toLowerCase().includes(query) ||
      row.reportedBy.toLowerCase().includes(query),
  );
}

/**
 * Derive all KPIs, queues, and table rows for the Field Today Control Center.
 * Pure function — safe to call in useMemo; never reads the clock directly
 * (callers pass `todayIso`).
 */
export function buildFieldTodaySummary(
  allTasks: ScheduleTaskRecord[],
  photos: PhotoRecord[],
  punchItems: PunchlistItemRecord[],
  todayIso: string,
  pendingSync: number,
): FieldTodaySummary {
  const partition = partitionFieldTasks(allTasks, todayIso);
  const todaysWork = partition.today;
  const lookaheadEnd = isoDatePlusDays(todayIso, 7);
  const upcomingCount = partition.upcoming.filter((task) => {
    const start = String(task.start_date || "").slice(0, 10);
    return start > todayIso && start <= lookaheadEnd;
  }).length;

  // openPunchItems: punch items whose status is not terminal — the same
  // PUNCHLIST_CLOSED_STATUSES predicate every other punchlist KPI uses.
  const openPunches = punchItems.filter(isPunchlistOpen);

  // Photos taken today (real field: Photo.taken_date)
  const photosToday = photos.filter((p) => p.taken_date === todayIso);

  const kpis: FieldKpiSummary = {
    todaysTasks: todaysWork.length,
    recoveryTasks: partition.recovery.length,
    completedToday: null,
    openPunchItems: openPunches.length,
    photosToday: photosToday.length,
  };

  // Plan queue — top 6 by urgency (already sorted)
  const planQueue = todaysWork.slice(0, 6);
  // Recovery is the only place overdue work is rendered on Field Today. Keep
  // the queue complete so the headline count can never exceed visible rows.
  const recoveryQueue = partition.recovery;

  const todayProgressPct =
    todaysWork.length > 0
      ? Math.round(
          todaysWork.reduce(
            (sum, task) => sum + clampPercent(task.percent_complete),
            0,
          ) / todaysWork.length,
        )
      : 0;

  // Daily Photos panel — up to 6 thumbnails from today
  const photoThumbnails: PhotoThumbnailRow[] = photosToday.slice(0, 6).map((p, index) => ({
    id: p.id || `photo-${index}`,
    fileUrl: p.file_url || null,
    title: p.title || null,
    takenDate: p.taken_date || null,
  }));

  // Open punch rows — top 5 for the panel
  const openPunchRows: OpenPunchRow[] = openPunches.slice(0, 5).map((p, index) => ({
    id: p.id || `punch-${index}`,
    title: p.title || "(untitled)",
    priority: p.priority || null,
    location: p.location || null,
    status: p.status || "Open",
  }));

  // Full table rows — every task in todaysWork
  const tableRows = deriveFieldTaskRows(todaysWork, todayIso);
  const planRows = tableRows.slice(0, 6);
  const recoveryRows: FieldRecoveryRow[] = recoveryQueue.map((task, index) => ({
    id: task.id ? String(task.id) : `recovery-${index}`,
    activity: taskLabel(task),
    location: String(task.location || task.area || "Location not provided"),
    dueDate: String(task.end_date || "Due date unavailable"),
    _task: task,
  }));

  return {
    kpis,
    planQueue,
    planRows,
    recoveryQueue,
    recoveryRows,
    planningGapCount: partition.unscheduled.length,
    upcomingCount,
    todayProgressPct,
    photoThumbnails,
    tableRows,
    openPunchRows,
    syncTone: pendingSync > 0 ? "warn" : "neutral",
  };
}
