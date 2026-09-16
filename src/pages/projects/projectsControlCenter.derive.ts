/**
 * Pure derivations for the Projects Control Center (canonical presentation redesign).
 * No React, no network. All KPI aggregations reuse the canonical helpers in
 * src/utils/projectKpis.js so the command view computes identically to the
 * classic Projects page.
 */
import {
  calcWpProgress,
  calcDaysToDeadline,
  calcRfiHealth,
} from "@/utils/projectKpis";
import { buildOperationalHealthIndex } from "@/lib/projectHealth";
import type { OperationalHealthResult } from "@/lib/projectHealth";
import { localToday } from "@/utils/dates";

// ──────────────────────────────────────────────────────────────────
// Types (mirror what Projects.jsx actually reads from the DB row)
// ──────────────────────────────────────────────────────────────────
export interface ProjectRecord {
  id: string;
  name: string;
  project_number?: string | null;
  phase: string;
  health_status: string;
  status?: string | null;                   // MISSING from supabase Row — not in schema; use health_status
  original_contract_value?: number | null;
  scope_complete_pct_override?: number | null;
  target_completion_date?: string | null;
  general_contractor?: string | null;
  client?: string | null;
  on_hold?: boolean;
  on_hold_reason?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  is_deleted?: boolean;
  [key: string]: unknown;
}

export interface WorkPackageRecord {
  id?: string;
  project_id?: string | null;
  status?: string | null;
  tonnage?: number | null;
  shop_hours_budget?: number | null;
  shop_hours_actual?: number | null;
  [key: string]: unknown;
}

export interface RfiRecord {
  id?: string;
  project_id?: string | null;
  status?: string | null;
  date_required?: string | null;
  [key: string]: unknown;
}

export interface ChangeOrderRecord {
  id?: string;
  project_id?: string | null;
  status?: string | null;
  co_amount?: number | null;
  [key: string]: unknown;
}

