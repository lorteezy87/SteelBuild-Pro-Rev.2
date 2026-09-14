/**
 * Pure derivations for the Portfolio Control Center (canonical presentation redesign).
 * No React, no network. Reuses the canonical helpers from utils/projectKpis.js
 * so the redesigned page computes identically to the classic Portfolio Overview.
 *
 * All functions are pure: (projects, relatedRecords) → summary. Easy to unit-test.
 */
import { calcContractValue, calcWpProgress, calcDaysToDeadline } from "@/utils/projectKpis";
import { computeCostCodeTotals, resolveProjectSpend } from "@/services/costRollup";
import { computePortfolioProjectHealth } from "@/services/portfolioHealthScoring";
import { capHealthScore, deriveOperationalHealth } from "@/lib/projectHealth";
import type { OperationalHealthLabel } from "@/lib/projectHealth";
import { partitionFieldTasks } from "@/lib/field/fieldToday";
import { localToday } from "@/utils/dates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A raw row from entities.Project.listAll() — cite only real DB columns. */
export interface ProjectRecord {
  id: string;
  name?: string | null;
  project_number?: string | null;
  /** chk_projects_phase: Pre-Construction / Detailing / Procurement / Fabrication / Delivery / Installation / Erection / Closeout. */
  phase?: string | null;
  /** chk_projects_health: On Track / Watch / At Risk / Awaiting Data. */
  health_status?: string | null;
  /** projects has no `status` column — on_hold (+ phase) is the lifecycle signal. */
  on_hold?: boolean | null;
  original_contract_value?: number | null;
  target_completion_date?: string | null;
  forecast_completion_date?: string | null;
  /** MISSING — no DB column; derived from score below. */
  // health_status intentionally omitted — it is not a stored column (AIInsights derives it)
  [key: string]: unknown;
}

/** Cross-entity data needed for portfolio rollups. */
export interface PortfolioRelated {
  changeOrders: Array<{ project_id?: string; status?: string | null; co_amount?: number | null }>;
  workPackages: Array<{ project_id?: string; status?: string | null; tonnage?: number | null; percent_complete?: number | null }>;
  costCodes: Array<{ project_id?: string; budget_amount?: number | null; committed_cost?: number | null; actual_cost?: number | null; [key: string]: unknown }>;
  rfis: Array<{ project_id?: string; status?: string | null; date_required?: string | null; priority?: string | null }>;
  deliveries: Array<{ project_id?: string; status?: string | null; scheduled_date?: string | null; delivery_date?: string | null }>;
  actionItems: Array<{ project_id?: string; status?: string | null; due_date?: string | null }>;
  scheduleTasks: Array<{
    id?: string;
    project_id?: string;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    parent_task_id?: string | null;
    is_summary?: boolean | null;
    percent_complete?: number | null;
  }>;
  /**
   * Optional: expenses power the canonical spend fallback (a project tracked
   * through logged expenses instead of typed cost-code columns still reports
   * real committed spend). Callers that omit this fall back to typed columns.
   */
  expenses?: Array<{ project_id?: string; amount?: number | string | null; cost_code?: string | null; payment_status?: string | null }>;
  rfiEvidenceLoaded?: boolean;
  scheduleEvidenceLoaded?: boolean;
}

/** One enriched row after rollup. */
export interface EnrichedProject extends ProjectRecord {
  /** Computed health label: "On Track" | "Watch" | "At Risk" */
  health: OperationalHealthLabel;
  /** 0–100 health score (same algorithm as AIInsights.computeProjectModel). */
  score: number;
  /** From calcContractValue. */
  revisedContract: number;
  /** Work-package % complete (by count, same as calcWpProgress). */
  pctComplete: number;
  /** Days to target_completion_date (null = no date set). */
  daysLeft: number | null;
  /** True if target date has passed. */
  isOverdue: boolean;
  /** Open, non-terminal RFI count. */
  openRfis: number;
  /** Overdue open RFI count. */
  overdueRfis: number;
  /** Late delivery count. */
  lateDeliveries: number;
  /** Total tons from work packages. */
  totalTons: number;
  /** Budget from cost codes (computeCostCodeTotals). */
  budget: number;
  /** Committed spend via resolveProjectSpend (floored at resolved actual). */
  committed: number;
  /** reasons[] for health deductions (same as AIInsights). */
  reasons: string[];
}

