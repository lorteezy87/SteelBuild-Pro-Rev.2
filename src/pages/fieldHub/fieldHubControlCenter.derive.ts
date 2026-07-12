/**
 * Pure derivations for the Field Hub Control Center (command_ui redesign).
 * No React, no network — takes raw entity arrays and returns KPI + panel data.
 *
 * Sources:
 *   daily_logs        → DailyLog entity      (headcount, hours_worked, safety_incidents, equipment_used, date, crew_name, superintendent)
 *   inspections       → Inspection entity     (status, inspection_date, deficiencies_count, inspection_type, location, inspector_name, sign_off_status)
 *   safety_incidents  → SafetyIncident entity (status, severity, incident_date, incident_type, location, reported_by, investigation_completed)
 *   punchlist_items   → PunchlistItem entity  (status, priority, category, location, assigned_to, target_completion_date)
 *
 * KPI "Equipment On-Site" is SUBSTITUTED — there is no dedicated equipment table.
 * We derive it from daily_logs.equipment_used (free-text) for today's logs:
 *   count logs from today that have a non-empty equipment_used string.
 *
 * Phase: none of the four field tables carries a `phase` column, so every
 * activity row's phase is resolved by src/lib/field/fieldPhase.js and tagged
 * with its provenance (`phaseSource`) so the UI can render a guess as a guess.
 */
import {
  resolveFieldPhase,
  indexTasksById,
  FIELD_ACTIVITY_TYPES,
} from "@/lib/field/fieldPhase";

/** Adapter: resolveFieldPhase returns `source`; the row field is `phaseSource`. */
function phaseFields(
  record: Record<string, unknown>,
  type: string,
  opts?: { tasksById?: Map<string, ScheduleTaskRef> },
): { phase: string | null; phaseSource: string } {
  const { phase, source } = resolveFieldPhase(record, type, opts);
  return { phase, phaseSource: source };
}

/** ISO date string yyyy-mm-dd matching local date today. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days between two ISO date strings (positive = future). */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// Record shapes — only the fields we actually touch
// ---------------------------------------------------------------------------

export interface DailyLogRecord {
  id?: string;
  date?: string | null;
  crew_name?: string | null;
  superintendent?: string | null;
  headcount?: number | null;
  hours_worked?: number | null;
  safety_incidents?: number | null;
  equipment_used?: string | null;
  status?: string | null;
  activities?: string | null;
  location?: string | null;
  [key: string]: unknown;
}

export interface InspectionRecord {
  id?: string;
  inspection_date?: string | null;
  inspection_type?: string | null;
  status?: string;
  sign_off_status?: string | null;
  inspector_name?: string | null;
  location?: string | null;
  deficiencies_count?: number | null;
  [key: string]: unknown;
}

export interface SafetyIncidentRecord {
  id?: string;
  incident_date?: string | null;
  incident_type?: string | null;
  severity?: string;
  status?: string;
  location?: string | null;
  reported_by?: string | null;
  description?: string | null;
  investigation_completed?: boolean | null;
  [key: string]: unknown;
}

