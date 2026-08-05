/**
 * Pure helpers for Budget Hours page shell (classic + scope modal create).
 */

export type SortOrderRow = {
  sort_order?: number | string | null;
};

/** Next sort_order for a new row (max existing + 10). */
export function nextBudgetHourSortOrder(rows: SortOrderRow[]): number {
  const maxSort = Math.max(0, ...(rows || []).map((r) => Number(r.sort_order) || 0));
  return maxSort + 10;
}

export function buildBlankBudgetHourRow(
  projectId: string,
  sortOrder: number,
): {
  project_id: string;
  category: string;
  scope_item: string;
  sort_order: number;
  is_specialty: boolean;
  shop_hours_budget: number;
  shop_hours_actual: number;
  field_hours_budget: number;
  field_hours_actual: number;
  metadata: Record<string, never>;
} {
  return {
    project_id: projectId,
    category: "Standard",
    scope_item: "New Scope Item",
    sort_order: sortOrder,
    is_specialty: false,
    shop_hours_budget: 0,
    shop_hours_actual: 0,
    field_hours_budget: 0,
    field_hours_actual: 0,
    metadata: {},
  };
}

/** Merge scope-modal patch with project + next sort_order for create. */
export function buildScopeCreatePayload(
  patch: Record<string, unknown>,
  projectId: string,
  sortOrder: number,
): Record<string, unknown> {
  return {
    ...patch,
    project_id: projectId,
    sort_order: sortOrder,
    metadata: {},
  };
}
