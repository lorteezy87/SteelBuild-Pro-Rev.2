/**
 * wpHoursForResource.js
 *
 * Returns the number of hours a single work package contributes to a
 * resource's load. The old code summed shop_hours_budget + field_hours_budget
 * which double-counted — a field crew should bear only field hours and a
 * shop crew should bear only shop hours. The WP's phase tells us which
 * bucket matters:
 *
 *   Detailing   → shop_hours_budget  (engineering/detailing pre-shop work)
 *   Fabrication → shop_hours_budget
 *   Erection    → field_hours_budget
 *   Delivery    → field_hours_budget  (logistics is field-side)
 *
 * If phase is missing or unusual, fall back to the non-zero bucket (or 0
 * if both are empty). Never sum both.
 */

export function wpBudgetHoursForResource(wp) {
  if (!wp) return 0;
  const phase = String(wp.phase || "").toLowerCase();
  const shop  = Number(wp.shop_hours_budget)  || 0;
  const field = Number(wp.field_hours_budget) || 0;
  if (phase === "detailing" || phase === "fabrication") return shop;
  if (phase === "erection"  || phase === "delivery")    return field;
  return shop || field;
}

export function wpActualHoursForResource(wp) {
  if (!wp) return 0;
  const phase = String(wp.phase || "").toLowerCase();
  const shop  = Number(wp.shop_hours_actual)  || 0;
  const field = Number(wp.field_hours_actual) || 0;
  if (phase === "detailing" || phase === "fabrication") return shop;
  if (phase === "erection"  || phase === "delivery")    return field;
  return shop || field;
}
