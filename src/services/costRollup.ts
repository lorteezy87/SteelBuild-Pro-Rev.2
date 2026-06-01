/**
 * costRollup.ts — the single source of truth for cost-code total rollups.
 *
 * The naive "sum the denormalized cost-code columns" reduction
 * (Σ budget_amount, Σ actual_cost, Σ committed_cost, Σ forecast_to_complete)
 * was re-implemented inline across CostDashboard, ExecutiveView, Expenses,
 * AIInsights, the report scorecards, and others — a §23 violation (duplicated
 * financial math). This centralizes that exact arithmetic so every surface
 * shows the same totals from one tested implementation.
 *
 * NOTE: this is the COLUMN rollup (trusts the denormalized cost_code columns).
 * The Budget Control page (Financials.jsx) deliberately uses a *different*,
 * expense-derived model for per-row actual/committed — that is intentional and
 * is NOT replaced here.
 */

export interface CostCodeLike {
  budget_amount?: number | string | null;
  actual_cost?: number | string | null;
  committed_cost?: number | string | null;
  forecast_to_complete?: number | string | null;
  [key: string]: unknown;
}

export interface CostCodeTotals {
  budget: number;
  actual: number;
  committed: number;
  forecast: number;
  /** actual − budget (positive = over budget). */
  variance: number;
  /** Estimate at completion: actual + forecast-to-complete. */
  eac: number;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum the cost-code column rollups across a set of cost codes. Returns zeros
 * for an empty/missing list. Pure + side-effect free.
 */
export function computeCostCodeTotals(codes: CostCodeLike[] | null | undefined): CostCodeTotals {
  let budget = 0;
  let actual = 0;
  let committed = 0;
  let forecast = 0;
  for (const c of codes || []) {
    if (!c) continue;
    budget += num(c.budget_amount);
    actual += num(c.actual_cost);
    committed += num(c.committed_cost);
    forecast += num(c.forecast_to_complete);
  }
  return {
    budget,
    actual,
    committed,
    forecast,
    variance: actual - budget,
    eac: actual + forecast,
  };
}
