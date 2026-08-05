/**
 * Pure helpers for Expenses page rollups / filters (shell-level).
 */
import { safeNum } from "./utils";

export type ExpenseLike = {
  id?: string;
  amount?: number | null;
  payment_status?: string | null;
  expense_date?: string | null;
  description?: string | null;
  expense_number?: string | null;
  vendor?: string | null;
  cost_code?: string | null;
  expense_type?: string | null;
  work_package_id?: string | null;
  [k: string]: unknown;
};

export function filterActiveExpenses<T extends ExpenseLike>(expenses: T[]): T[] {
  return (expenses || []).filter((e) => e.payment_status !== "Voided");
}

export function computeExpenseKpis(
  activeExpenses: ExpenseLike[],
  totalBudget: number,
) {
  const totalCommitted = activeExpenses.reduce((s, e) => s + safeNum(e.amount), 0);
  const paid = activeExpenses.filter((e) => e.payment_status === "Paid");
  const totalPaid = paid.reduce((s, e) => s + safeNum(e.amount), 0);
  const paidCount = paid.length;
  const totalRemaining = totalBudget - totalCommitted;
  const pctUsed = totalBudget > 0 ? Math.min(100, Math.round((totalCommitted / totalBudget) * 100)) : 0;
  const totalOutstanding = activeExpenses
    .filter((e) => e.payment_status === "Unpaid" || e.payment_status === "Pending Approval")
    .reduce((s, e) => s + safeNum(e.amount), 0);

  return {
    totalCommitted,
    totalPaid,
    paidCount,
    totalRemaining,
    pctUsed,
    totalOutstanding,
  };
}

export function remainingTone(totalRemaining: number, pctUsed: number): string {
  if (totalRemaining < 0) return "var(--status-error)";
  if (100 - pctUsed < 10) return "var(--status-warning)";
  return "var(--status-success)";
}

