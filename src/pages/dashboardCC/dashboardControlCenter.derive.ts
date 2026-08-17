/**
 * Pure derivations for the Dashboard Control Center (canonical presentation redesign).
 * No React, no network.
 *
 * Re-uses the canonical helpers from projectMetrics.js so the KPI numbers
 * shown in the CC are byte-identical to those in the page-owned ProjectDashboard.
 * Do NOT inline the math here — import the helper.
 */

import {
  openRFICount,
  overdueRFICount,
  timelineElapsedPct,
  budgetCommitted,
  committedSpend,
  actualSpend,
  revisedContractValue,
  daysRemaining,
  totalBilled,
  cashCollected,
  pendingPayment,
  retentionHeld,
  recentActivityFeed,
  submittalPipelineRollupFromSubmittals,
  pendingCOTotal,
} from "../dashboard/projectMetrics";
import { buildScheduleSummary } from "@/pages/schedule/scheduleCommandCenter.derive";
import {
  buildOperationalHealthIndex,
  capHealthScore,
  deriveOperationalHealth,
} from "@/lib/projectHealth";
import type { OperationalHealthResult } from "@/lib/projectHealth";
import { isPunchlistOpen } from "@/lib/entityPredicates";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Tone values matching the command kit's KpiTone */
export type DashTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface DashKpi {
  label: string;
  value: string | number;
  sublabel?: string;
  tone: DashTone;
}

export interface DashAlertRow {
  id: string;
  label: string;
  count: number;
  priority: "high" | "medium" | "low";
  priorityLabel: string;
}

export interface DashSummaryRow {
  label: string;
  value: string;
}

export interface DashActivityRow {
  id: string;
  code: string;
  type: string;
  description: string;
  status: string;
  statusTone: string;
  relatedTo: string;
  updatedBy: string;
  updated: string;
  sortDate?: string | null;
}

export interface DashboardSummary {
  projectName: string;
  healthScore: number;
  healthLabel: string;
  operationalHealth: OperationalHealthResult;
  healthReasons: string[];
  /** 4 KPI strip cells */
  kpis: DashKpi[];
  /** Critical alerts panel rows (pre-filtered to non-zero) */
  alerts: DashAlertRow[];
  /** Project summary key/value pairs */
  summaryRows: DashSummaryRow[];
  /** Recent activity for the DataTable */
  recentActivity: DashActivityRow[];
  /** Module tile data (re-uses existing shape from buildDashboardModel) */
  modules: ModuleTile[];
  /** Hero chip values */
  openRfis: number;
  overdueRfis: number;
  schedulePct: number;
}

export interface ModuleTile {
  page: string;
  title: string;
  subtitle: string;
  metric: string;
  target: string;
  tone?: string;
  photo: string;
}

// ── Closed-status sets (mirrors ProjectDashboard.jsx exactly) ─────────────────