/** KPI strip cells for the Portfolio Control Center. */
export interface PortfolioKpis {
  totalProjects: number;
  activeProjects: number;
  atRisk: number;
  totalContractValue: number;
  onSchedule: number;
  avgPctComplete: number;
}

/** Row shown in a DecisionPanel queue. */
export interface PortfolioPanelRow {
  id: string;
  name: string;
  projectNumber: string | null;
  health: EnrichedProject["health"];
  score: number;
  revisedContract: number;
  pctComplete: number;
  daysLeft: number | null;
  isOverdue: boolean;
  openRfis: number;
  overdueRfis: number;
}

export interface PortfolioSummary {
  kpis: PortfolioKpis;
  /** Projects sorted by ascending health score (worst first). */
  atRiskQueue: PortfolioPanelRow[];
  /** Projects sorted by descending revised contract value. */
  topByValue: PortfolioPanelRow[];
  /** Active projects with a target date in the next 90 days, soonest first. */
  closingSoon: PortfolioPanelRow[];
  /** All enriched rows — the DataTable source. */
  allRows: EnrichedProject[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dateValue(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntilDate(v: string | null | undefined): number | null {
  const d = dateValue(v);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function toPanelRow(p: EnrichedProject): PortfolioPanelRow {
  return {
    id: p.id,
    name: p.name || "Untitled",
    projectNumber: p.project_number ?? null,
    health: p.health,
    score: p.score,
    revisedContract: p.revisedContract,
    pctComplete: p.pctComplete,
    daysLeft: p.daysLeft,
    isOverdue: p.isOverdue,
    openRfis: p.openRfis,
    overdueRfis: p.overdueRfis,
  };
}

type ProjectIdMap<T> = Map<string, T[]>;

function bucketByProjectId<T extends { project_id?: string | null | undefined }>(
  rows: T[] | undefined,
): ProjectIdMap<T> {
  const buckets = new Map<string, T[]>();
  if (!rows?.length) {
    return buckets;
  }

  rows.forEach((row) => {
    const projectId = row?.project_id;
    if (!projectId) return;
    const existing = buckets.get(projectId);
    if (existing) {
      existing.push(row);
    } else {
      buckets.set(projectId, [row]);
    }
  });

  return buckets;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enriches every project record with computed KPIs, then assembles the full
 * PortfolioSummary used by the Portfolio Control Center.
 *
 * @param projects  - Raw array from entities.Project.listAll()
 * @param related   - Pre-fetched cross-entity arrays (already ALL projects — no pre-filtering)
 */
export function buildPortfolioSummary(
  projects: ProjectRecord[],
  related: PortfolioRelated,
): PortfolioSummary {
  const {
    changeOrders,
    workPackages,
    costCodes,
    rfis,
    deliveries,
    actionItems,
    scheduleTasks,
    expenses = [],
    rfiEvidenceLoaded = true,
    scheduleEvidenceLoaded = true,
  } = related;
  const todayIso = localToday();

  const changeOrdersByProject = bucketByProjectId(changeOrders);
  const workPackagesByProject = bucketByProjectId(workPackages);
  const costCodesByProject = bucketByProjectId(costCodes);
  const expensesByProject = bucketByProjectId(expenses);
  const rfisByProject = bucketByProjectId(rfis);
  const deliveriesByProject = bucketByProjectId(deliveries);
  const actionItemsByProject = bucketByProjectId(actionItems);
  const scheduleTasksByProject = bucketByProjectId(scheduleTasks);

  // Enrich each project
  const allRows: EnrichedProject[] = projects.map((project) => {
    const pId = project.id;

    // ── Related slices ──
    const projCOs = changeOrdersByProject.get(pId) ?? [];
    const projWPs = workPackagesByProject.get(pId) ?? [];
    const projCodes = costCodesByProject.get(pId) ?? [];
    const projRfis = rfisByProject.get(pId) ?? [];
    const projDeliveries = deliveriesByProject.get(pId) ?? [];
    const projActions = actionItemsByProject.get(pId) ?? [];
    const projTasks = scheduleTasksByProject.get(pId) ?? [];

    // ── Contract value (reuse canonical helper) ──
    const { revised: revisedContract } = calcContractValue(project, projCOs);

    // ── WP progress (reuse canonical helper) ──
    const { pct: pctComplete, totalTons } = calcWpProgress(projWPs);

    // ── Days to deadline (reuse canonical helper) ──
    const { daysLeft, isOverdue } = calcDaysToDeadline(project);

    // ── Cost codes ──
    const { budget } = computeCostCodeTotals(projCodes);
    // Canonical spend model: typed cost-code columns win, expenses fall back,
    // unmapped expenses still count (resolveProjectSpend). The project-level
    // max(committed, actual) preserves the domain invariant committed ≥ actual
    // when only actuals were typed onto the codes.
    const projExpenses = expensesByProject.get(pId) ?? [];
    const spend = resolveProjectSpend(projCodes, projExpenses);
    const committed = Math.max(spend.committed, spend.actual);

    const {
      score: rawScore,
      health: scoredHealth,
      reasons,
      openRfis,
      overdueRfis,
      lateDeliveries,
    } = computePortfolioProjectHealth({
      originalContractValue: project.original_contract_value,
      rfis: projRfis,
      deliveries: projDeliveries,
      actionItems: projActions,
      scheduleTasks: projTasks,
      budget,
      committed,
    });
    const openStatuses = new Set(["Open", "Under Review", "Incomplete Response"]);
    const criticalOverdueRfis = projRfis.filter((rfi) => {
      const due = String(rfi.date_required || "").slice(0, 10);
      return Boolean(due) && openStatuses.has(rfi.status || "Open") && due < todayIso && rfi.priority === "Critical";
    }).length;
    const operationalHealth = deriveOperationalHealth({
      storedStatus: project.health_status || scoredHealth,
      onHold: Boolean(project.on_hold),
      overdueRfis,
      criticalOverdueRfis,
      overdueScheduleTasks: partitionFieldTasks(projTasks, todayIso).recovery.length,
      targetDateOverdue: isOverdue,
      percentComplete: pctComplete,
      rfiEvidenceLoaded,
      scheduleEvidenceLoaded,
    });
    const score = capHealthScore(rawScore, operationalHealth);
    const health = operationalHealth.label;

    return {
      ...project,
      health,
      score,
      revisedContract,
      pctComplete,
      daysLeft,
      isOverdue,
      openRfis,
      overdueRfis,
      lateDeliveries,
      totalTons,
      budget,
      committed,
      reasons: [...new Set([...operationalHealth.reasons, ...reasons])],
    };
  });

  // ── KPIs ──
  // Active = not on hold, not fully complete, and not in Closeout. (projects
  // has no status column; on_hold + phase are the only lifecycle signals.)
  const activeRows = allRows.filter(
    (p) =>
      !p.on_hold &&
      p.pctComplete < 100 &&
      String(p.phase || "").toLowerCase() !== "closeout",
  );
  const kpis: PortfolioKpis = {
    totalProjects: allRows.length,
    activeProjects: activeRows.length,
    atRisk: activeRows.filter((p) => p.health === "At Risk").length,
    totalContractValue: allRows.reduce((sum, p) => sum + p.revisedContract, 0),
    onSchedule: activeRows.filter((p) => p.health === "On Track").length,
    avgPctComplete:
      activeRows.length > 0
        ? Math.round(activeRows.reduce((sum, p) => sum + p.pctComplete, 0) / activeRows.length)
        : 0,
  };

  // ── Panel queues ──
  const atRiskQueue = [...activeRows]
    .filter((p) => p.health === "At Risk" || p.health === "Watch")
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)
    .map(toPanelRow);

  const topByValue = [...allRows]
    .filter((p) => p.revisedContract > 0)
    .sort((a, b) => b.revisedContract - a.revisedContract)
    .slice(0, 6)
    .map(toPanelRow);

  const closingSoon = [...activeRows]
    .filter((p) => {
      const days = daysUntilDate(p.target_completion_date as string | null);
      return days !== null && days >= 0 && days <= 90;
    })
    .sort((a, b) => {
      const da = daysUntilDate(a.target_completion_date as string | null) ?? 9999;
      const db = daysUntilDate(b.target_completion_date as string | null) ?? 9999;
      return da - db;
    })
    .slice(0, 6)
    .map(toPanelRow);

  return { kpis, atRiskQueue, topByValue, closingSoon, allRows };
}

/**
 * Status tone for the health label — maps to the command kit's PillTone.
 */
export function healthTone(health: EnrichedProject["health"]): "danger" | "warn" | "good" | "neutral" {
  if (health === "At Risk") return "danger";
  if (health === "Watch") return "warn";
  if (health === "On Track") return "good";
  return "neutral";
}