export interface ScheduleTaskRecord {
  id?: string;
  project_id?: string | null;
  [key: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────
// KPI summary (portfolio-level, active projects only — no on-hold)
// ──────────────────────────────────────────────────────────────────
export interface ProjectsKpiSummary {
  totalProjects: number;
  activeProjects: number;
  atRisk: number;
  onHold: number;
  totalContractValue: number;
  avgPctComplete: number;
  openRfis: number;
  overdueRfis: number;
  pendingCOValue: number;
  pendingCOCount: number;
}

// ──────────────────────────────────────────────────────────────────
// Panel queues
// ──────────────────────────────────────────────────────────────────
export interface AtRiskEntry {
  project: ProjectRecord;
  openRfis: number;
  overdueRfis: number;
  daysLeft: number | null;
  isOverdue: boolean;
}

export interface ClosingSoonEntry {
  project: ProjectRecord;
  daysLeft: number;
  pctComplete: number;
}

export interface RecentlyUpdatedEntry {
  project: ProjectRecord;
  pctComplete: number;
  updatedAt: string | null;
}

export interface ProjectsSummary {
  kpis: ProjectsKpiSummary;
  healthByProjectId: Record<string, OperationalHealthResult>;
  /**
   * Effective % complete per project id (override, else WP progress). The
   * register column previously had no per-row source and rendered "—" for
   * every project without a manual override.
   */
  pctCompleteByProjectId: Record<string, number>;
  atRiskQueue: AtRiskEntry[];
  closingSoonQueue: ClosingSoonEntry[];
  recentlyUpdatedQueue: RecentlyUpdatedEntry[];
}

// ──────────────────────────────────────────────────────────────────
// Per-project effective % complete: prefer scope_complete_pct_override,
// then fall back to WP-based progress (same rule as Projects.jsx hero).
// workPackages here are ALREADY filtered to this project's id.
// ──────────────────────────────────────────────────────────────────
export function effectivePct(
  project: ProjectRecord,
  projectWPs: WorkPackageRecord[]
): number {
  if (project.scope_complete_pct_override != null) {
    return Math.round(Number(project.scope_complete_pct_override));
  }
  return calcWpProgress(projectWPs).pct;
}

// ──────────────────────────────────────────────────────────────────
// Main aggregation
// ──────────────────────────────────────────────────────────────────
export function buildProjectsSummary(
  projects: ProjectRecord[],
  workPackages: WorkPackageRecord[] = [],
  rfis: RfiRecord[] = [],
  changeOrders: ChangeOrderRecord[] = [],
  scheduleTasks: ScheduleTaskRecord[] = [],
  todayIso: string = localToday(),
  evidence: { rfiEvidenceLoaded: boolean; scheduleEvidenceLoaded: boolean } = {
    rfiEvidenceLoaded: true,
    scheduleEvidenceLoaded: true,
  },
): ProjectsSummary {
  // Filter child entities to those within the visible project set
  const projectIds = new Set(projects.map((p) => p.id));
  const visibleWPs = workPackages.filter((w) => w.project_id && projectIds.has(w.project_id));
  const visibleRfis = rfis.filter((r) => r.project_id && projectIds.has(r.project_id));
  const visibleCOs = changeOrders.filter((c) => c.project_id && projectIds.has(c.project_id));
  const visibleTasks = scheduleTasks.filter(
    (task) => task.project_id && projectIds.has(task.project_id),
  );
  const healthByProjectId = buildOperationalHealthIndex(
    projects,
    visibleRfis,
    visibleTasks,
    todayIso,
    evidence,
  );

  const nonHoldProjects = projects.filter((p) => !p.on_hold);
  const isComplete = (project: ProjectRecord) => {
    const projectWPs = visibleWPs.filter((wp) => wp.project_id === project.id);
    const lifecycle = String(project.status || project.phase || "").toLowerCase();
    return (
      lifecycle === "complete" ||
      lifecycle === "completed" ||
      lifecycle === "closeout" ||
      effectivePct(project, projectWPs) >= 100
    );
  };
  /**
   * Genuinely finished — closed lifecycle or 100% scope. Unlike `isComplete`
   * this does NOT treat the Closeout phase as finished, so a job still being
   * closed out stays visible to the Closing Soon panel.
   */
  const isFinished = (project: ProjectRecord) => {
    const projectWPs = visibleWPs.filter((wp) => wp.project_id === project.id);
    const lifecycle = String(project.status || project.phase || "").toLowerCase();
    return (
      lifecycle === "complete" ||
      lifecycle === "completed" ||
      effectivePct(project, projectWPs) >= 100
    );
  };
  const activeProjects = nonHoldProjects.filter((project) => !isComplete(project));
  const activeIds = new Set(activeProjects.map((p) => p.id));
  const kpiRfis = visibleRfis.filter((r) => r.project_id && activeIds.has(r.project_id));
  const kpiCOs  = visibleCOs.filter((c) => c.project_id && activeIds.has(c.project_id));

  const atRiskProjects = activeProjects.filter(
    (project) => healthByProjectId[project.id]?.label === "At Risk",
  );
  const onHoldCount    = projects.filter((project) => project.on_hold).length;
  const totalVal = allRows.reduce((sum, p) => sum + p.revisedContract, 0);

  // Average % complete over active, non-closeout projects
  const progressable = activeProjects;
  const avgPctComplete = progressable.length
    ? Math.round(
        progressable.reduce((sum, p) => {
          const pWPs = visibleWPs.filter((w) => w.project_id === p.id);
          return sum + effectivePct(p, pWPs);
        }, 0) / progressable.length
      )
    : 0;

  // RFI health (active projects only)
  const { openCount: openRfis, overdueCount: overdueRfis } = calcRfiHealth(kpiRfis);

  // Pending CO summary (active projects only)
  const pendingCOs       = kpiCOs.filter((c) => ["Submitted", "Under Review"].includes(c.status || ""));
  const pendingCOCount   = pendingCOs.length;
  const pendingCOValue   = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);

  const kpis: ProjectsKpiSummary = {
    totalProjects: projects.length,
    activeProjects: activeProjects.length,
    atRisk: atRiskProjects.length,
    onHold: onHoldCount,
    totalContractValue: totalVal,
    avgPctComplete,
    openRfis,
    overdueRfis,
    pendingCOValue,
    pendingCOCount,
  };

  // ── Panel 1: At-Risk Projects ─────────────────────────────────
  const atRiskQueue: AtRiskEntry[] = atRiskProjects
    .slice()
    .sort((a, b) => {
      // Overdue first, then by days-left ascending
      const da = calcDaysToDeadline(a);
      const db = calcDaysToDeadline(b);
      if (da.isOverdue !== db.isOverdue) return da.isOverdue ? -1 : 1;
      if (da.daysLeft != null && db.daysLeft != null) return da.daysLeft - db.daysLeft;
      return 0;
    })
    .slice(0, 6)
    .map((p) => {
      const pRfis = visibleRfis.filter((r) => r.project_id === p.id);
      const { openCount, overdueCount } = calcRfiHealth(pRfis);
      const { daysLeft, isOverdue } = calcDaysToDeadline(p);
      return { project: p, openRfis: openCount, overdueRfis: overdueCount, daysLeft, isOverdue };
    });

  // ── Panel 2: Closing Soon (≤90 days out) ─────────────────────────────────
  // Scoped to non-hold, not-yet-complete projects — NOT `activeProjects`,
  // which excludes the Closeout phase. A job in closeout with a target date two
  // weeks away is precisely what "Closing Soon" is for; excluding it made the
  // panel report "none within 90 days" while a project was 14 days out.
  // Falls back to forecast_completion_date when no target date is set.
  const now = Date.now();
  const closingSoonQueue: ClosingSoonEntry[] = nonHoldProjects
    .filter((p) => !isFinished(p))
    .map((p) => ({
      p,
      // forecast_completion_date isn't a declared field on ProjectRecord, so it
      // arrives through the index signature as unknown — normalise to a string.
      dateStr: String(p.target_completion_date || p.forecast_completion_date || ""),
    }))
    .filter((e) => e.dateStr !== "")
    .map(({ p, dateStr }) => {
      const daysLeft = Math.ceil((new Date(dateStr).getTime() - now) / 86400000);
      const pWPs = visibleWPs.filter((w) => w.project_id === p.id);
      return { project: p, daysLeft, pctComplete: effectivePct(p, pWPs) };
    })
    .filter((e) => e.daysLeft >= 0 && e.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 6);

  // ── Panel 3: Recently Updated ────────────────────────────────
  const recentlyUpdatedQueue: RecentlyUpdatedEntry[] = projects
    .slice()
    .filter((p) => p.updated_at)
    .sort((a, b) => {
      const at = a.updated_at ?? "";
      const bt = b.updated_at ?? "";
      return bt.localeCompare(at);
    })
    .slice(0, 6)
    .map((p) => {
      const pWPs = visibleWPs.filter((w) => w.project_id === p.id);
      return { project: p, pctComplete: effectivePct(p, pWPs), updatedAt: p.updated_at ?? null };
    });

  const pctCompleteByProjectId: Record<string, number> = {};
  for (const p of projects) {
    pctCompleteByProjectId[p.id] = effectivePct(
      p,
      visibleWPs.filter((w) => w.project_id === p.id),
    );
  }

  return {
    kpis,
    healthByProjectId,
    pctCompleteByProjectId,
    atRiskQueue,
    closingSoonQueue,
    recentlyUpdatedQueue,
  };
}
