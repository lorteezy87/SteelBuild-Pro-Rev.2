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
  /** Overdue work, separate from today's plan. */
  recoveryQueue: ScheduleTaskRecord[];
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

const OPEN_PUNCH_STATUSES = new Set(["Open", "In Progress", "Pending", "New"]);
const CLOSED_PUNCH_STATUSES = new Set(["Closed", "Resolved", "Completed", "Complete"]);

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
function fmtTableDate(iso?: string | null): string {
  if (!iso) return "TBD";
  try {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "TBD";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "TBD";
  }
}

function isoPlusDays(iso: string, days: number): string {
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
  const lookaheadEnd = isoPlusDays(todayIso, 7);
  const upcomingCount = partition.upcoming.filter((task) => {
    const start = String(task.start_date || "").slice(0, 10);
    return start > todayIso && start <= lookaheadEnd;
  }).length;

  // openPunchItems: tasks where status is NOT in the closed set
  const openPunches = punchItems.filter(
    (p) => !CLOSED_PUNCH_STATUSES.has(p.status || "Open"),
  );

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
  const photoThumbnails: PhotoThumbnailRow[] = photosToday.slice(0, 6).map((p) => ({
    id: p.id || String(Math.random()),
    fileUrl: p.file_url || null,
    title: p.title || null,
    takenDate: p.taken_date || null,
  }));

  // Open punch rows — top 5 for the panel
  const openPunchRows: OpenPunchRow[] = openPunches.slice(0, 5).map((p) => ({
    id: p.id || String(Math.random()),
    title: p.title || "(untitled)",
    priority: p.priority || null,
    location: p.location || null,
    status: OPEN_PUNCH_STATUSES.has(p.status || "Open") ? (p.status || "Open") : (p.status || "Open"),
  }));

  // Full table rows — every task in todaysWork
  const tableRows: FieldTaskRow[] = todaysWork.map((task) => {
    const bucket = taskUrgency(task, todayIso) as UrgencyBucket;
    const pct = clampPercent(task.percent_complete);
    return {
      id: String(task.id || Math.random()),
      time: fmtTableDate(task.end_date),
      activity: taskLabel(task),
      type: String(task.task_type || task.type || "Task"),
      location: String(task.location || task.area || ""),
      status: pct >= 100 ? "Complete" : pct > 0 ? "In Progress" : "Not Started",
      urgencyBucket: bucket,
      nextAction: nextActionForTask(task, bucket),
      reportedBy: taskCrew(task),
      pct,
      phase: canonicalFieldPhase(
        task.phase || derivePhase({ task_name: taskLabel(task), phase: task.phase }),
      ),
      phaseSource: task.phase ? PHASE_SOURCE.STORED : PHASE_SOURCE.DERIVED,
      _task: task,
    };
  });

  return {
    kpis,
    planQueue,
    recoveryQueue,
    planningGapCount: partition.unscheduled.length,
    upcomingCount,
    todayProgressPct,
    photoThumbnails,
    tableRows,
    openPunchRows,
    syncTone: pendingSync > 0 ? "warn" : "neutral",
  };
}
