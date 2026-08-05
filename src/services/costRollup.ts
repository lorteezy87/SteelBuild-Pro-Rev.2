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
 * Control so all three agree. resolveProjectSpend() applies that same rule at
 * the project level, for the Portfolio and the Dashboard.
 *
 * ⚠ `cost_codes` also has LEGACY money columns `budget` / `actual` /
 * `committed`, superseded by `budget_amount` / `actual_cost` / `committed_cost`.
 * Nothing reads or writes them and every row sits at 0 (verified against
 * production: 240/240 rows). Never introduce a query against the short names —
 * you will silently read zeros.
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

export interface ExpenseLike {
  /** expenses.cost_code holds the cost-code NUMBER (text). No cost_code_id exists. */
  cost_code?: string | null;
  amount?: number | string | null;
  payment_status?: string | null;
  [key: string]: unknown;
}

export interface ProjectSpend {
  /** Σ preferManualActual(actual_cost, paid expenses) over cost codes. */
  mappedActual: number;
  /** Σ preferManualActual(committed_cost, non-voided expenses) over cost codes. */
  mappedCommitted: number;
  /** Paid expenses whose cost_code matches no cost code on the project. */
  unmappedActual: number;
  /** Non-voided expenses whose cost_code matches no cost code on the project. */
  unmappedCommitted: number;
  /** How many expense rows are unmapped — Budget Control surfaces these for review. */
  unmappedCount: number;
  /** mappedActual + unmappedActual — every dollar actually paid on the project. */
  actual: number;
  /** mappedCommitted + unmappedCommitted — every non-voided dollar. */
  committed: number;
}

const VOIDED = new Set(["voided", "void"]);
const isVoided = (e: ExpenseLike) => VOIDED.has(String(e?.payment_status ?? "").toLowerCase());
const isPaid = (e: ExpenseLike) => String(e?.payment_status ?? "").toLowerCase() === "paid";

/**
 * Resolve a project's actual + committed spend, reconciling the two models that
 * had drifted apart across the app.
 *
 * Budget Control / Cost Dashboard / Cost Control Center resolved per-code spend
 * with `preferManualActual` (a typed-in column beats the expense rollup) and
 * excluded expenses whose `cost_code` matches no cost code, flagging them for
 * review. The Portfolio and the project Dashboard instead summed raw expenses
 * and ignored the typed columns entirely — so a project whose actuals were
 * typed onto cost codes rather than logged as expenses reported real spend on
 * one screen and $0 on the other, under the same label.
 *
 * This resolves mapped codes with `preferManualActual` AND keeps the unmapped
 * expenses (rather than silently dropping money), reporting them separately so
 * each surface can decide whether to include the tail — and so the difference
 * between two surfaces is always exactly `unmappedActual`, a number the UI can
 * show, instead of an unexplained gap between two formulas.
 */
export function resolveProjectSpend(
  costCodes: CostCodeLike[] | null | undefined,
  expenses: ExpenseLike[] | null | undefined,
): ProjectSpend {
  const codes = (costCodes || []).filter(Boolean);
  const active = (expenses || []).filter((e) => e && !isVoided(e));

  // expenses.cost_code holds the cost-code NUMBER (text); the schema has no
  // cost_code_id on expenses, so matching by cost_code_number is the only path.
  const paidByCode = new Map<string, number>();
  const allByCode = new Map<string, number>();
  for (const e of active) {
    const key = String(e.cost_code ?? "");
    if (!key) continue;
    allByCode.set(key, (allByCode.get(key) ?? 0) + num(e.amount));
    if (isPaid(e)) paidByCode.set(key, (paidByCode.get(key) ?? 0) + num(e.amount));
  }

  let mappedActual = 0;
  let mappedCommitted = 0;
  const knownCodes = new Set<string>();
  for (const c of codes) {
    const number = String(c.cost_code_number ?? "");
    if (number) knownCodes.add(number);
    mappedActual += preferManualActual(c.actual_cost, paidByCode.get(number) ?? 0);
    mappedCommitted += preferManualActual(c.committed_cost, allByCode.get(number) ?? 0);
  }

  let unmappedActual = 0;
  let unmappedCommitted = 0;
  let unmappedCount = 0;
  for (const e of active) {
    const key = String(e.cost_code ?? "");
    if (key && knownCodes.has(key)) continue;
    unmappedCount += 1;
    unmappedCommitted += num(e.amount);
    if (isPaid(e)) unmappedActual += num(e.amount);
  }

  return {
    mappedActual,
    mappedCommitted,
    unmappedActual,
    unmappedCommitted,
    unmappedCount,
    actual: mappedActual + unmappedActual,
    committed: mappedCommitted + unmappedCommitted,
  };
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
