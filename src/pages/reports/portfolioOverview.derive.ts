import { formatCurrencyShort } from "@/components/shared/formatters";
import { isActionItemOpen, isCoPending, isRfiOpen } from "@/lib/entityPredicates";
import { computeCostCodeTotals } from "@/services/costRollup";
import { computeHealth } from "./utils";

export interface SoftDeleteRow {
  is_deleted?: boolean | null;
}

export interface PortfolioProject extends SoftDeleteRow {
  id?: string | null;
  name?: string | null;
  project_number?: string | null;
  phase?: string | null;
  original_contract_value?: number | string | null;
  start_date?: string | null;
  target_completion_date?: string | null;
  forecast_completion_date?: string | null;
}

export interface PortfolioRfi extends SoftDeleteRow {
  id?: string | null;
  project_id?: string | null;
  status?: string | null;
  date_required?: string | null;
  created_at?: string | null;
  created_date?: string | null;
  submitted_date?: string | null;
  date_answered?: string | null;
  priority?: string | null;
  rfi_number?: string | null;
  title?: string | null;
  subject?: string | null;
  question?: string | null;
}

export interface PortfolioChangeOrder extends SoftDeleteRow {
  id?: string | null;
  project_id?: string | null;
  status?: string | null;
  co_amount?: number | string | null;
  title?: string | null;
  description?: string | null;
  co_number?: string | null;
  created_at?: string | null;
  created_date?: string | null;
  approved_date?: string | null;
}

export interface PortfolioActionItem extends SoftDeleteRow {
  id?: string | null;
  project_id?: string | null;
  status?: string | null;
  due_date?: string | null;
  updated_at?: string | null;
}

export interface PortfolioDelivery extends SoftDeleteRow {
  id?: string | null;
  project_id?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  actual_date?: string | null;
  po_number?: string | null;
  vendor?: string | null;
  description?: string | null;
}

export interface PortfolioWorkPackage extends SoftDeleteRow {
  id?: string | null;
  project_id?: string | null;
  status?: string | null;
  percent_complete?: number | string | null;
  tonnage?: number | string | null;
}

export interface PortfolioCostCode extends SoftDeleteRow {
  [key: string]: unknown;
  id?: string | null;
  project_id?: string | null;
  budget_amount?: number | string | null;
  actual_cost?: number | string | null;
  committed_cost?: number | string | null;
  forecast_to_complete?: number | string | null;
}

export interface PortfolioExpense extends SoftDeleteRow {
  id?: string | null;
  project_id?: string | null;
  payment_status?: string | null;
  amount?: number | string | null;
}

export interface PortfolioRisk extends SoftDeleteRow {
  id?: string | null;
  project_id?: string | null;
  status?: string | null;
  severity?: string | null;
  probability?: number | string | null;
  impact?: number | string | null;
  title?: string | null;
  category?: string | null;
}

export type PortfolioHealth = "good" | "watch" | "risk" | "neutral";

export interface PortfolioProjectRow {
  id: string;
  number: string;
  name: string;
  phase: string;
  health: PortfolioHealth;
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
  raw: PortfolioProject;
}

export interface PortfolioBarChartDatum {
  name: string;
  budget: number;
  actual: number;
}

export interface PortfolioDonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface PortfolioRiskWithScore extends PortfolioRisk {
  _score: number;
}

export type PortfolioUrgency = "critical" | "high" | "medium" | "low";
export type PortfolioDestinationPage = "RFIs" | "ChangeOrders" | "Deliveries";

export interface PortfolioUrgentItem {
  kind: "RFI" | "CO" | "DELIVERY";
  title: string;
  subtitle: string;
  severity: PortfolioUrgency;
  meta: string;
  page: PortfolioDestinationPage;
}

export interface PortfolioWeeklySummary {
  newRFIs: number;
  closedRFIs: number;
  newCOs: number;
  approvedCOs: number;
  approvedCOValue: number;
  completedActions: number;
  recentDeliveries: number;
  weekStart: string;
  weekEnd: string;
}

export type PortfolioKpiFilter =
  | "value"
  | "active"
  | "rfis"
  | "cos"
  | "variance"
  | "overdue"
  | "risks"
  | "alerts"
  | null;

