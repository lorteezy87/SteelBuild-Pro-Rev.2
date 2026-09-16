/**
 * costControlCenter.derive.ts
 *
 * Pure derivation functions for the Cost Control Center (canonical presentation redesign).
 * No React, no network. Lifted from CostDashboard.jsx and made fully testable.
 *
 * Money is FLOAT DOLLARS (same as CostDashboard — the integer-cents convention
 * is ONLY for the pay-app repo/billing layer). Do NOT convert.
 *
 * Lifted chart derivations match CostDashboard byte-for-byte in math so both
 * surfaces show identical numbers.
 */
import { COST_CODES, CATEGORY_COLORS, CATEGORY_ORDER } from "@/components/shared/costCodes";
import { isCoApproved, isCoRejected } from "@/lib/entityPredicates";
import { diffCalendarDays } from "@/lib/workingDays";
import type { PillTone } from "@/components/command";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostCodeLikeForDeriv {
  id?: string | null;
  cost_code_number?: string | null;
  description?: string | null;
  phase?: string | null;
  budget_amount?: number | string | null;
  /** Present on useFinancials' CostCodeRow: budget_amount + approved COs. */
  revised_budget?: number | string | null;
  actual_cost?: number | string | null;
  committed_cost?: number | string | null;
  forecast_to_complete?: number | string | null;
  [key: string]: unknown;
}

export interface ChangeOrderLikeForDeriv {
  id?: string | null;
  co_number?: string | null;
  title?: string | null;
  status?: string | null;
  co_amount?: number | string | null;
  submitted_date?: string | null;
  [key: string]: unknown;
}

export interface BarChartDatum {
  code: string;
  name: string;
  label: string;
  budget: number;
  actual: number;
  committed: number;
  variance: number;
}

export interface CumulativeDatum {
  name: string;
  budget: number;
  actual: number;
  committed: number;
}

export interface PieDatum {
  name: string;
  value: number;
}

export interface VarianceAlert {
  id: string | null | undefined;
  code: string | null | undefined;
  description: string | null | undefined;
  phase: string | null | undefined;
  /** committed − revised budget (positive = over). */
  variance: number;
  pctOver: number;
  exceedsContingency: boolean;
}

