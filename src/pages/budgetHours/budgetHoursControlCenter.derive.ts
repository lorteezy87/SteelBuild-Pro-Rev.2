/**
 * Pure derivations for the Budget Hours Control Center (command_ui redesign).
 * No React, no network calls. All inputs are already-loaded rows from
 * entities.BudgetHourItem and entities.WorkPackage.
 *
 * All math mirrors the classic BudgetHours.jsx helpers exactly — behavior-
 * preserving lift, not a rewrite.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of a raw budget_hour_items row (matches supabase.ts Row). */
export interface BudgetHourRow {
  id: string;
  category: string;
  scope_item: string;
  is_specialty: boolean | null;
  is_deleted: boolean | null;
  shop_hours_budget: number | null;
  shop_hours_actual: number | null;
  field_hours_budget: number | null;
  field_hours_actual: number | null;
  notes: string | null;
  sort_order: number | null;
  metadata: {
    linked_work_package_ids?: string[];
    misses?: MissEntry[];
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

/** Shape of a work_packages row — only the fields we need for hour rollup. */
export interface WorkPackageRow {
  id: string;
  shop_hours_actual?: number | null;
  field_hours_actual?: number | null;
  [key: string]: unknown;
}

/** A miss entry stored inside missesRow.metadata.misses[]. */
export interface MissEntry {
  id: string;
  location: string;
  rough_cost: number;
  explanation: string;
}

/** A row in the "By Trade / Scope Item" decision panel. */
export interface ScopeItemPanelRow {
  id: string;
  scopeItem: string;
  shopBudget: number;
  shopActual: number;
  shopVarPct: number;
  fieldBudget: number;
  fieldActual: number;
  fieldVarPct: number;
  totalBudget: number;
  totalActual: number;
  totalVarPct: number;
  isLinked: boolean;
  isOverBudget: boolean;
}

/** KPI tones for cells that have good/warn/danger semantics. */
export type BhTone = "neutral" | "good" | "warn" | "danger";

/** Full summary returned by buildBudgetHoursSummary. */
export interface BudgetHoursSummary {
  /** KPIs */
  totalBudgetHours: number;
  totalActualHours: number;
  pctUsed: number;
  /** Rough forecast: actual + remaining budget (same as budget when actuals < budget). */
  forecastHours: number;
  /** Actual - Budget; positive = over. */
  varianceHours: number;
  /** Count of rows (excl. Misses) where actual > budget. */
  overBudgetCount: number;
  shopBudget: number;
  shopActual: number;
  shopVarPct: number;
  fieldBudget: number;
  fieldActual: number;
  fieldVarPct: number;
  totalVarPct: number;
  standardCount: number;
  specialtyCount: number;
  /** Panel queues */
  byTrade: ScopeItemPanelRow[];
  overBudgetRows: ScopeItemPanelRow[];
  byCategoryPie: { name: string; value: number }[];
  /** Chart data */
  barChartData: HourBarDatum[];
  /** Raw misses for the panel (from missesRow.metadata.misses). */
  misses: MissEntry[];
}

// ─── Shared helpers (mirror classic BudgetHours.jsx byte-for-byte) ─────────────

export function variancePct(budget: number, actual: number): number {
  const b = Number(budget) || 0;
  const a = Number(actual) || 0;
  if (b <= 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

export function varianceTone(pct: number): BhTone {
  if (pct >= 10) return "danger";
  if (pct > 0) return "warn";
  return "good";
}

export function fmtHours(n: number): string {
  const v = Number(n) || 0;
  return v.toFixed(1);
}

export function fmtPct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

/** Roll actuals from linked work packages when available, else use manual entry. */
function effectiveActuals(
  row: BudgetHourRow,
  wpsById: Map<string, WorkPackageRow>,
): { shop: number; field: number; linked: boolean } {
  const linked = row.metadata?.linked_work_package_ids;
  if (!Array.isArray(linked) || linked.length === 0) {
    return {
      shop: Number(row.shop_hours_actual) || 0,
      field: Number(row.field_hours_actual) || 0,
      linked: false,
    };
  }
  let shop = 0;
  let field = 0;
  for (const id of linked) {
    const wp = wpsById.get(id);
    if (!wp) continue;
    shop += Number(wp.shop_hours_actual) || 0;
    field += Number(wp.field_hours_actual) || 0;
  }
  return { shop, field, linked: true };
}

function toScopeItemPanelRow(
  row: BudgetHourRow,
  wpsById: Map<string, WorkPackageRow>,
): ScopeItemPanelRow {
  const eff = effectiveActuals(row, wpsById);
  const shopBudget = Number(row.shop_hours_budget) || 0;
  const fieldBudget = Number(row.field_hours_budget) || 0;
  const totalBudget = shopBudget + fieldBudget;
  const totalActual = eff.shop + eff.field;
  const shopVarPct = variancePct(shopBudget, eff.shop);
  const fieldVarPct = variancePct(fieldBudget, eff.field);
  const totalVarPct = variancePct(totalBudget, totalActual);
  return {
    id: row.id,
    scopeItem: row.scope_item || "—",
    shopBudget,
    shopActual: eff.shop,
    shopVarPct,
    fieldBudget,
    fieldActual: eff.field,
    fieldVarPct,
    totalBudget,
    totalActual,
    totalVarPct,
    isLinked: eff.linked,
    isOverBudget: totalActual > totalBudget && totalBudget > 0,
  };
}

// ─── Chart datum type ─────────────────────────────────────────────────────────

export interface HourBarDatum {
  /** Truncated scope item label (≤18 chars). */
  label: string;
  shopBudget: number;
  shopActual: number;
  fieldBudget: number;
  fieldActual: number;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build the full summary for BudgetHoursControlCenter.
 *
 * Accepts the already-filtered rows (is_deleted===true rows already removed
 * by the caller, same as BudgetHours.jsx's `rows` memo).
 */
export function buildBudgetHoursSummary(
  rows: BudgetHourRow[],
  wpsById: Map<string, WorkPackageRow> = new Map(),
): BudgetHoursSummary {
  // Active (non-Misses) rows
  const real = rows.filter((r) => r.category !== "Misses");
  const standard = real.filter((r) => r.category === "Standard" && !r.is_specialty);
  const specialty = real.filter((r) => r.category === "Specialty" || r.is_specialty);

  let sb = 0, sa = 0, fb = 0, fa = 0;
  for (const r of real) {
    sb += Number(r.shop_hours_budget) || 0;
    fb += Number(r.field_hours_budget) || 0;
    const eff = effectiveActuals(r, wpsById);
    sa += eff.shop;
    fa += eff.field;
  }

  const totalBudget = sb + fb;
  const totalActual = sa + fa;
  const shopVarPct = variancePct(sb, sa);
  const fieldVarPct = variancePct(fb, fa);
  const totalVarPct = variancePct(totalBudget, totalActual);
  const pctUsed = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;

  // Simple forecast: if over budget, EAC = actual; else EAC = budget (we don't know
  // the true completion %, so best-effort is: remaining budget + actual so far).
  const forecastHours = Math.max(totalActual, totalBudget);
  const varianceHours = totalActual - totalBudget;

  // Panel data
  const panelRows = real.map((r) => toScopeItemPanelRow(r, wpsById));
  const overBudgetRows = panelRows.filter((r) => r.isOverBudget)
    .sort((a, b) => b.totalVarPct - a.totalVarPct);

  // Bar chart data — top 12 rows by total budget (or all if fewer)
  const barChartData: HourBarDatum[] = panelRows
    .slice()
    .sort((a, b) => b.totalBudget - a.totalBudget)
    .slice(0, 12)
    .map((r) => ({
      label: r.scopeItem.length > 18 ? `${r.scopeItem.slice(0, 16)}…` : r.scopeItem,
      shopBudget: r.shopBudget,
      shopActual: r.shopActual,
      fieldBudget: r.fieldBudget,
      fieldActual: r.fieldActual,
    }));

  // Pie: Shop vs Field split (budget)
  const byCategoryPie: { name: string; value: number }[] = [];
  if (sb > 0) byCategoryPie.push({ name: "Shop", value: Math.round(sb * 10) / 10 });
  if (fb > 0) byCategoryPie.push({ name: "Field", value: Math.round(fb * 10) / 10 });

  // Misses
  const missesRow = rows.find((r) => r.category === "Misses") ?? null;
  const misses: MissEntry[] = (missesRow?.metadata?.misses ?? []).filter(Boolean) as MissEntry[];

  return {
    totalBudgetHours: totalBudget,
    totalActualHours: totalActual,
    pctUsed,
    forecastHours,
    varianceHours,
    overBudgetCount: overBudgetRows.length,
    shopBudget: sb,
    shopActual: sa,
    shopVarPct,
    fieldBudget: fb,
    fieldActual: fa,
    fieldVarPct,
    totalVarPct,
    standardCount: standard.length,
    specialtyCount: specialty.length,
    byTrade: panelRows,
    overBudgetRows,
    byCategoryPie,
    barChartData,
    misses,
  };
}
