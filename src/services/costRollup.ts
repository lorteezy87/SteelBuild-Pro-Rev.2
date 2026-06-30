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
 * NOTE: computeCostCodeTotals here is the COLUMN rollup (sums the denormalized
 * cost_code columns). Per-row actual/committed on the cost pages instead use
 * preferManualActual() (below) — a typed-in column figure wins, else the
 * expense rollup — shared by Cost Control Center, Cost Dashboard, and Budget
 * Control so all three agree.
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
 * Resolve a cost code's effective actual (or committed): a manually-entered
 * figure typed onto the cost code (the column) WINS when set (> 0); otherwise
 * the value rolled up from its expenses is used. Never sums the two — no
 * double-counting. User-chosen model 2026-06-30 ("typed-in number wins, fall
 * back to expenses"). Shared so Cost Control Center, Cost Dashboard, and Budget
 * Control all resolve per-code actual/committed identically.
 */
export function preferManualActual(manualColumn: unknown, expenseRollup: number): number {
  const manual = num(manualColumn);
  return manual > 0 ? manual : expenseRollup;
}

export interface ProjectContractLike {
  original_contract_value?: number | string | null;
  [key: string]: unknown;
}

export interface ChangeOrderLike {
  status?: string | null;
  co_amount?: number | string | null;
  [key: string]: unknown;
}

/**
 * Revised contract value = original_contract_value + Σ approved change-order
 * amounts. This is the ONE definition of "current contract value" — there is
 * no revised_contract_value column on projects (reads of it always returned
 * undefined and silently fell back to the original contract, so Budget
 * Control / the CO-impact KPI understated the contract vs. ChangeOrders /
 * ContractManagement / CostDashboard, which each re-implemented this sum
 * inline). Status matching mirrors ContractManagement: trimmed, exact
 * "Approved" (pending/rejected/draft COs do not move the contract).
 */
export function computeRevisedContractValue(
  project: ProjectContractLike | null | undefined,
  changeOrders: ChangeOrderLike[] | null | undefined,
): number {
  const original = num(project?.original_contract_value);
  let approved = 0;
  for (const co of changeOrders || []) {
    if (!co) continue;
    if (String(co.status ?? "").trim() === "Approved") approved += num(co.co_amount);
  }
  return original + approved;
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
