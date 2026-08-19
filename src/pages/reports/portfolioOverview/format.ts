/**
 * Pure derive helpers for Portfolio Overview — date formatting, KPI rollups,
 * matrix filtering/sorting, and chart data. No React; safe to unit-test.
 */
import { computeCostCodeTotals, resolveProjectSpend } from "@/services/costRollup";
import type { CostCodeLike, ExpenseLike } from "@/services/costRollup";
import {
  isRfiOpen,
  isCoPending,
  isActionItemOpen,
} from "@/lib/entityPredicates";
import { computeHealth } from "../utils";

/** Compact en-US date for report headers and weekly ranges. */
export function formatPortfolioDate(
  date: Date,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
): string {
  return date.toLocaleDateString("en-US", opts);
}

/** Drop soft-deleted rows; no-op when `is_deleted` is absent. */
export function filterNotDeleted<T extends { is_deleted?: boolean }>(items: T[]): T[] {
  return items.filter((row) => !row?.is_deleted);
}

/** Schedule elapsed % — mirrors timelineElapsedPct() in projectMetrics. */
export function computeElapsedPct(
  startDate: Date | null,
  targetDate: Date | null,
  now: Date,
): number {
  if (!startDate || !targetDate || targetDate <= startDate) return 0;
  const total = targetDate.getTime() - startDate.getTime();
  const used = Math.max(0, now.getTime() - startDate.getTime());
  return Math.min(100, Math.max(0, (used / total) * 100));
}

export type ProjectRow = {
  id: string;
  number: string;
  name: string;
  phase: string;
  health: string;
  budget: number;
  actual: number;
  variance: number;
  var_pct: number;
  revisedContract: number;
  approvedDelta: number;
  openRFIs: number;
  openCOs: number;
  wpPct: number;
  elapsedPct: number;
  raw: Record<string, unknown>;
};

type BuildProjectRowsInput = {
  projects: Record<string, unknown>[];
  costCodes: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  rfis: Record<string, unknown>[];
  changeOrders: Record<string, unknown>[];
  workPackages: Record<string, unknown>[];
  now: Date;
};

/** Per-project rollup for the status matrix and downstream KPIs. */
export function buildProjectRows(input: BuildProjectRowsInput): ProjectRow[] {
  const { projects, costCodes, expenses, rfis, changeOrders, workPackages, now } = input;
  return projects.map((p) => {
    const pCodes = costCodes.filter((c) => c.project_id === p.id);
    const pCodeTotals = computeCostCodeTotals(pCodes);
    const ccBudget = pCodeTotals.budget;
    const baseContract = Number(p.original_contract_value) || 0;
    const approvedDelta = changeOrders
      .filter((c) => c.project_id === p.id && String(c.status ?? "").trim() === "Approved")
      .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const revisedContract = baseContract + approvedDelta;
    const budget = ccBudget || revisedContract || baseContract;
    const pExpenses = expenses.filter((e) => e.project_id === p.id);
    // Canonical spend model (typed-in cost-code actuals win, paid expenses
    // fall back, unmapped expenses still count) — previously this summed ALL
    // non-voided expenses as "Actual" and let a single logged expense hide
    // typed-in actuals, so this report disagreed with Budget Control and the
    // Dashboard under the same label.
    const actual = resolveProjectSpend(
      pCodes as CostCodeLike[],
      pExpenses as ExpenseLike[],
    ).actual;
    const variance = budget > 0 ? actual - budget : 0;
    const var_pct = budget > 0 ? (variance / budget) * 100 : 0;
    const health = computeHealth(budget, actual);

    const pRFIs = rfis.filter((r) => r.project_id === p.id && isRfiOpen(r));
    const pCOs = changeOrders.filter((c) => c.project_id === p.id && isCoPending(c));
    const pWPs = workPackages.filter((w) => w.project_id === p.id);
    const wpTotal = pWPs.length;
    const wpPct =
      wpTotal > 0
        ? pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / wpTotal
        : 0;

    const startDate = p.start_date ? new Date(String(p.start_date)) : null;
    const targetDate = p.target_completion_date
      ? new Date(String(p.target_completion_date))
      : p.forecast_completion_date
        ? new Date(String(p.forecast_completion_date))
        : null;
    const elapsedPct = computeElapsedPct(startDate, targetDate, now);

    return {
      id: String(p.id),
      number: String(p.project_number || `P-${String(p.id).slice(0, 6)}`),
      name: String(p.name || "Untitled Project"),
      phase: String(p.phase || "Unknown"),
      health,
      budget,
      actual,
      variance,
      var_pct,
      revisedContract,
      approvedDelta,
      openRFIs: pRFIs.length,
      openCOs: pCOs.length,
      wpPct,
      elapsedPct,
      raw: p,
    };
  });
}