export interface PunchlistItemRecord {
  id?: string;
  status?: string;
  priority?: string;
  category?: string | null;
  location?: string | null;
  assigned_to?: string | null;
  target_completion_date?: string | null;
  description?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Panel queue shapes
// ---------------------------------------------------------------------------

export interface FieldActivityRow {
  id: string;
  time: string;
  activity: string;
  type: string;
  location: string;
  priority: string;
  status: string;
  reportedBy: string;
  /** Lifecycle phase, or null when the record carries no phase evidence. */
  phase: string | null;
  /** "stored" | "linked" | "derived" — a derived phase must render as a guess. */
  phaseSource: string;
}

/** A schedule_tasks row, used to resolve a daily log's linked phase. */
export interface ScheduleTaskRef {
  id?: string;
  phase?: string | null;
}

export interface InspectionQueueRow {
  id: string;
  label: string;
  type: string;
  inspector: string;
  dueDate: string | null;
  daysUntilDue: number | null;
  status: string;
}

export interface SiteCoordRow {
  id: string;
  label: string;
  type: "safety" | "punchlist" | "inspection";
  priority: string;
  assignedTo: string;
  location: string;
  dueDate: string | null;
}

// ---------------------------------------------------------------------------
// Summary shape
// ---------------------------------------------------------------------------

export interface FieldHubSummary {
  /** Total headcount across all logs from today. */
  workforceToday: number;
  /** Punchlist items with status not in {"Closed","Complete","Completed"}. */
  openFieldIssues: number;
  /** Inspections with status "Scheduled" and inspection_date >= today. */
  inspectionsDue: number;
  /** Safety incidents with status not "Closed". */
  openSafetyObs: number;
  /**
   * SUBSTITUTED: count of today's daily logs with non-empty equipment_used.
   * (No dedicated equipment table exists.)
   */
  equipmentLogsToday: number;
  /** Total deficiencies across all open (non-Completed/Cancelled) inspections. */
  totalDeficiencies: number;
  /** Up to 6 punchlist items sorted by priority then due date for "Today in the Field" panel. */
  todayQueue: SiteCoordRow[];
  /** Up to 6 upcoming/overdue inspections for the "Open Issues" panel. */
  inspectionQueue: InspectionQueueRow[];
  /** Up to 6 open safety + overdue punchlist for the "Site Coordination" panel. */
  coordinationQueue: SiteCoordRow[];
  /** All items merged for the DataTable, newest first. */
  activityRows: FieldActivityRow[];
}

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Normal: 4 };
function priorityRank(p?: string | null): number {
  return PRIORITY_ORDER[p ?? ""] ?? 5;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildFieldHubSummary(
  logs: DailyLogRecord[],
  inspections: InspectionRecord[],
  incidents: SafetyIncidentRecord[],
  punchlistItems: PunchlistItemRecord[],
  /** schedule_tasks, used only to resolve a daily log's linked phase. */
  scheduleTasks: ScheduleTaskRef[] = [],
): FieldHubSummary {
  const today = todayLocal();
  const tasksById = indexTasksById(scheduleTasks);

  // ── KPI: Workforce Today ────────────────────────────────────────────────
  const todayLogs = logs.filter((l) => l.date === today);
  const workforceToday = todayLogs.reduce((sum, l) => sum + (Number(l.headcount) || 0), 0);

  // ── KPI: Equipment Logs Today (SUBSTITUTED) ─────────────────────────────
  const equipmentLogsToday = todayLogs.filter(
    (l) => l.equipment_used && l.equipment_used.trim().length > 0,
  ).length;

  // ── KPI: Open Field Issues (punchlist) ──────────────────────────────────
  const CLOSED_STATUSES = new Set(["Closed", "Complete", "Completed"]);
  const openPunch = punchlistItems.filter((p) => !CLOSED_STATUSES.has(p.status || ""));
  const openFieldIssues = openPunch.length;

  // ── KPI: Inspections Due ────────────────────────────────────────────────
  const inspectionsDue = inspections.filter((i) => {
    if (i.status !== "Scheduled") return false;
    if (!i.inspection_date) return true; // scheduled but undated → surface it
    return i.inspection_date >= today;
  }).length;

  // ── KPI: Open Safety Observations ───────────────────────────────────────
  const openSafetyObs = incidents.filter((i) => i.status !== "Closed").length;

  // ── KPI: Total Deficiencies ──────────────────────────────────────────────
  const DONE_INSPECTION = new Set(["Completed", "Cancelled"]);
  const totalDeficiencies = inspections
    .filter((i) => !DONE_INSPECTION.has(i.status || ""))
    .reduce((sum, i) => sum + (Number(i.deficiencies_count) || 0), 0);

  // ── Panel: Today in the Field (open punchlist by priority) ──────────────
  const todayQueue: SiteCoordRow[] = openPunch
    .slice()
    .sort((a, b) => {
      const pd = priorityRank(a.priority) - priorityRank(b.priority);
      if (pd !== 0) return pd;
      return (a.target_completion_date ?? "9999") < (b.target_completion_date ?? "9999") ? -1 : 1;
    })
    .slice(0, 6)
    .map((p) => ({
      id: p.id || "",
      label: p.description || p.category || "Punchlist item",
      type: "punchlist",
      priority: p.priority || "Normal",
      assignedTo: p.assigned_to || "—",
      location: p.location || "—",
      dueDate: p.target_completion_date || null,
    }));

  // ── Panel: Open Issues (inspection queue) ───────────────────────────────
  const ACTIVE_INSPECTION = new Set(["Scheduled", "In Progress"]);
  const upcomingInspections = inspections
    .filter((i) => ACTIVE_INSPECTION.has(i.status || ""))
    .slice()
    .sort((a, b) => {
      const da = a.inspection_date ?? "9999";
      const db = b.inspection_date ?? "9999";
      return da < db ? -1 : da > db ? 1 : 0;
    });

  const inspectionQueue: InspectionQueueRow[] = upcomingInspections.slice(0, 6).map((i) => ({
    id: i.id || "",
    label: i.inspection_type || "Inspection",
    type: i.inspection_type || "—",
    inspector: i.inspector_name || "—",
    dueDate: i.inspection_date || null,
    daysUntilDue: i.inspection_date ? daysBetween(today, i.inspection_date) : null,
    status: i.status || "Scheduled",
  }));

  // ── Panel: Site Coordination (open safety + overdue punchlist) ──────────
  const openIncidentRows: SiteCoordRow[] = incidents
    .filter((i) => i.status !== "Closed")
    .slice(0, 3)
    .map((i) => ({
      id: i.id || "",
      label: i.incident_type || i.description?.slice(0, 60) || "Safety incident",
      type: "safety",
      priority: i.severity || "Medium",
      assignedTo: i.reported_by || "—",
      location: i.location || "—",
      dueDate: i.incident_date || null,
    }));

  const overduePunch = openPunch.filter(
    (p) => p.target_completion_date && p.target_completion_date < today,
  );
  const overduePunchRows: SiteCoordRow[] = overduePunch.slice(0, 3).map((p) => ({
    id: p.id || "",
    label: p.description || p.category || "Overdue punchlist item",
    type: "punchlist",
    priority: p.priority || "Normal",
    assignedTo: p.assigned_to || "—",
    location: p.location || "—",
    dueDate: p.target_completion_date || null,
  }));

  const coordinationQueue = [...openIncidentRows, ...overduePunchRows].slice(0, 6);

  // ── DataTable: flat activity feed ───────────────────────────────────────
  const logRows: FieldActivityRow[] = logs.map((l) => ({
    id: l.id || Math.random().toString(36).slice(2),
    time: l.date || "—",
    activity: l.activities?.slice(0, 80) || `Daily log — ${l.crew_name || "crew"}`,
    type: FIELD_ACTIVITY_TYPES.DAILY_LOG,
    location: (l.location as string | null | undefined) || l.superintendent || "—",
    priority: "Normal",
    status: l.status || "Submitted",
    reportedBy: l.superintendent || l.crew_name || "—",
    ...phaseFields(l, FIELD_ACTIVITY_TYPES.DAILY_LOG, { tasksById }),
  }));

  const inspectionRows: FieldActivityRow[] = inspections.map((i) => ({
    id: i.id || Math.random().toString(36).slice(2),
    time: i.inspection_date || "—",
    activity: i.inspection_type || "Inspection",
    type: FIELD_ACTIVITY_TYPES.INSPECTION,
    location: i.location || "—",
    priority: i.deficiencies_count && i.deficiencies_count > 0 ? "High" : "Normal",
    status: i.status || "Scheduled",
    reportedBy: i.inspector_name || "—",
    ...phaseFields(i, FIELD_ACTIVITY_TYPES.INSPECTION),
  }));

  const incidentRows: FieldActivityRow[] = incidents.map((i) => ({
    id: i.id || Math.random().toString(36).slice(2),
    time: i.incident_date || "—",
    activity: i.incident_type || i.description?.slice(0, 60) || "Safety incident",
    type: FIELD_ACTIVITY_TYPES.SAFETY,
    location: i.location || "—",
    priority: i.severity || "Medium",
    status: i.status || "Open",
    reportedBy: i.reported_by || "—",
    ...phaseFields(i, FIELD_ACTIVITY_TYPES.SAFETY),
  }));

  const punchRows: FieldActivityRow[] = punchlistItems.map((p) => ({
    id: p.id || Math.random().toString(36).slice(2),
    time: p.target_completion_date || "—",
    activity: p.description || p.category || "Punchlist item",
    type: FIELD_ACTIVITY_TYPES.PUNCHLIST,
    location: p.location || "—",
    priority: p.priority || "Normal",
    status: p.status || "Open",
    reportedBy: p.assigned_to || "—",
    ...phaseFields(p, FIELD_ACTIVITY_TYPES.PUNCHLIST),
  }));

  // Sort all rows by date descending (newest first). Rows without a date sort to end.
  const allRows = [...logRows, ...inspectionRows, ...incidentRows, ...punchRows].sort((a, b) => {
    const ta = a.time === "—" ? "0000" : a.time;
    const tb = b.time === "—" ? "0000" : b.time;
    return ta > tb ? -1 : ta < tb ? 1 : 0;
  });

  return {
    workforceToday,
    openFieldIssues,
    inspectionsDue,
    openSafetyObs,
    equipmentLogsToday,
    totalDeficiencies,
    todayQueue,
    inspectionQueue,
    coordinationQueue,
    activityRows: allRows,
  };
}