export type PortfolioSortField = keyof Pick<
  PortfolioProjectRow,
  "number" | "name" | "phase" | "health" | "budget" | "actual" | "variance" | "openRFIs" | "openCOs" | "wpPct"
>;

export interface PortfolioHealthRollup {
  good: number;
  watch: number;
  risk: number;
  neutral: number;
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isBeforeNow(value: string | null | undefined, now: Date): boolean {
  return Boolean(value) && new Date(value as string) < now;
}

function findProjectName(projects: readonly PortfolioProject[], projectId: string | null | undefined): string {
  return projects.find((project) => project.id === projectId)?.name || "";
}

function formatShortDate(value: Date): string {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLongDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function filterSoftDeleted<T extends SoftDeleteRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => !row?.is_deleted);
}

export function selectOpenRfis(rfis: readonly PortfolioRfi[]): PortfolioRfi[] {
  return rfis.filter(isRfiOpen);
}

export function selectOverdueRfis(openRfis: readonly PortfolioRfi[], now: Date): PortfolioRfi[] {
  return openRfis.filter((rfi) => isBeforeNow(rfi.date_required, now));
}

export function selectPendingChangeOrders(
  changeOrders: readonly PortfolioChangeOrder[],
): PortfolioChangeOrder[] {
  return changeOrders.filter(isCoPending);
}

export function sumPendingChangeOrderValue(
  pendingChangeOrders: readonly PortfolioChangeOrder[],
): number {
  return pendingChangeOrders.reduce((sum, changeOrder) => sum + toNumber(changeOrder.co_amount), 0);
}

export function selectOverdueActionItems(
  actionItems: readonly PortfolioActionItem[],
  now: Date,
): PortfolioActionItem[] {
  return actionItems.filter(
    (actionItem) => isActionItemOpen(actionItem) && isBeforeNow(actionItem.due_date, now),
  );
}

export function selectLateDeliveries(
  deliveries: readonly PortfolioDelivery[],
  now: Date,
): PortfolioDelivery[] {
  return deliveries.filter(
    (delivery) =>
      delivery.status !== "Delivered" &&
      delivery.status !== "Cancelled" &&
      isBeforeNow(delivery.scheduled_date, now),
  );
}

export function selectOpenRisks(risks: readonly PortfolioRisk[]): PortfolioRisk[] {
  return risks.filter((risk) => !["Closed", "Mitigated"].includes(risk.status ?? ""));
}

export function selectCriticalRisks(risks: readonly PortfolioRisk[]): PortfolioRisk[] {
  return risks.filter((risk) => risk.severity === "Critical");
}

export function selectActiveProjects(projects: readonly PortfolioProject[]): PortfolioProject[] {
  return projects.filter((project) => project.phase !== "Closeout");
}