export interface CoAgingRow {
  id: string | null | undefined;
  co_number: string | null | undefined;
  title: string | null | undefined;
  status: string | null | undefined;
  co_amount: number;
  daysOpen: number | null;
  isStale: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A row's budget for chart + variance math: the revised budget when the caller
 * passed rows from useFinancials (budget_amount + approved COs on that code),
 * else the raw column. The charts and the table beneath them must scale to the
 * same budget or the bars contradict the numbers.
 */
function budgetOf(c: CostCodeLikeForDeriv): number {
  return c.revised_budget != null ? num(c.revised_budget) : num(c.budget_amount);
}

// ─── Chart data ─────────────────────────────────────────────────────────────

/**
 * Per-cost-code bar data for Budget vs Actual vs Committed.
 * Lifted byte-for-byte from CostDashboard.jsx `barChartData` useMemo.
 */
export function buildBarChartData(codes: CostCodeLikeForDeriv[]): BarChartDatum[] {
  return codes
    .map((c) => {
      const cc = COST_CODES.find((x: { code: string; name: string }) => x.code === c.cost_code_number);
      return {
        code: c.cost_code_number ?? "",
        name: cc?.name || c.description || c.cost_code_number || "",
        label: `${c.cost_code_number}`,
        budget: budgetOf(c),
        actual: num(c.actual_cost),
        committed: num(c.committed_cost),
        variance: num(c.committed_cost) - budgetOf(c),
      };
    })
    .filter((d) => d.budget > 0 || d.actual > 0 || d.committed > 0)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Cumulative spend curve sorted by budget descending (largest first).
 * Lifted byte-for-byte from CostDashboard.jsx `cumulativeData` useMemo.
 */
export function buildCumulativeData(codes: CostCodeLikeForDeriv[]): CumulativeDatum[] {
  const sorted = [...codes].sort(
    // Ties broke arbitrarily (Array#sort is only stable per-engine for the
    // input order), so two equal-budget codes could swap places between
    // renders and visibly reorder the curve. Code number is the tiebreak.
    (a, b) =>
      budgetOf(b) - budgetOf(a) ||
      (a.cost_code_number ?? "").localeCompare(b.cost_code_number ?? ""),
  );
  let cumBudget = 0;
  let cumActual = 0;
  let cumCommitted = 0;
  return sorted.map((c) => {
    cumBudget += budgetOf(c);
    cumActual += num(c.actual_cost);
    cumCommitted += num(c.committed_cost);
    return {
      name: c.cost_code_number ?? "",
      budget: cumBudget,
      actual: cumActual,
      committed: cumCommitted,
    };
  });
}

/**
 * Spend by category (actual_cost only) for the PieChart.
 * Uses CATEGORY_ORDER + CATEGORY_COLORS from costCodes.jsx.
 * Lifted byte-for-byte from CostDashboard.jsx `categoryPieData` useMemo.
 */
export function buildCategoryPieData(codes: CostCodeLikeForDeriv[]): PieDatum[] {
  // A code's category: its own `phase` when set, else the catalog's category
  // for that number. Matching on `phase` ALONE dropped every code with a null
  // or off-vocabulary phase, so the donut's slices summed to less than the
  // "Actual" KPI beside it with nothing on screen to explain the gap. What
  // still can't be categorised is shown as Unassigned rather than discarded.
  const buckets = new Map<string, number>(CATEGORY_ORDER.map((c: string) => [c, 0]));
  const UNASSIGNED = "Unassigned";
  for (const c of codes) {
    const actual = num(c.actual_cost);
    if (actual === 0) continue;
    const phase = String(c.phase ?? "").trim();
    const catalog = COST_CODES.find(
      (x: { code: string; category: string }) => x.code === c.cost_code_number,
    )?.category;
    const key = buckets.has(phase) ? phase : (catalog && buckets.has(catalog) ? catalog : UNASSIGNED);
    buckets.set(key, (buckets.get(key) ?? 0) + actual);
  }
  return [...CATEGORY_ORDER, UNASSIGNED]
    .map((name: string) => ({ name, value: buckets.get(name) ?? 0 }))
    .filter((d) => d.value > 0);
}

// Re-export for consumers that want the palette
export { CATEGORY_COLORS };

// ─── Decision panel builders ─────────────────────────────────────────────────

/**
 * Variance alerts: cost codes that are over budget.
 *
 * "Over budget" is COMMITTED vs REVISED budget — the same test as
 * `CostCodeRow.is_over` in useFinancials, which drives the Over Budget chip,
 * the row filter, the status pill and the Margin at Risk panel. This compared
 * `actual_cost` against raw `budget_amount` instead, so on any project with an
 * approved change order or an unpaid commitment the Cost Control Flags panel
 * listed a different set of codes than the table beneath it called over budget.
 *
 * Sorted by overage descending.
 */
export function buildVarianceAlerts(
  codes: CostCodeLikeForDeriv[],
  contingency = 0,
): VarianceAlert[] {
  return codes
    .filter((c) => {
      const budget = budgetOf(c);
      return budget > 0 && num(c.committed_cost) > budget;
    })
    .map((c) => {
      const budget = budgetOf(c);
      const committed = num(c.committed_cost);
      const variance = committed - budget;
      const pctOver = budget > 0 ? (variance / budget) * 100 : 0;
      return {
        id: c.id,
        code: c.cost_code_number,
        description: c.description,
        phase: c.phase,
        variance,
        pctOver,
        exceedsContingency: contingency > 0 && variance > contingency,
      };
    })
    .sort((a, b) => b.variance - a.variance);
}

/**
 * Change order aging: all COs with daysOpen computed and stale flag.
 * A CO is stale when it is open >30 days (not Approved/Rejected/Void).
 * Sorted by daysOpen descending.
 */
export function buildCoAging(cos: ChangeOrderLikeForDeriv[], today: Date = new Date()): CoAgingRow[] {
  // Local calendar day on both sides. `new Date("2026-07-03")` is UTC midnight,
  // which in Arizona (UTC-7) is 17:00 the previous local day, so differencing it
  // against a local `new Date()` aged every CO by an extra day — enough to trip
  // the >30d stale flag a day early. diffCalendarDays anchors at local noon.
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return cos
    .map((co) => {
      const daysOpen = co.submitted_date ? diffCalendarDays(co.submitted_date, todayIso) : null;
      // Terminal = decided. Trimmed via the canonical predicates, so a status
      // stored as " Approved " stops being counted as an open, aging CO.
      const terminal = isCoApproved(co) || isCoRejected(co);
      return {
        id: co.id,
        co_number: co.co_number,
        title: co.title,
        status: co.status,
        co_amount: num(co.co_amount),
        daysOpen,
        isStale: daysOpen !== null && daysOpen > 30 && !terminal,
      };
    })
    .sort((a, b) => (b.daysOpen ?? 0) - (a.daysOpen ?? 0));
}

// ─── Status tone ─────────────────────────────────────────────────────────────

/**
 * Map a CostCodeRow's health state to a PillTone.
 * is_over → danger, used_pct > 85 → warn, else good.
 */
export function costStatusTone(row: {
  is_over?: boolean;
  used_pct?: number;
}): PillTone {
  if (row.is_over) return "danger";
  if ((row.used_pct ?? 0) > 85) return "warn";
  return "good";
}
