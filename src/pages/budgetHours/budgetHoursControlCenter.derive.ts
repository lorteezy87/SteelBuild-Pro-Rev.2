import type { Insert, Update } from "@/api/supabaseClient";
import { safeNumber, type WorkPackage } from "@/hooks/useFinancials";
import {
  budgetHoursVariance,
  type BudgetHourItemInput,
  type WorkPackageMetricInput,
} from "@/pages/dashboard/projectMetrics";

export interface MissEntry {
  id: string;
  location: string;
  rough_cost: number;
  explanation: string;
}

export type BudgetHourMetadata = {
  linked_work_package_ids?: string[];
  misses?: MissEntry[];
  [key: string]: unknown;
};

export interface BudgetHourRow extends BudgetHourItemInput {
  id: string;
  project_id?: string;
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
  metadata: BudgetHourMetadata | null;
  [key: string]: unknown;
}

export type WorkPackageRow = WorkPackageMetricInput &
  Pick<WorkPackage, "id"> & {
    id: string;
  };
export type BudgetHourCreate = Insert<"budget_hour_items">;
export type BudgetHourPatch = Update<"budget_hour_items">;
export type BudgetHourCategoryFilter = "All" | "Standard" | "Specialty";

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

export interface BudgetHourTableRow extends BudgetHourRow {
  _shopActual: number;
  _fieldActual: number;
  _shopVarPct: number;
  _fieldVarPct: number;
  _totalBudget: number;
  _totalActual: number;
  _totalVarPct: number;
  _isLinked: boolean;
}

export type BhTone = "neutral" | "good" | "warn" | "danger";

export interface HourBarDatum {
  label: string;
  shopBudget: number;
  shopActual: number;
  fieldBudget: number;
  fieldActual: number;
}

export interface BudgetHoursSummary {
  totalBudgetHours: number;
  totalActualHours: number;
  pctUsed: number;
  forecastHours: number;
  varianceHours: number;
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
  byTrade: ScopeItemPanelRow[];
  overBudgetRows: ScopeItemPanelRow[];
  byCategoryPie: { name: string; value: number }[];
  barChartData: HourBarDatum[];
  misses: MissEntry[];
}

export interface BudgetHoursFilters {
  search: string;
  category: BudgetHourCategoryFilter;
  overBudgetOnly: boolean;
}

export function variancePct(budget: unknown, actual: unknown): number {
  const normalizedBudget = safeNumber(budget);
  const normalizedActual = safeNumber(actual);
  if (normalizedBudget <= 0) return normalizedActual > 0 ? 100 : 0;
  return ((normalizedActual - normalizedBudget) / normalizedBudget) * 100;
}

export function varianceTone(pct: number): BhTone {
  if (pct >= 10) return "danger";
  if (pct > 0) return "warn";
  return "good";
}

export function fmtHours(value: unknown): string {
  return safeNumber(value).toFixed(1);
}

export function fmtPct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

export function effectiveActuals(
  row: BudgetHourRow,
  wpsById: ReadonlyMap<string, WorkPackageRow>,
): { shop: number; field: number; linked: boolean } {
  const linkedIds = row.metadata?.linked_work_package_ids;
  if (!Array.isArray(linkedIds) || linkedIds.length === 0) {
    return {
      shop: safeNumber(row.shop_hours_actual),
      field: safeNumber(row.field_hours_actual),
      linked: false,
    };
  }

  let shop = 0;
  let field = 0;
  for (const id of linkedIds) {
    const workPackage = wpsById.get(id);
    if (!workPackage) continue;
    shop += safeNumber(workPackage.shop_hours_actual);
    field += safeNumber(workPackage.field_hours_actual);
  }
  return { shop, field, linked: true };
}

function toScopeItemPanelRow(
  row: BudgetHourRow,
  wpsById: ReadonlyMap<string, WorkPackageRow>,
): ScopeItemPanelRow {
  const actuals = effectiveActuals(row, wpsById);
  const shopBudget = safeNumber(row.shop_hours_budget);
  const fieldBudget = safeNumber(row.field_hours_budget);
  const totalBudget = shopBudget + fieldBudget;
  const totalActual = actuals.shop + actuals.field;

  return {
    id: row.id,
    scopeItem: row.scope_item || "—",
    shopBudget,
    shopActual: actuals.shop,
    shopVarPct: variancePct(shopBudget, actuals.shop),
    fieldBudget,
    fieldActual: actuals.field,
    fieldVarPct: variancePct(fieldBudget, actuals.field),
    totalBudget,
    totalActual,
    totalVarPct: variancePct(totalBudget, totalActual),
    isLinked: actuals.linked,
    isOverBudget: totalActual > totalBudget && totalBudget > 0,
  };
}

export function buildBudgetHourTableRows(
  rows: readonly BudgetHourRow[],
  wpsById: ReadonlyMap<string, WorkPackageRow>,
): BudgetHourTableRow[] {
  return rows.map((row) => {
    const derived = toScopeItemPanelRow(row, wpsById);
    return {
      ...row,
      _shopActual: derived.shopActual,
      _fieldActual: derived.fieldActual,
      _shopVarPct: derived.shopVarPct,
      _fieldVarPct: derived.fieldVarPct,
      _totalBudget: derived.totalBudget,
      _totalActual: derived.totalActual,
      _totalVarPct: derived.totalVarPct,
      _isLinked: derived.isLinked,
    };
  });
}