export function computePortfolioContract(projects: Record<string, unknown>[]): number {
  return projects.reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
}

export function computePortfolioRevised(projectRows: ProjectRow[]): number {
  return projectRows.reduce((s, r) => s + r.revisedContract, 0);
}

export function computeBudgetVariance(projectRows: ProjectRow[]): number {
  return projectRows.reduce((s, r) => s + r.variance, 0);
}

export function computeTonsProduced(workPackages: Record<string, unknown>[]): number {
  return workPackages
    .filter((w) => Number(w.percent_complete) >= 100 || w.status === "Complete")
    .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
}

export function computeTonsPlanned(workPackages: Record<string, unknown>[]): number {
  return workPackages.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
}

export function computePendingCOValue(
  pendingCOs: Record<string, unknown>[],
): number {
  return pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
}

export function computeCriticalAlertCount(
  openRFIs: Record<string, unknown>[],
  criticalRisks: Record<string, unknown>[],
  lateDeliveries: Record<string, unknown>[],
): number {
  const critRFIs = openRFIs.filter((r) => r.priority === "Critical").length;
  return critRFIs + criticalRisks.length + lateDeliveries.length;
}

export function computeHealthRollup(projectRows: ProjectRow[]) {
  const acc: Record<string, number> = { good: 0, watch: 0, risk: 0, neutral: 0 };
  for (const r of projectRows) acc[r.health] = (acc[r.health] || 0) + 1;
  return acc;
}

export function filterOpenRFIs(rfis: Record<string, unknown>[]) {
  return rfis.filter(isRfiOpen);
}

export function filterOverdueRFIs(
  openRFIs: Record<string, unknown>[],
  now: Date,
) {
  return openRFIs.filter(
    (r) => r.date_required && new Date(String(r.date_required)) < now,
  );
}

export function filterPendingCOs(changeOrders: Record<string, unknown>[]) {
  return changeOrders.filter(isCoPending);
}

export function filterOverdueActions(
  actionItems: Record<string, unknown>[],
  now: Date,
) {
  return actionItems.filter(
    (a) =>
      isActionItemOpen(a) && a.due_date && new Date(String(a.due_date)) < now,
  );
}

export function filterLateDeliveries(
  deliveries: Record<string, unknown>[],
  now: Date,
) {
  return deliveries.filter(
    (d) =>
      d.status !== "Delivered" &&
      d.status !== "Cancelled" &&
      d.scheduled_date &&
      new Date(String(d.scheduled_date)) < now,
  );
}

export function filterOpenRisks(risks: Record<string, unknown>[]) {
  return risks.filter((r) => !["Closed", "Mitigated"].includes(String(r.status)));
}

export function filterCriticalRisks(openRisks: Record<string, unknown>[]) {
  return openRisks.filter((r) => r.severity === "Critical");
}

export function filterActiveProjects(projects: Record<string, unknown>[]) {
  return projects.filter((p) => p.phase !== "Closeout");
}

export type FilterMatrixInput = {
  projectRows: ProjectRow[];
  kpiFilter: string | null;
  search: string;
  sortField: string;
  sortDir: "asc" | "desc";
  overdueActions: Record<string, unknown>[];
  criticalRisks: Record<string, unknown>[];
  openRFIs: Record<string, unknown>[];
  lateDeliveries: Record<string, unknown>[];
};