const CLOSED_CO_STATUSES = new Set(["Approved", "Approved as Noted", "Rejected", "Void", "Executed"]);
const CLOSED_SUBMITTAL_STATUSES = new Set(["Approved", "Approved as Noted", "Released for Fabrication", "Void"]);
const CLOSED_TASK_STATUSES = new Set(["Complete", "Completed", "Done", "Closed"]);
const CLOSED_DELIVERY_STATUSES = new Set(["Delivered", "Complete", "Completed", "Received", "Cancelled"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatMoney(value: number): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatSignedPercent(value: number): string {
  const n = Number(value) || 0;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatDate(value?: string | null): string {
  if (!value) return "TBD";
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatRelative(value?: string | null): string {
  if (!value) return "TBD";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBD";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const raw = String(value).slice(0, 10);
  const d2 = new Date(`${raw}T00:00:00Z`);
  return d2.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function activityStatusTone(status?: string | null): string {
  const s = String(status || "").toLowerCase();
  if (s.includes("approved") || s.includes("released") || s.includes("complete") || s.includes("closed")) return "approved";
  if (s.includes("wait") || s.includes("review") || s.includes("pending")) return "waiting";
  if (s.includes("open") || s.includes("overdue") || s.includes("reject")) return "open";
  if (s.includes("progress") || s.includes("submitted")) return "progress";
  return "neutral";
}

function isPast(value?: string | null): boolean {
  if (!value) return false;
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return d < utcToday;
}

// ── buildDashboardSummary ─────────────────────────────────────────────────────

/**
 * Derives all KPIs, alerts, summary rows, and activity rows from live
 * Supabase entity arrays. All numbers reuse the canonical helpers from
 * projectMetrics.js — nothing is recomputed independently here.
 */
export function buildDashboardSummary(input: {
  project?: Record<string, unknown> | null;
  rfis?: Record<string, unknown>[];
  cos?: Record<string, unknown>[];
  codes?: Record<string, unknown>[];
  wps?: Record<string, unknown>[];
  deliveries?: Record<string, unknown>[];
  actionItems?: Record<string, unknown>[];
  expenses?: Record<string, unknown>[];
  submittals?: Record<string, unknown>[];
  drawings?: Record<string, unknown>[];
  sovItems?: Record<string, unknown>[];
  scheduleTasks?: Record<string, unknown>[];
  drawingActivity?: Record<string, unknown>[];
  punchlistItems?: Record<string, unknown>[];
  inspections?: Record<string, unknown>[];
  safetyIncidents?: Record<string, unknown>[];
  qualityRecords?: Record<string, unknown>[];
  todayIso?: string;
  rfiEvidenceLoaded?: boolean;
  scheduleEvidenceLoaded?: boolean;
}): DashboardSummary {
  const {
    project = null,
    rfis = [],
    cos = [],
    codes = [],
    deliveries = [],
    actionItems = [],
    expenses = [],
    submittals = [],
    drawings = [],
    sovItems = [],
    scheduleTasks = [],
    drawingActivity = [],
    punchlistItems = [],
    inspections = [],
    safetyIncidents = [],
    qualityRecords = [],
    todayIso,
    rfiEvidenceLoaded = true,
    scheduleEvidenceLoaded = true,
  } = input;
  const effectiveToday = todayIso ?? new Date().toISOString().slice(0, 10);

  // ── Reuse canonical helpers (numbers match page-owned dashboard exactly) ───────
  const openRfis = openRFICount(rfis as Parameters<typeof openRFICount>[0]);
  const overdueRfis = overdueRFICount(rfis as Parameters<typeof overdueRFICount>[0]);
  const scheduleSummary = buildScheduleSummary(scheduleTasks);
  const schedulePct = scheduleSummary.pctComplete;
  const elapsedPct = timelineElapsedPct(project as Parameters<typeof timelineElapsedPct>[0]);
  const scheduleHealth = clamp(Math.round(100 - Math.max(0, elapsedPct - schedulePct)), 0, 100);

  const budget = budgetCommitted(codes as Parameters<typeof budgetCommitted>[0]);
  const committed = committedSpend(
    codes as Parameters<typeof committedSpend>[0],
    expenses as Parameters<typeof committedSpend>[1],
  );
  const actual = actualSpend(
    codes as Parameters<typeof actualSpend>[0],
    expenses as Parameters<typeof actualSpend>[1],
  );
  // Cost codes can carry actual_cost without committed_cost. Use the greater
  // resolved exposure so real spend is never presented as "no costs posted"
  // or as a misleading +100% budget variance.
  const costExposure = Math.max(committed, actual);
  const hasPostedCosts = costExposure > 0;
  const costDelta = budget - costExposure;
  const costPct = budget > 0 ? (costDelta / budget) * 100 : 0;
  const budgetHealth = budget > 0 && hasPostedCosts
    ? clamp(Math.round(100 + Math.min(0, costPct)), 0, 100)
    : null;

  const openPunchlist = punchlistItems.filter(isPunchlistOpen).length;
  const openInspections = inspections.filter((i) => !CLOSED_TASK_STATUSES.has(String((i as Record<string, unknown>).status ?? ""))).length;
  const qualityHealth = clamp(100 - Math.min(40, openPunchlist + openInspections), 60, 100);
  const safetyHealth = clamp(100 - Math.min(45, safetyIncidents.length * 8), 55, 100);
  // Unknown cost evidence must not silently contribute a perfect score. Only
  // include the cost dimension once a budget and actual/committed spend exist.
  const healthComponents = [scheduleHealth, qualityHealth, safetyHealth];
  if (budgetHealth !== null) healthComponents.push(budgetHealth);
  const rawHealthScore = Math.round(
    healthComponents.reduce((sum, value) => sum + value, 0) / healthComponents.length,
  );
  const projectId = String(project?.id || "");
  const operationalHealth = (
    projectId
      ? buildOperationalHealthIndex(
          [project as Record<string, unknown>],
          rfis,
          scheduleTasks,
          effectiveToday,
          { rfiEvidenceLoaded, scheduleEvidenceLoaded },
        )[projectId]
      : undefined
  ) ?? deriveOperationalHealth({
    storedStatus: String(project?.health_status || ""),
    overdueRfis: 0,
    criticalOverdueRfis: 0,
    overdueScheduleTasks: 0,
    rfiEvidenceLoaded,
    scheduleEvidenceLoaded,
  });
  const healthScore = capHealthScore(rawHealthScore, operationalHealth);

  const contractValue = revisedContractValue(
    project as Parameters<typeof revisedContractValue>[0],
    cos as Parameters<typeof revisedContractValue>[1],
  );
  const remainingDays = daysRemaining(project as Parameters<typeof daysRemaining>[0]);
  const billed = totalBilled(sovItems as Parameters<typeof totalBilled>[0]);
  const collected = cashCollected(sovItems as Parameters<typeof cashCollected>[0]);
  const pendingPay = pendingPayment(sovItems as Parameters<typeof pendingPayment>[0]);
  const retention = retentionHeld(sovItems as Parameters<typeof retentionHeld>[0]);

  const pendingSubmittals = submittals.filter(
    (s) => {
      const r = s as Record<string, unknown>;
      return !r.is_deleted && !CLOSED_SUBMITTAL_STATUSES.has(String(r.status ?? ""));
    }
  ).length;
  const activeCos = cos.filter((c) => {
    const r = c as Record<string, unknown>;
    return !r.is_deleted && !CLOSED_CO_STATUSES.has(String(r.status ?? ""));
  }).length;
  const pendingCoDollars = pendingCOTotal(cos as Parameters<typeof pendingCOTotal>[0]);

  const drawingCount = drawings.filter((d) => !(d as Record<string, unknown>).is_deleted).length;
  // Match Field Hub's "Open Field Issues" authority exactly: open punchlist
  // items. Closed safety observations and passed QC records are not issues.
  const fieldIssues = openPunchlist;

  const submittalPipeline = submittalPipelineRollupFromSubmittals(
    submittals as Parameters<typeof submittalPipelineRollupFromSubmittals>[0],
  );

  // ── KPI strip (4 cells matching the mockup concept) ───────────────────────
  const kpis: DashKpi[] = [
    {
      label: "Open RFIs",
      value: openRfis,
      sublabel: overdueRfis ? `${overdueRfis} overdue` : "On response plan",
      tone: overdueRfis ? "danger" : "neutral",
    },
    {
      label: "Schedule Progress",
      value: `${schedulePct}%`,
      sublabel: scheduleSummary.overdue > 0
        ? `${scheduleSummary.overdue} overdue`
        : `${scheduleSummary.activities} activities`,
      tone: scheduleSummary.overdue > 0 ? "danger" : "neutral",
    },
    {
      label: "Cost Health",
      value: budget > 0 && hasPostedCosts ? formatSignedPercent(costPct) : "TBD",
      sublabel: budget <= 0
        ? "Budget needed"
        : hasPostedCosts
          ? (costPct >= 0 ? "Under Budget" : "Over Budget")
          : "No costs posted",
      tone: budget > 0 && hasPostedCosts ? (costPct >= 0 ? "good" : "danger") : "neutral",
    },
    {
      label: "Pending Submittals",
      value: pendingSubmittals,
      sublabel: `${submittalPipeline.total} active workflow rows`,
      tone: pendingSubmittals > 5 ? "warn" : pendingSubmittals > 0 ? "neutral" : "good",
    },
  ];

  // ── Alerts panel (non-zero count only, at most 5) ─────────────────────────
  const lateDeliveries = deliveries.filter((d) => {
    const r = d as Record<string, unknown>;
    const dateStr = (r.scheduled_date || r.required_date) as string | null;
    return isPast(dateStr) && !CLOSED_DELIVERY_STATUSES.has(String(r.status ?? ""));
  }).length;
  const staleDrawings = drawings.filter((d) => {
    const r = d as Record<string, unknown>;
    return !r.is_deleted && ["Rejected", "Revise and Resubmit"].includes(String(r.status ?? r.stage ?? r.set_approval_status ?? ""));
  }).length;

  const rawAlerts: DashAlertRow[] = [
    { id: "drawings", count: staleDrawings, label: "Drawings Need Attention", priority: "high", priorityLabel: "High Priority" },
    { id: "rfis", count: overdueRfis, label: "RFIs Overdue", priority: "high", priorityLabel: "High Priority" },
    { id: "submittals", count: pendingSubmittals, label: "Submittals Open", priority: pendingSubmittals > 5 ? "medium" : "low", priorityLabel: pendingSubmittals > 5 ? "Medium Priority" : "Low Priority" },
    { id: "field", count: fieldIssues, label: "Field Issues Require Attention", priority: "medium", priorityLabel: "Medium Priority" },
    { id: "delivery", count: lateDeliveries + activeCos, label: "Milestones or COs at Risk", priority: lateDeliveries ? "medium" : "low", priorityLabel: lateDeliveries ? "Medium Priority" : "Low Priority" },
  ];
  const alerts = rawAlerts.filter((a) => a.count > 0).slice(0, 5);

  // ── Summary panel key/values ───────────────────────────────────────────────
  const summaryRows: DashSummaryRow[] = [
    { label: "Project Value", value: formatMoney(contractValue) },
    { label: "Target Completion", value: formatDate((project?.target_completion_date || project?.forecast_completion_date) as string | null) },
    { label: "% Complete", value: `${schedulePct}%` },
    { label: "Days Remaining", value: remainingDays == null ? "TBD" : String(remainingDays) },
    { label: "Billed / Collected", value: `${formatMoney(billed)} / ${formatMoney(collected)}` },
    { label: "Open Pay + Retainage", value: formatMoney(pendingPay.total + retention) },
  ];

  // ── Recent activity table ─────────────────────────────────────────────────
  // Re-uses recentActivityFeed from projectMetrics so the feed clusters the
  // same way as in the page-owned dashboard.
  const activityFeed = recentActivityFeed(
    drawingActivity as Parameters<typeof recentActivityFeed>[0],
    4,
  );
  const drawingRows: DashActivityRow[] = activityFeed.map((entry, index) => ({
    id: `drawing-${String(entry.id || index)}`,
    code: `DRW-${index + 1}`,
    type: "Drawing",
    description: String(entry.summary || ""),
    status: entry.kind === "approval_changed" ? "Approved" : entry.kind === "revision_changed" ? "Revision" : "Updated",
    statusTone: activityStatusTone(entry.kind === "approval_changed" ? "approved" : ""),
    relatedTo: "Drawing Register",
    updatedBy: "Project Team",
    updated: formatRelative(String(entry.when || "")),
    sortDate: String(entry.when || ""),
  }));

  const rfiRows: DashActivityRow[] = (rfis as Record<string, unknown>[]).slice(0, 3).map((r, index) => ({
    id: `rfi-${String(r.id || index)}`,
    code: String(r.rfi_number || `RFI-${index + 1}`),
    type: "RFI",
    description: String(r.title || r.subject || "RFI update"),
    status: String(r.status || "Open"),
    statusTone: activityStatusTone(String(r.status || "")),
    relatedTo: String(r.location || r.discipline || "Coordination"),
    updatedBy: String(r.assigned_to || r.ball_in_court || "Project Team"),
    updated: formatRelative(String(r.updated_at || r.created_at || r.submitted_date || "")),
    sortDate: String(r.updated_at || r.created_at || r.submitted_date || ""),
  }));

  const submittalRows: DashActivityRow[] = (submittals as Record<string, unknown>[]).slice(0, 3).map((s, index) => ({
    id: `sub-${String(s.id || index)}`,
    code: String(s.submittal_number || `SUB-${index + 1}`),
    type: "Submittal",
    description: String(s.title || s.name || "Submittal package"),
    status: String(s.status || "In Review"),
    statusTone: activityStatusTone(String(s.status || "")),
    relatedTo: String(s.discipline || "Detailing"),
    updatedBy: String(s.ball_in_court || "Project Team"),
    updated: formatRelative(String(s.updated_at || s.created_at || s.submitted_date || "")),
    sortDate: String(s.updated_at || s.created_at || s.submitted_date || ""),
  }));

  const recentActivity: DashActivityRow[] = [...drawingRows, ...rfiRows, ...submittalRows]
    .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")))
    .slice(0, 6);

  // ── Module tiles (same data as ProjectDashboard.buildDashboardModel) ───────
  // photoFor is a pure config lookup — safe to call here since this module
  // only runs in a browser context anyway (Dashboard.jsx guard ensures pid).
  const photoFor = (page: string): string =>
    `/photos/desktop/${page}.webp`;

  const modules: ModuleTile[] = [
    { page: "RFIs", title: "RFIs", subtitle: "Questions & Responses", metric: `${openRfis} Open`, target: "rfis", photo: photoFor("RFIs") },
    { page: "DrawingSubmittalHub", title: "Detailing", subtitle: "Drawings & Models", metric: `${drawingCount} Drawings`, target: "submittals", photo: photoFor("DrawingSubmittalHub") },
    { page: "ScheduleHub", title: "Schedule", subtitle: "Project Timeline", metric: `${schedulePct}% Complete`, target: "schedule", tone: schedulePct >= 80 ? "good" : undefined, photo: photoFor("ScheduleHub") },
    { page: "FieldHub", title: "Field Hub", subtitle: "Daily Field Management", metric: `${fieldIssues} Issues`, target: "field", photo: photoFor("FieldHub") },
    { page: "CostHub", title: "Budget Control", subtitle: "Costs & Commitments", metric: budget > 0 && hasPostedCosts ? `${formatSignedPercent(costPct)} ${costPct >= 0 ? "Under Budget" : "Over Budget"}` : budget > 0 ? "Costs not posted" : "Budget TBD", target: "cost-hub", tone: budget > 0 && hasPostedCosts && costPct >= 0 ? "good" : undefined, photo: photoFor("CostHub") },
    { page: "ChangeOrders", title: "Change Orders", subtitle: "Scope & Contract Changes", metric: `${activeCos} Active`, target: "change-orders", photo: photoFor("ChangeOrders") },
    { page: "Documents", title: "Documents", subtitle: "Project Documents", metric: `${drawingCount + submittals.length} Files`, target: "submittals", photo: photoFor("Documents") },
    { page: "ReportsHub", title: "Reports", subtitle: "Analytics & Insights", metric: `${recentActivity.length} Updates`, target: "schedule", photo: photoFor("ReportsHub") },
  ];

  return {
    projectName: String(project?.name || project?.project_name || "Project Dashboard"),
    healthScore,
    healthLabel: operationalHealth.label,
    operationalHealth,
    healthReasons: operationalHealth.reasons,
    kpis,
    alerts,
    summaryRows,
    recentActivity,
    modules,
    openRfis,
    overdueRfis,
    schedulePct,
  };
}
