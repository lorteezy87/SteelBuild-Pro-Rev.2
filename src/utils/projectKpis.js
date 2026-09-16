/**
 * Project-level KPI calculations used across ProjectCard, Dashboard,
 * CommandStrip, and detail views.
 *
 * All functions are pure and take plain arrays / objects so they are easy
 * to test and reuse without React dependencies.
 */

import { computeRevisedContractValue } from "@/services/costRollup";
import { isRfiOpen } from "@/lib/entityPredicates";

/**
 * Normalize weight to tons. If the value is obviously in pounds
 * (e.g. > 5000 for a single package), divide by 2000.
 * @param {unknown} value
 * @returns {number} Weight in tons
 */
export function normalizeTonnage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n > 5000 ? n / 2000 : n;
}

/**
 * Work-package progress for a single project.
 * @param {object[]} workPackages - WPs already filtered to this project
 * @returns {{ totalCount, completeCount, pct, totalTons, completeTons }}
 */
export function calcWpProgress(workPackages = []) {
  const totalCount = workPackages.length;
  if (totalCount === 0) return { totalCount: 0, completeCount: 0, pct: 0, totalTons: 0, completeTons: 0 };

  const totalTons = workPackages.reduce((s, w) => s + normalizeTonnage(w.tonnage), 0);
  const totalPctWeighted = workPackages.reduce((sum, wp) => sum + (normalizeTonnage(wp.tonnage) * (Number(wp.percent_complete) || 0)), 0);

  const pct = totalTons > 0
    ? Math.round(totalPctWeighted / totalTons)
    : Math.round(workPackages.reduce((sum, wp) => sum + (Number(wp.percent_complete) || 0), 0) / totalCount);

  const completeWPs = workPackages.filter(w => w.status === "Complete");
  const completeCount = completeWPs.length;
  const completeTons = completeWPs.reduce((s, w) => s + normalizeTonnage(w.tonnage), 0);

  return { totalCount, completeCount, pct, totalTons, completeTons };
}

/**
 * Shop-labor burn rate for a single project.
 * @param {object[]} workPackages - WPs already filtered to this project
 * @returns {{ shopBudget, shopActual, burnPct, isOverBudget }}
 */
export function calcLaborBurn(workPackages = []) {
  const shopBudget   = workPackages.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0), 0);
  const shopActual   = workPackages.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0), 0);
  const burnPct      = shopBudget > 0 ? Math.round((shopActual / shopBudget) * 100) : 0;
  const isOverBudget = burnPct > 100;
  return { shopBudget, shopActual, burnPct, isOverBudget };
}

/**
 * Contract value summary incorporating approved change orders.
 * @param {object} project
 * @param {object[]} changeOrders - COs already filtered to this project
 * @returns {{ original, approvedCOTotal, revised, pendingCOCount, pendingCOValue }}
 */
export function calcContractValue(project, changeOrders = []) {
  const original = Number(project?.original_contract_value) || 0;
  // Delegate the revised value to the single source of truth (costRollup) so this
  // Projects-page KPI can't drift from Financials / ContractManagement — that helper
  // trims the CO status, catching an "Approved " with stray whitespace that an exact
  // === would silently miss (and would otherwise show a smaller contract here).
  const revised = computeRevisedContractValue(project, changeOrders);
  const approvedCOTotal = revised - original;
  const pendingCOs     = changeOrders.filter(c => ["Submitted", "Under Review"].includes(c.status));
  const pendingCOCount = pendingCOs.length;
  const pendingCOValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  return { original, approvedCOTotal, revised, pendingCOCount, pendingCOValue };
}

/**
 * Days remaining to target completion date.
 * @param {object} project
 * @returns {{ daysLeft: number|null, isOverdue: boolean }}
 */
export function calcDaysToDeadline(project) {
  if (!project?.target_completion_date) return { daysLeft: null, isOverdue: false };
  const daysLeft = Math.ceil(
    (new Date(project.target_completion_date).getTime() - Date.now()) / 86400000
  );
  return { daysLeft, isOverdue: daysLeft < 0 };
}

/**
 * EVM (Earned Value Management) metrics for a single project.
 * @param {object[]} workPackages - WPs already filtered to this project
 * @param {number} [budgetAtCompletion] - optional override; defaults to sum of WP budgets
 * @returns {{ bac, ev, ac, cpi, spi, tcpi, vac }}
 */
export function calcEVM(workPackages = [], budgetAtCompletion) {
  const bac = budgetAtCompletion ?? workPackages.reduce((s, w) => {
    return s + (Number(w.budgeted_labor_value) || 0) + (Number(w.budgeted_material_value) || 0);
  }, 0);

  const ev = workPackages.reduce((s, w) => {
    const wpBac = (Number(w.budgeted_labor_value) || 0) + (Number(w.budgeted_material_value) || 0);
    return s + wpBac * ((Number(w.percent_complete) || 0) / 100);
  }, 0);

  const ac = workPackages.reduce((s, w) => {
    return s + (Number(w.actual_labor_cost_to_date) || 0) + (Number(w.actual_material_cost_to_date) || 0);
  }, 0);

  const cpi  = ac > 0   ? ev / ac        : null;
  // SPI = EV / PV. Without time-phased PV data, approximate PV from
  // elapsed schedule fraction × BAC (linear baseline).
  const pv   = bac; // Placeholder: assumes PV ≈ BAC at current date; replace with time-phased PV when available
  const spi  = pv > 0  ? ev / pv        : null;
  const eac  = cpi > 0 ? ac + (bac - ev) / cpi : bac;
  const vac  = bac - eac;
  const tcpi = (bac - ev) > 0 ? (bac - ac) / (bac - ev) : null;

  return { bac, ev, ac, cpi, spi, tcpi, vac, eac };
}

/**
 * RFI health summary for a single project.
 * @param {object[]} rfis - RFIs already filtered to this project
 * @returns {{ openCount, overdueCount }}
 */
export function calcRfiHealth(rfis = []) {
  // Local midnight so RFIs due today don't flip to overdue at noon
  // (the date-only shim parses "YYYY-MM-DD" as local noon).
  const now      = new Date();
  now.setHours(0, 0, 0, 0);
  const active   = rfis.filter(isRfiOpen); // excludes Answered / Closed / Void
  const openCount    = active.length;
  const overdueCount = active.filter(r => r.date_required && new Date(r.date_required) < now).length;
  return { openCount, overdueCount };
}