export function filterBudgetHourRows(
  rows: readonly BudgetHourRow[],
  filters: BudgetHoursFilters,
): BudgetHourRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows
    .filter((row) => row.category !== "Misses")
    .filter((row) => {
      if (filters.category === "Standard") {
        return row.category === "Standard" && !row.is_specialty;
      }
      if (filters.category === "Specialty") {
        return row.category === "Specialty" || !!row.is_specialty;
      }
      return true;
    })
    .filter((row) => {
      if (!filters.overBudgetOnly) return true;
      const totalBudget =
        safeNumber(row.shop_hours_budget) + safeNumber(row.field_hours_budget);
      const totalActual =
        safeNumber(row.shop_hours_actual) + safeNumber(row.field_hours_actual);
      return totalActual > totalBudget && totalBudget > 0;
    })
    .filter((row) => {
      if (!query) return true;
      return (
        row.scope_item.toLowerCase().includes(query) ||
        (row.notes || "").toLowerCase().includes(query)
      );
    });
}

export function nextSortOrder(rows: readonly BudgetHourRow[]): number {
  return Math.max(0, ...rows.map((row) => safeNumber(row.sort_order))) + 10;
}

export function buildScopeItemCreate(
  projectId: string,
  rows: readonly BudgetHourRow[],
  patch: BudgetHourPatch,
): BudgetHourCreate {
  return {
    ...patch,
    project_id: projectId,
    category: patch.category || "Standard",
    scope_item: patch.scope_item || "New Scope Item",
    sort_order: nextSortOrder(rows),
    metadata: {},
  };
}

export function buildBudgetHourDeletePatch(nowIso: string): BudgetHourPatch {
  return { is_deleted: true, deleted_at: nowIso };
}

export function buildBudgetHoursCsv(rows: readonly BudgetHourRow[]): string {
  const headers = [
    "Scope Item",
    "Category",
    "Shop Budget",
    "Shop Actual",
    "Field Budget",
    "Field Actual",
    "Notes",
  ];
  const exportRows = rows.map((row) => [
    row.scope_item,
    row.category,
    safeNumber(row.shop_hours_budget),
    safeNumber(row.shop_hours_actual),
    safeNumber(row.field_hours_budget),
    safeNumber(row.field_hours_actual),
    row.notes || "",
  ]);
  return [headers, ...exportRows]
    .map((row) => row.map((cell) => `"${cell ?? ""}"`).join(","))
    .join("\n");
}

export function buildBudgetHoursSummary(
  rows: readonly BudgetHourRow[],
  wpsById: ReadonlyMap<string, WorkPackageRow> = new Map(),
): BudgetHoursSummary {
  const realRows = rows.filter((row) => row.category !== "Misses");
  const panelRows = realRows.map((row) => toScopeItemPanelRow(row, wpsById));
  const variance = budgetHoursVariance(rows, [...wpsById.values()]);
  const overBudgetRows = panelRows
    .filter((row) => row.isOverBudget)
    .sort((a, b) => b.totalVarPct - a.totalVarPct);

  const barChartData = panelRows
    .slice()
    .sort((a, b) => b.totalBudget - a.totalBudget)
    .slice(0, 12)
    .map((row) => ({
      label:
        row.scopeItem.length > 18
          ? `${row.scopeItem.slice(0, 16)}…`
          : row.scopeItem,
      shopBudget: row.shopBudget,
      shopActual: row.shopActual,
      fieldBudget: row.fieldBudget,
      fieldActual: row.fieldActual,
    }));

  const byCategoryPie: { name: string; value: number }[] = [];
  if (variance.shopBudget > 0) {
    byCategoryPie.push({
      name: "Shop",
      value: Math.round(variance.shopBudget * 10) / 10,
    });
  }
  if (variance.fieldBudget > 0) {
    byCategoryPie.push({
      name: "Field",
      value: Math.round(variance.fieldBudget * 10) / 10,
    });
  }

  const missesRow = rows.find((row) => row.category === "Misses");
  const misses = (missesRow?.metadata?.misses ?? []).filter(Boolean);

  return {
    totalBudgetHours: variance.totalBudget,
    totalActualHours: variance.totalActual,
    pctUsed:
      variance.totalBudget > 0
        ? Math.round((variance.totalActual / variance.totalBudget) * 100)
        : 0,
    forecastHours: Math.max(variance.totalActual, variance.totalBudget),
    varianceHours: variance.totalActual - variance.totalBudget,
    overBudgetCount: overBudgetRows.length,
    shopBudget: variance.shopBudget,
    shopActual: variance.shopActual,
    shopVarPct: variance.shopVariancePct,
    fieldBudget: variance.fieldBudget,
    fieldActual: variance.fieldActual,
    fieldVarPct: variance.fieldVariancePct,
    totalVarPct: variance.totalVariancePct,
    standardCount: realRows.filter(
      (row) => row.category === "Standard" && !row.is_specialty,
    ).length,
    specialtyCount: realRows.filter(
      (row) => row.category === "Specialty" || !!row.is_specialty,
    ).length,
    byTrade: panelRows,
    overBudgetRows,
    byCategoryPie,
    barChartData,
    misses,
  };
}
