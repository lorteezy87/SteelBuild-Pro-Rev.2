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
import type { PillTone } from "@/components/command";
import { downloadTextFile } from "@/lib/exports/fabRelease";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostCodeLikeForDeriv {
  id?: string | null;
  cost_code_number?: string | null;
  description?: string | null;
  phase?: string | null;
  budget_amount?: number | string | null;
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
        budget: num(c.budget_amount),
        actual: num(c.actual_cost),
        committed: num(c.committed_cost),
        variance: num(c.actual_cost) - num(c.budget_amount),
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
    (a, b) => num(b.budget_amount) - num(a.budget_amount),
  );
  let cumBudget = 0;
  let cumActual = 0;
  let cumCommitted = 0;
  return sorted.map((c) => {
    cumBudget += num(c.budget_amount);
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
  return CATEGORY_ORDER.map((cat: string) => {
    const catCodes = codes.filter((c) => c.phase === cat);
    const total = catCodes.reduce((s, c) => s + num(c.actual_cost), 0);
    return { name: cat, value: total };
  }).filter((d) => d.value > 0);
}

// Re-export for consumers that want the palette
export { CATEGORY_COLORS };

// ─── Decision panel builders ─────────────────────────────────────────────────

/**
 * Variance alerts: cost codes where actual > budget.
 * Sorted by overage descending.
 */
export function buildVarianceAlerts(
  codes: CostCodeLikeForDeriv[],
  contingency = 0,
): VarianceAlert[] {
  return codes
    .filter((c) => {
      const budget = num(c.budget_amount);
      const actual = num(c.actual_cost);
      return budget > 0 && actual > budget;
    })
    .map((c) => {
      const budget = num(c.budget_amount);
      const actual = num(c.actual_cost);
      const variance = actual - budget;
      const pctOver = budget > 0 ? ((actual - budget) / budget) * 100 : 0;
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
export function buildCoAging(cos: ChangeOrderLikeForDeriv[]): CoAgingRow[] {
  const today = new Date();
  return cos
    .map((co) => {
      const submitted = co.submitted_date ? new Date(co.submitted_date) : null;
      const daysOpen = submitted
        ? Math.floor((today.getTime() - submitted.getTime()) / 86400000)
        : null;
      return {
        id: co.id,
        co_number: co.co_number,
        title: co.title,
        status: co.status,
        co_amount: num(co.co_amount),
        daysOpen,
        isStale:
          daysOpen !== null &&
          daysOpen > 30 &&
          !["Approved", "Rejected", "Void"].includes(co.status ?? ""),
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

export const COST_CONTROL_CSV_HEADERS = [
  "Code",
  "Description",
  "Phase",
  "Budget",
  "Actual",
  "Committed",
  "Forecast",
  "EAC",
  "Variance",
  "% Used",
  "Status",
] as const;

export type CostControlCsvRow = {
  cost_code_number?: string | null;
  description?: string | null;
  phase?: string | null;
  revised_budget?: number | null;
  actual_cost?: number | null;
  committed_cost?: number | null;
  forecast_to_complete?: number | string | null;
  used_pct?: number | null;
  is_over?: boolean | null;
  [key: string]: unknown;
};

export function buildCostControlCsvRows(rows: CostControlCsvRow[]): Array<Array<string | number>> {
  return (rows || []).map((r) => {
    const v = Number(r.committed_cost || 0) - Number(r.revised_budget || 0);
    const eac = Number(r.actual_cost || 0) + Number(r.forecast_to_complete ?? 0);
    const used = Number(r.used_pct || 0);
    return [
      r.cost_code_number ?? "",
      r.description ?? "",
      r.phase ?? "",
      r.revised_budget ?? "",
      r.actual_cost ?? "",
      r.committed_cost ?? "",
      r.forecast_to_complete ?? 0,
      eac,
      v,
      `${used.toFixed(1)}%`,
      r.is_over ? "Over Budget" : used > 85 ? "Watch" : "On Track",
    ];
  });
}

export function buildCostControlCsvString(rows: CostControlCsvRow[]): string {
  return [COST_CONTROL_CSV_HEADERS as unknown as Array<string | number>, ...buildCostControlCsvRows(rows)]
    .map((row) => row.map((c) => `"${c ?? ""}"`).join(","))
    .join("\n");
}

/** Side-effect CSV download for Cost Control Center table. */
export function downloadCostControlCsv(
  rows: CostControlCsvRow[],
  filename = "cost_control_center.csv",
): void {
  downloadTextFile(
    buildCostControlCsvString(rows),
    filename,
    "text/csv;charset=utf-8",
  );
}

export function filterCostCodeRows<
  T extends {
    phase?: string | null;
    is_over?: boolean | null;
    cost_code_number?: string | null;
    description?: string | null;
  },
>(
  costCodeRows: T[],
  opts: { search?: string; phaseFilter?: string; overBudgetOnly?: boolean } = {},
): T[] {
  const q = (opts.search || "").trim().toLowerCase();
  const phaseFilter = opts.phaseFilter ?? "All";
  return (costCodeRows || []).filter((r) => {
    if (phaseFilter !== "All" && r.phase !== phaseFilter) return false;
    if (opts.overBudgetOnly && !r.is_over) return false;
    if (q) {
      return (
        (r.cost_code_number ?? "").toLowerCase().includes(q)
        || (r.description ?? "").toLowerCase().includes(q)
        || (r.phase ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });
}