export function filterAndSortProjectRows(input: FilterMatrixInput): ProjectRow[] {
  const {
    projectRows,
    kpiFilter,
    search,
    sortField,
    sortDir,
    overdueActions,
    criticalRisks,
    openRFIs,
    lateDeliveries,
  } = input;

  let rows = [...projectRows];
  if (kpiFilter === "value") rows = rows.filter((r) => r.revisedContract > 0);
  else if (kpiFilter === "active") rows = rows.filter((r) => r.phase !== "Closeout");
  else if (kpiFilter === "rfis") rows = rows.filter((r) => r.openRFIs > 0);
  else if (kpiFilter === "cos") rows = rows.filter((r) => r.openCOs > 0);
  else if (kpiFilter === "variance") rows = rows.filter((r) => r.variance !== 0);
  else if (kpiFilter === "overdue") {
    const ids = new Set(overdueActions.map((a) => a.project_id));
    rows = rows.filter((r) => ids.has(r.id));
  } else if (kpiFilter === "risks") {
    const ids = new Set(criticalRisks.map((r) => r.project_id));
    rows = rows.filter((r) => ids.has(r.id));
  } else if (kpiFilter === "alerts") {
    const ids = new Set([
      ...openRFIs.filter((r) => r.priority === "Critical").map((r) => r.project_id),
      ...criticalRisks.map((r) => r.project_id),
      ...lateDeliveries.map((d) => d.project_id),
    ]);
    rows = rows.filter((r) => ids.has(r.id));
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.number.toLowerCase().includes(q) ||
        r.phase.toLowerCase().includes(q),
    );
  }
  rows.sort((a, b) => {
    let av: string | number = a[sortField as keyof ProjectRow] as string | number;
    let bv: string | number = b[sortField as keyof ProjectRow] as string | number;
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  return rows;
}

export function buildBarChartData(projectRows: ProjectRow[]) {
  return projectRows
    .filter((r) => r.budget > 0 || r.actual > 0)
    .slice(0, 12)
    .map((r) => ({ name: r.number, budget: r.budget, actual: r.actual }));
}

export function buildRfiDonutData(rfis: Record<string, unknown>[]) {
  const counts = {
    Open: rfis.filter((r) => r.status === "Open").length,
    "Under Review": rfis.filter((r) => r.status === "Under Review").length,
    Answered: rfis.filter((r) => r.status === "Answered").length,
    Closed: rfis.filter((r) => r.status === "Closed").length,
  };
  return [
    { label: "Open", value: counts.Open, color: "var(--status-warning)" },
    { label: "Under Review", value: counts["Under Review"], color: "var(--status-info)" },
    { label: "Answered", value: counts.Answered, color: "var(--status-success)" },
    { label: "Closed", value: counts.Closed, color: "var(--text-muted)" },
  ].filter((s) => s.value > 0);
}

export type DriftRow = ProjectRow & { drift: number };

export function buildDriftRows(projectRows: ProjectRow[]): DriftRow[] {
  return [...projectRows]
    .filter((r) => r.phase !== "Closeout")
    .map((r) => ({
      ...r,
      drift: (r.elapsedPct || 0) - (r.wpPct || 0),
    }))
    .sort((a, b) => b.drift - a.drift)
    .slice(0, 8);
}

export function computeTopRisks(openRisks: Record<string, unknown>[]) {
  return [...openRisks]
    .filter((r) => ["Critical", "High"].includes(String(r.severity)))
    .map((r) => ({
      ...r,
      _score: (Number(r.probability) || 0) * (Number(r.impact) || 0),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

export type WeeklyActivity = {
  newRFIs: number;
  closedRFIs: number;
  newCOs: number;
  approvedCOs: number;
  approvedCOValue: number;
  completedActions: number;
  recentDeliveries: number;
  weekStart: string;
  weekEnd: string;
};

export function computeWeeklyActivity(input: {
  rfis: Record<string, unknown>[];
  changeOrders: Record<string, unknown>[];
  actionItems: Record<string, unknown>[];
  deliveries: Record<string, unknown>[];
  now: Date;
}): WeeklyActivity {
  const { rfis, changeOrders, actionItems, deliveries, now } = input;
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const newRFIs = rfis.filter(
    (r) =>
      (r.created_at || r.created_date || r.submitted_date) &&
      new Date(String(r.created_at || r.created_date || r.submitted_date)) >= weekAgo,
  );
  const closedRFIs = rfis.filter(
    (r) =>
      r.status === "Closed" &&
      r.date_answered &&
      new Date(String(r.date_answered)) >= weekAgo,
  );
  const newCOs = changeOrders.filter(
    (c) =>
      (c.created_at || c.created_date) &&
      new Date(String(c.created_at || c.created_date)) >= weekAgo,
  );
  const approvedCOs = changeOrders.filter(
    (c) =>
      c.status === "Approved" &&
      c.approved_date &&
      new Date(String(c.approved_date)) >= weekAgo,
  );
  const approvedCOValue = approvedCOs.reduce(
    (s, c) => s + (Number(c.co_amount) || 0),
    0,
  );
  const completedActions = actionItems.filter(
    (a) =>
      ["Complete", "Closed", "Resolved"].includes(String(a.status)) &&
      a.updated_at &&
      String(a.updated_at) >= weekAgoIso,
  );
  const recentDeliveries = deliveries.filter(
    (d) =>
      d.status === "Delivered" &&
      d.actual_date &&
      new Date(String(d.actual_date)) >= weekAgo,
  );

  return {
    newRFIs: newRFIs.length,
    closedRFIs: closedRFIs.length,
    newCOs: newCOs.length,
    approvedCOs: approvedCOs.length,
    approvedCOValue,
    completedActions: completedActions.length,
    recentDeliveries: recentDeliveries.length,
    weekStart: formatPortfolioDate(weekAgo, { month: "short", day: "numeric" }),
    weekEnd: formatPortfolioDate(now),
  };
}