export function buildProjectRows(args: {
  projects: readonly PortfolioProject[];
  costCodes: readonly PortfolioCostCode[];
  expenses: readonly PortfolioExpense[];
  rfis: readonly PortfolioRfi[];
  changeOrders: readonly PortfolioChangeOrder[];
  workPackages: readonly PortfolioWorkPackage[];
  now: Date;
}): PortfolioProjectRow[] {
  const { projects, costCodes, expenses, rfis, changeOrders, workPackages, now } = args;
  return projects.map((project) => {
    const projectCodes = costCodes.filter((costCode) => costCode.project_id === project.id);
    const projectCodeTotals = computeCostCodeTotals(projectCodes);
    const costCodeBudget = projectCodeTotals.budget;
    const baseContract = toNumber(project.original_contract_value);
    const approvedDelta = changeOrders
      .filter((changeOrder) => changeOrder.project_id === project.id && changeOrder.status === "Approved")
      .reduce((sum, changeOrder) => sum + toNumber(changeOrder.co_amount), 0);
    const revisedContract = baseContract + approvedDelta;
    const budget = costCodeBudget || revisedContract || baseContract;

    const projectExpenses = expenses.filter(
      (expense) => expense.project_id === project.id && expense.payment_status !== "Voided",
    );
    const expenseActual = projectExpenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const costCodeActual = projectCodeTotals.actual;
    const actual = expenseActual > 0 ? expenseActual : costCodeActual;
    const variance = budget > 0 ? actual - budget : 0;
    const var_pct = budget > 0 ? (variance / budget) * 100 : 0;
    const health = computeHealth(budget, actual) as PortfolioHealth;

    const projectRfis = rfis.filter((rfi) => rfi.project_id === project.id && isRfiOpen(rfi));
    const projectChangeOrders = changeOrders.filter(
      (changeOrder) => changeOrder.project_id === project.id && isCoPending(changeOrder),
    );
    const projectWorkPackages = workPackages.filter((workPackage) => workPackage.project_id === project.id);
    const workPackageCount = projectWorkPackages.length;
    const wpPct =
      workPackageCount > 0
        ? projectWorkPackages.reduce(
            (sum, workPackage) => sum + toNumber(workPackage.percent_complete),
            0,
          ) / workPackageCount
        : 0;

    const startDate = project.start_date ? new Date(project.start_date) : null;
    const targetDate = project.target_completion_date
      ? new Date(project.target_completion_date)
      : project.forecast_completion_date
        ? new Date(project.forecast_completion_date)
        : null;
    let elapsedPct = 0;
    if (startDate && targetDate && targetDate > startDate) {
      const totalDuration = targetDate.getTime() - startDate.getTime();
      const elapsedDuration = Math.max(0, now.getTime() - startDate.getTime());
      elapsedPct = Math.min(100, Math.max(0, (elapsedDuration / totalDuration) * 100));
    }

    const projectId = project.id || "";
    return {
      id: projectId,
      number: project.project_number || `P-${projectId.slice(0, 6)}`,
      name: project.name || "Untitled Project",
      phase: project.phase || "Unknown",
      health,
      budget,
      actual,
      variance,
      var_pct,
      revisedContract,
      approvedDelta,
      openRFIs: projectRfis.length,
      openCOs: projectChangeOrders.length,
      wpPct,
      elapsedPct,
      raw: project,
    };
  });
}

export function sumPortfolioContract(projects: readonly PortfolioProject[]): number {
  return projects.reduce((sum, project) => sum + toNumber(project.original_contract_value), 0);
}

export function sumPortfolioRevised(projectRows: readonly PortfolioProjectRow[]): number {
  return projectRows.reduce((sum, projectRow) => sum + projectRow.revisedContract, 0);
}

export function sumBudgetVariance(projectRows: readonly PortfolioProjectRow[]): number {
  return projectRows.reduce((sum, projectRow) => sum + projectRow.variance, 0);
}

export function sumProducedTonnage(workPackages: readonly PortfolioWorkPackage[]): number {
  return workPackages
    .filter(
      (workPackage) =>
        toNumber(workPackage.percent_complete) >= 100 || workPackage.status === "Complete",
    )
    .reduce((sum, workPackage) => sum + toNumber(workPackage.tonnage), 0);
}

export function sumPlannedTonnage(workPackages: readonly PortfolioWorkPackage[]): number {
  return workPackages.reduce((sum, workPackage) => sum + toNumber(workPackage.tonnage), 0);
}

export function countCriticalAlerts(args: {
  openRfis: readonly PortfolioRfi[];
  criticalRisks: readonly PortfolioRisk[];
  lateDeliveries: readonly PortfolioDelivery[];
}): number {
  const { openRfis, criticalRisks, lateDeliveries } = args;
  const criticalRfis = openRfis.filter((rfi) => rfi.priority === "Critical").length;
  return criticalRfis + criticalRisks.length + lateDeliveries.length;
}

export function buildHealthRollup(
  projectRows: readonly PortfolioProjectRow[],
): PortfolioHealthRollup {
  const accumulator: PortfolioHealthRollup = {
    good: 0,
    watch: 0,
    risk: 0,
    neutral: 0,
  };
  for (const projectRow of projectRows) {
    accumulator[projectRow.health] += 1;
  }
  return accumulator;
}

