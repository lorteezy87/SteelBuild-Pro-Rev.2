/**
 * Project-level KPI calculations used across ProjectCard, Dashboard,
 * CommandStrip, and detail views.
 *
 * All functions are pure and take plain arrays / objects so they are easy
 * to test and reuse without React dependencies.
 */

import { computeRevisedContractValue } from "@/services/costRollup";

/**
 * Work-package progress for a single project.
 * @param {object[]} workPackages - WPs already filtered to this project
 * @returns {{ totalCount, completeCount, pct, totalTons, completeTons }}
 */
export function calcWpProgress(workPackages = []) {
  const totalCount   = workPackages.length;
  const completeWPs  = workPackages.filter(w => w.status === "Complete");
  const completeCount = completeWPs.length;
  const pct          = totalCount > 0 ? Math.round((completeCount / totalCount) * 100) : 0;
  const totalTons    = workPackages.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  const completeTons = completeWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
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
  const now      = new Date();
  const active   = rfis.filter(r => !["Answered", "Closed"].includes(r.status));
  const openCount    = active.length;
  const overdueCount = active.filter(r => r.date_required && new Date(r.date_required) < now).length;
  return { openCount, overdueCount };
}
