/**
 * Pure derivations for the Portfolio Control Center (command_ui redesign).
 * No React, no network. Reuses the canonical helpers from utils/projectKpis.js
 * so the redesigned page computes identically to the classic Portfolio Overview.
 *
 * All functions are pure: (projects, relatedRecords) → summary. Easy to unit-test.
 */
import { calcContractValue, calcWpProgress, calcDaysToDeadline } from "@/utils/projectKpis";
import { computeCostCodeTotals } from "@/services/costRollup";
import { computePortfolioProjectHealth } from "@/services/portfolioHealthScoring";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A raw row from entities.Project.listAll() — cite only real DB columns. */
export interface ProjectRecord {
  id: string;
  name?: string | null;
  project_number?: string | null;
  /** "Planning" | "Detailing" | "Fabrication" | "Erection" | "Complete" etc. */
  phase?: string | null;
  /** "Active" | "Complete" | "On Hold" | "Cancelled" (canonical values in DB). */
  status?: string | null;
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
  scheduleTasks: Array<{ project_id?: string; status?: string | null }>;
}

/** One enriched row after rollup. */
export interface EnrichedProject extends ProjectRecord {
  /** Computed health label: "On Track" | "Watch" | "At Risk" */
  health: "On Track" | "Watch" | "At Risk";
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
  /** Committed cost from cost codes (max(committed, actual) per code). */
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

const ACTIVE_STATUSES = new Set(["Active", "In Progress"]);

function n(v: unknown): number {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

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
  } = related;

  const changeOrdersByProject = bucketByProjectId(changeOrders);
  const workPackagesByProject = bucketByProjectId(workPackages);
  const costCodesByProject = bucketByProjectId(costCodes);
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
    const committed = projCodes.reduce(
      (sum, c) => sum + Math.max(n(c.committed_cost), n(c.actual_cost)),
      0,
    );

    const {
      score,
      health,
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
      reasons,
    };
  });

  // ── KPIs ──
  const activeRows = allRows.filter(
    (p) => ACTIVE_STATUSES.has(p.status || "") || (!p.status),
  );
  const kpis: PortfolioKpis = {
    totalProjects: allRows.length,
    activeProjects: activeRows.length,
    atRisk: allRows.filter((p) => p.health === "At Risk").length,
    totalContractValue: allRows.reduce((sum, p) => sum + p.revisedContract, 0),
    onSchedule: allRows.filter((p) => p.health === "On Track").length,
    avgPctComplete:
      allRows.length > 0
        ? Math.round(allRows.reduce((sum, p) => sum + p.pctComplete, 0) / allRows.length)
        : 0,
  };

  // ── Panel queues ──
  const atRiskQueue = [...allRows]
    .filter((p) => p.health === "At Risk" || p.health === "Watch")
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)
    .map(toPanelRow);

  const topByValue = [...allRows]
    .sort((a, b) => b.revisedContract - a.revisedContract)
    .slice(0, 6)
    .map(toPanelRow);

  const closingSoon = [...allRows]
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
export function healthTone(health: EnrichedProject["health"]): "danger" | "warn" | "good" {
  if (health === "At Risk") return "danger";
  if (health === "Watch") return "warn";
  return "good";
}