export function filterAndSortProjectRows(args: {
  projectRows: readonly PortfolioProjectRow[];
  kpiFilter: PortfolioKpiFilter;
  search: string;
  sortField: PortfolioSortField;
  sortDir: "asc" | "desc";
  overdueActions: readonly PortfolioActionItem[];
  criticalRisks: readonly PortfolioRisk[];
  openRfis: readonly PortfolioRfi[];
  lateDeliveries: readonly PortfolioDelivery[];
}): PortfolioProjectRow[] {
  const {
    projectRows,
    kpiFilter,
    search,
    sortField,
    sortDir,
    overdueActions,
    criticalRisks,
    openRfis,
    lateDeliveries,
  } = args;
  let rows = [...projectRows];
  if (kpiFilter === "value") rows = rows.filter((row) => row.revisedContract > 0);
  else if (kpiFilter === "active") rows = rows.filter((row) => row.phase !== "Closeout");
  else if (kpiFilter === "rfis") rows = rows.filter((row) => row.openRFIs > 0);
  else if (kpiFilter === "cos") rows = rows.filter((row) => row.openCOs > 0);
  else if (kpiFilter === "variance") rows = rows.filter((row) => row.variance !== 0);
  else if (kpiFilter === "overdue") {
    const ids = new Set(overdueActions.map((actionItem) => actionItem.project_id));
    rows = rows.filter((row) => ids.has(row.id));
  } else if (kpiFilter === "risks") {
    const ids = new Set(criticalRisks.map((risk) => risk.project_id));
    rows = rows.filter((row) => ids.has(row.id));
  } else if (kpiFilter === "alerts") {
    const ids = new Set([
      ...openRfis.filter((rfi) => rfi.priority === "Critical").map((rfi) => rfi.project_id),
      ...criticalRisks.map((risk) => risk.project_id),
      ...lateDeliveries.map((delivery) => delivery.project_id),
    ]);
    rows = rows.filter((row) => ids.has(row.id));
  }

  if (search.trim()) {
    const query = search.trim().toLowerCase();
    rows = rows.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.number.toLowerCase().includes(query) ||
        row.phase.toLowerCase().includes(query),
    );
  }

  rows.sort((a, b) => {
    let aValue: string | number = a[sortField];
    let bValue: string | number = b[sortField];
    if (typeof aValue === "string") aValue = aValue.toLowerCase();
    if (typeof bValue === "string") bValue = bValue.toLowerCase();
    if (aValue < bValue) return sortDir === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return rows;
}

export function buildBarChartData(
  projectRows: readonly PortfolioProjectRow[],
): PortfolioBarChartDatum[] {
  return projectRows
    .filter((projectRow) => projectRow.budget > 0 || projectRow.actual > 0)
    .slice(0, 12)
    .map((projectRow) => ({
      name: projectRow.number,
      budget: projectRow.budget,
      actual: projectRow.actual,
    }));
}

export function buildRfiDonutData(
  rfis: readonly PortfolioRfi[],
): PortfolioDonutSegment[] {
  const counts = {
    Open: rfis.filter((rfi) => rfi.status === "Open").length,
    "Under Review": rfis.filter((rfi) => rfi.status === "Under Review").length,
    Answered: rfis.filter((rfi) => rfi.status === "Answered").length,
    Closed: rfis.filter((rfi) => rfi.status === "Closed").length,
  };
  return [
    { label: "Open", value: counts.Open, color: "var(--status-warning)" },
    { label: "Under Review", value: counts["Under Review"], color: "var(--status-info)" },
    { label: "Answered", value: counts.Answered, color: "var(--status-success)" },
    { label: "Closed", value: counts.Closed, color: "var(--text-muted)" },
  ].filter((segment) => segment.value > 0);
}

export function buildDriftRows(
  projectRows: readonly PortfolioProjectRow[],
): Array<PortfolioProjectRow & { drift: number }> {
  return [...projectRows]
    .filter((projectRow) => projectRow.phase !== "Closeout")
    .map((projectRow) => ({
      ...projectRow,
      drift: (projectRow.elapsedPct || 0) - (projectRow.wpPct || 0),
    }))
    .sort((a, b) => b.drift - a.drift)
    .slice(0, 8);
}

export function buildUrgentItems(
  args: {
    overdueRfis: readonly PortfolioRfi[];
    pendingChangeOrders: readonly PortfolioChangeOrder[];
    lateDeliveries: readonly PortfolioDelivery[];
    projects: readonly PortfolioProject[];
  },
): PortfolioUrgentItem[] {
  const { overdueRfis, pendingChangeOrders, lateDeliveries, projects } = args;
  const items: PortfolioUrgentItem[] = [];
  overdueRfis.slice(0, 6).forEach((rfi) => {
    items.push({
      kind: "RFI",
      title: rfi.rfi_number || rfi.title || "RFI",
      subtitle: rfi.title || rfi.subject || rfi.question || "Overdue response",
      severity:
        rfi.priority === "Critical"
          ? "critical"
          : rfi.priority === "High"
            ? "high"
            : "medium",
      meta: findProjectName(projects, rfi.project_id),
      page: "RFIs",
    });
  });
  pendingChangeOrders.slice(0, 4).forEach((changeOrder) => {
    items.push({
      kind: "CO",
      title: changeOrder.co_number || "CO",
      subtitle: `${changeOrder.title || changeOrder.description || "Change order"} · ${formatCurrencyShort(changeOrder.co_amount)}`,
      severity: toNumber(changeOrder.co_amount) > 50000 ? "high" : "medium",
      meta: findProjectName(projects, changeOrder.project_id),
      page: "ChangeOrders",
    });
  });
  lateDeliveries.slice(0, 4).forEach((delivery) => {
    items.push({
      kind: "DELIVERY",
      title: delivery.po_number || delivery.vendor || "Delivery",
      subtitle: delivery.description || delivery.vendor || "Late delivery",
      severity: "high",
      meta: findProjectName(projects, delivery.project_id),
      page: "Deliveries",
    });
  });
  return items;
}

export function buildTopRisks(
  openRisks: readonly PortfolioRisk[],
): PortfolioRiskWithScore[] {
  return [...openRisks]
    .filter((risk) => ["Critical", "High"].includes(risk.severity ?? ""))
    .map((risk) => ({
      ...risk,
      _score: toNumber(risk.probability) * toNumber(risk.impact),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

export function buildWeeklySummary(args: {
  rfis: readonly PortfolioRfi[];
  changeOrders: readonly PortfolioChangeOrder[];
  actionItems: readonly PortfolioActionItem[];
  deliveries: readonly PortfolioDelivery[];
  now: Date;
}): PortfolioWeeklySummary {
  const { rfis, changeOrders, actionItems, deliveries, now } = args;
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const newRfis = rfis.filter(
    (rfi) =>
      Boolean(rfi.created_at || rfi.created_date || rfi.submitted_date) &&
      new Date(rfi.created_at || rfi.created_date || rfi.submitted_date || "") >= weekAgo,
  );
  const closedRfis = rfis.filter(
    (rfi) =>
      rfi.status === "Closed" &&
      Boolean(rfi.date_answered) &&
      new Date(rfi.date_answered || "") >= weekAgo,
  );
  const newChangeOrders = changeOrders.filter(
    (changeOrder) =>
      Boolean(changeOrder.created_at || changeOrder.created_date) &&
      new Date(changeOrder.created_at || changeOrder.created_date || "") >= weekAgo,
  );
  const approvedChangeOrders = changeOrders.filter(
    (changeOrder) =>
      changeOrder.status === "Approved" &&
      Boolean(changeOrder.approved_date) &&
      new Date(changeOrder.approved_date || "") >= weekAgo,
  );
  const approvedCOValue = approvedChangeOrders.reduce(
    (sum, changeOrder) => sum + toNumber(changeOrder.co_amount),
    0,
  );
  const completedActions = actionItems.filter(
    (actionItem) =>
      ["Complete", "Closed", "Resolved"].includes(actionItem.status ?? "") &&
      Boolean(actionItem.updated_at) &&
      actionItem.updated_at >= weekAgoIso,
  );
  const recentDeliveries = deliveries.filter(
    (delivery) =>
      delivery.status === "Delivered" &&
      Boolean(delivery.actual_date) &&
      new Date(delivery.actual_date || "") >= weekAgo,
  );

  return {
    newRFIs: newRfis.length,
    closedRFIs: closedRfis.length,
    newCOs: newChangeOrders.length,
    approvedCOs: approvedChangeOrders.length,
    approvedCOValue,
    completedActions: completedActions.length,
    recentDeliveries: recentDeliveries.length,
    weekStart: formatShortDate(weekAgo),
    weekEnd: formatLongDate(now),
  };
}