export function matchesDateRange(
  expenseDate: string | null | undefined,
  dateRangeFilter: string,
  now: Date,
): boolean {
  if (dateRangeFilter === "all") return true;
  if (!expenseDate) return false;
  const d = new Date(expenseDate);
  if (dateRangeFilter === "this_month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (dateRangeFilter === "last_30") return now.getTime() - d.getTime() <= 30 * 86400000;
  if (dateRangeFilter === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === now.getFullYear();
  }
  return true;
}

export function filterExpenses(
  expenses: ExpenseLike[],
  opts: {
    debouncedSearch: string;
    costCodeFilter: string;
    typeFilter: string;
    statusFilter: string;
    wpFilter: string;
    dateRangeFilter: string;
    now: Date;
  },
): ExpenseLike[] {
  const q = opts.debouncedSearch.toLowerCase();
  return (expenses || []).filter((e) => {
    const matchSearch =
      !q
      || e.description?.toLowerCase().includes(q)
      || e.expense_number?.toLowerCase().includes(q)
      || e.vendor?.toLowerCase().includes(q);
    const matchCC = opts.costCodeFilter === "all" || e.cost_code === opts.costCodeFilter;
    const matchType = opts.typeFilter === "all" || e.expense_type === opts.typeFilter;
    const matchStatus =
      opts.statusFilter === "all"
        ? true
        : opts.statusFilter === "_outstanding"
          ? e.payment_status === "Unpaid" || e.payment_status === "Pending Approval"
          : e.payment_status === opts.statusFilter;
    const matchWP = opts.wpFilter === "all" || e.work_package_id === opts.wpFilter;
    return (
      matchSearch
      && matchCC
      && matchType
      && matchStatus
      && matchWP
      && matchesDateRange(e.expense_date, opts.dateRangeFilter, opts.now)
    );
  });
}

export function pruneSelectedIds(
  current: string[],
  visibleIds: Set<string>,
): string[] {
  const next = current.filter((id) => visibleIds.has(id));
  return next.length === current.length && next.every((id, index) => id === current[index])
    ? current
    : next;
}

type CostCodeMeta = { code: string; name?: string; category?: string };

export function computeSpendByCostCode(
  activeExpenses: ExpenseLike[],
  costCodeCatalog: CostCodeMeta[],
) {
  const map: Record<string, number> = {};
  activeExpenses.forEach((e) => {
    if (!e.cost_code) return;
    map[e.cost_code] = (map[e.cost_code] || 0) + safeNum(e.amount);
  });
  const totalSpend = Object.values(map).reduce((s, v) => s + v, 0);
  return costCodeCatalog
    .filter((cc) => map[cc.code] > 0)
    .map((cc) => ({
      ...cc,
      spend: map[cc.code],
      pct: totalSpend > 0 ? Math.round((map[cc.code] / totalSpend) * 100) : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

export function computeCostCodeBudgetVsActual(
  activeExpenses: ExpenseLike[],
  costCodes: Array<{ cost_code_number?: string; code?: string; name?: string; category?: string; budget_amount?: unknown }>,
  costCodeCatalog: CostCodeMeta[],
) {
  const spendMap: Record<string, number> = {};
  activeExpenses.forEach((e) => {
    if (!e.cost_code) return;
    spendMap[e.cost_code] = (spendMap[e.cost_code] || 0) + safeNum(e.amount);
  });
  const items: Array<{
    code: string;
    name: string;
    category: string;
    budget: number;
    actual: number;
    pctUsed: number;
  }> = [];
  const seen = new Set<string>();
  costCodes.forEach((cc) => {
    const code = cc.cost_code_number || cc.code;
    if (!code || seen.has(code)) return;
    seen.add(code);
    const meta = costCodeCatalog.find((c) => c.code === code) || {};
    const budget = safeNum(cc.budget_amount);
    const actual = spendMap[code] || 0;
    if (budget > 0 || actual > 0) {
      items.push({
        code,
        name: (meta as CostCodeMeta).name || cc.name || code,
        category: (meta as CostCodeMeta).category || cc.category || "Misc.",
        budget,
        actual,
        pctUsed: budget > 0 ? Math.round((actual / budget) * 100) : actual > 0 ? 999 : 0,
      });
    }
  });
  Object.entries(spendMap).forEach(([code, actual]) => {
    if (seen.has(code)) return;
    const meta = costCodeCatalog.find((c) => c.code === code) || {};
    items.push({
      code,
      name: (meta as CostCodeMeta).name || code,
      category: (meta as CostCodeMeta).category || "Misc.",
      budget: 0,
      actual,
      pctUsed: 999,
    });
  });
  return items.sort((a, b) => b.actual - a.actual);
}

export function computeStatusBreakdown(expenses: ExpenseLike[]) {
  const map: Record<string, { count: number; total: number }> = {};
  (expenses || []).forEach((e) => {
    const s = e.payment_status || "Unknown";
    if (!map[s]) map[s] = { count: 0, total: 0 };
    map[s].count++;
    map[s].total += safeNum(e.amount);
  });
  return Object.entries(map)
    .map(([status, d]) => ({ status, ...d }))
    .sort((a, b) => b.total - a.total);
}

export function computeTopVendors(activeExpenses: ExpenseLike[], limit = 5) {
  const map: Record<string, number> = {};
  activeExpenses.forEach((e) => {
    const v = e.vendor?.trim() || "(No Vendor)";
    map[v] = (map[v] || 0) + safeNum(e.amount);
  });
  return Object.entries(map)
    .map(([vendor, total]) => ({ vendor, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function nextKpiFilterState(
  activeKPI: string | null,
  kpiKey: string,
): { activeKPI: string | null; statusFilter: string } {
  if (activeKPI === kpiKey) {
    return { activeKPI: null, statusFilter: "all" };
  }
  if (kpiKey === "paid") return { activeKPI: kpiKey, statusFilter: "Paid" };
  if (kpiKey === "outstanding") return { activeKPI: kpiKey, statusFilter: "_outstanding" };
  return { activeKPI: kpiKey, statusFilter: "all" };
}

export function toggleSelectedId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

export function toggleSelectAllIds(selected: string[], filteredIds: string[]): string[] {
  return selected.length === filteredIds.length ? [] : filteredIds;
}

export function filterVisibleAlerts<T extends { key?: string }>(
  alerts: T[],
  dismissedKeys: string[],
): T[] {
  const dismissed = new Set(dismissedKeys || []);
  return (alerts || []).filter((a) => a?.key != null && !dismissed.has(String(a.key)));
}

export function nextDismissedAlertKeys(
  dismissedKeys: string[],
  key: string,
): string[] {
  if ((dismissedKeys || []).includes(key)) return dismissedKeys;
  return [...(dismissedKeys || []), key];
}

export type BurndownPoint = { x: number; y: number };

/** Running remaining budget series for the burndown sparkline (non-voided, date-sorted). */
export function buildBurndownSeries(
  expenses: ExpenseLike[] | null | undefined,
  totalBudget: number,
): BurndownPoint[] {
  if (!expenses?.length || totalBudget <= 0) return [];
  const sorted = [...expenses]
    .filter((e) => e.payment_status !== "Voided")
    .sort(
      (a, b) =>
        new Date(a.expense_date as string).getTime()
        - new Date(b.expense_date as string).getTime(),
    );
  if (sorted.length === 0) return [];
  const points: BurndownPoint[] = [{ x: 0, y: totalBudget }];
  let running = totalBudget;
  sorted.forEach((e, i) => {
    running -= Number(e.amount) || 0;
    points.push({ x: i + 1, y: running });
  });
  return points;
}

export function burndownColor(remaining: number, totalBudget: number): string {
  const pctRemaining = totalBudget > 0 ? (remaining / totalBudget) * 100 : 0;
  if (pctRemaining < 10) return "var(--status-error)";
  if (pctRemaining < 20) return "var(--status-warning)";
  return "var(--status-success)";
}

export type MonthlySpendBucket = { key: string; label: string; total: number };

/** Last 6 calendar months of non-voided spend (labels from `now`). */
export function buildMonthlySpendTrend(
  expenses: ExpenseLike[] | null | undefined,
  now: Date = new Date(),
): MonthlySpendBucket[] {
  const months: MonthlySpendBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("default", { month: "short" }),
      total: 0,
    });
  }
  const active = (expenses || []).filter((e) => e.payment_status !== "Voided");
  active.forEach((e) => {
    if (!e.expense_date) return;
    const d = new Date(e.expense_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = months.find((mm) => mm.key === key);
    if (m) m.total += Number(e.amount) || 0;
  });
  return months;
}
