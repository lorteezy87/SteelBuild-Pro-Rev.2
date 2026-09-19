// Budget calculation utilities for Expenses, SOV, and Cost Codes
import { roundCurrency } from './formatters';
import { COST_CODES, CATEGORY_ORDER } from './costCodes';
import { isPaidExpense, isVoidedExpense } from '@/services/costRollup';
import { sovScheduledTotal } from '@/pages/dashboard/projectMetrics';

/**
 * Canonical form of a cost code for MATCHING. One definition, used by every
 * comparison in this module.
 *
 * Cost codes arrive from four places — the COST_CODES catalog, `cost_codes`
 * rows (`cost_code_number`), `sov_items` rows (`cost_code`) and `expenses` rows
 * (`cost_code`) — typed by hand in some of them. They differ by surrounding
 * whitespace and by number-vs-string.
 *
 * This module used to compare two different ways: `getCostCodeSummary` did a
 * raw `===` while `getExpensesByCategory` did `String(x ?? '').trim()`. So the
 * SAME expense could land in the category chart and be missing from the
 * cost-code rollup, and the two views reported different totals from identical
 * data. Anyone reconciling them loses trust in the whole cost module.
 *
 * Deliberately conservative: trim and stringify only. It does NOT strip leading
 * zeros, because "01" and "1" are distinct codes in some catalogs and silently
 * merging them would move money between lines.
 */
export function normalizeCostCode(value) {
  return String(value ?? '').trim();
}

export function getCostCodeSummary(costCode, sovItems = [], expenses = [], costCodes = []) {
  const target = normalizeCostCode(costCode);

  // Cost-code rows store the number in `cost_code_number` (NOT `cost_code`,
  // which is the field on EXPENSE rows). Matching on the wrong field here made
  // matchingCostCodes always empty → budget silently fell back to SOV / $0.
  const matchingCostCodes = costCodes.filter(c => normalizeCostCode(c.cost_code_number) === target);
  const budgetFromCostCodes = roundCurrency(matchingCostCodes
    .reduce((sum, c) => sum + (Number(c.budget_amount) || 0), 0));

  const budgetFromSov = roundCurrency(sovItems
    .filter(s => normalizeCostCode(s.cost_code) === target)
    .reduce((sum, s) => sum + (Number(s.scheduled_value) || 0), 0));

  // Use cost-code budget if any cost codes matched (even if $0), else fall back to SOV
  const budget = matchingCostCodes.length > 0 ? budgetFromCostCodes : budgetFromSov;

  // Committed = sum of non-voided expenses for this cost code
  const committed = roundCurrency(expenses
    .filter(e =>
      normalizeCostCode(e.cost_code) === target &&
      !isVoidedExpense(e)
    )
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  // Paid = sum of paid expenses
  const paid = roundCurrency(expenses
    .filter(e =>
      normalizeCostCode(e.cost_code) === target &&
      isPaidExpense(e)
    )
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  const remaining = roundCurrency(budget - committed);
  const usedPct = budget > 0 ? Math.min(100, Math.round((committed / budget) * 100)) : 0;
  const isOver = committed > budget;
  const overAmount = roundCurrency(Math.max(0, committed - budget));

  return {
    budget,
    committed,
    paid,
    remaining,
    usedPct,
    isOver,
    overAmount,
  };
}

export function getProjectBudgetSummary(sovItems = [], expenses = []) {
  // Total budget from the SOV. sov_items holds one row per (line item ×
  // application × status), so summing raw rows multiplied the budget by the
  // number of pay applications filed. sovScheduledTotal is the deduped view
  // (latest application per line item) the contract pages already use.
  const totalBudget = roundCurrency(sovScheduledTotal(sovItems));

  // Total committed (non-voided expenses)
  const totalCommitted = roundCurrency(expenses
    .filter(e => !isVoidedExpense(e))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  // Total paid
  const totalPaid = roundCurrency(expenses
    .filter(e => isPaidExpense(e))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  const remaining = roundCurrency(totalBudget - totalCommitted);
  const usedPct = totalBudget > 0 ? Math.min(100, Math.round((totalCommitted / totalBudget) * 100)) : 0;
  const isOver = totalCommitted > totalBudget;
  const overAmount = roundCurrency(Math.max(0, totalCommitted - totalBudget));

  return {
    totalBudget,
    totalCommitted,
    totalPaid,
    remaining,
    usedPct,
    isOver,
    overAmount,
  };
}

export function getWorkPackageCostSummary(wpId, expenses = []) {
  // Expenses linked to this work package
  const wpExpenses = expenses.filter(e => e.work_package_id === wpId && !isVoidedExpense(e));

  const committed = roundCurrency(wpExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
  const paid = roundCurrency(wpExpenses
    .filter(e => isPaidExpense(e))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  return {
    committed,
    paid,
    count: wpExpenses.length,
  };
}

// Group expenses by cost code category for chart display
/**
 * Spend per category, keyed by CATEGORY_ORDER.
 *
 * The category→codes map is DERIVED from the COST_CODES catalog, which is the
 * one place a code's category is declared. A hand-written copy lived here and
 * had drifted out of agreement with it on six of the fourteen codes: it filed
 * 01 (Detailing) under Labor where the catalog calls it Subcontractor, left
 * Subcontractor empty, listed a code 15 that does not exist, and omitted 06
 * (Shop Labor), 10 (Shipping), 11 (Deck Install) and 12 (Special Coatings)
 * altogether — so shop labor and deck install spend fell out of every total.
 * The labor KPI in useFinancials reads the catalog, so the two disagreed on
 * what "Labor" costs.
 */
export function getExpensesByCategory(expenses = []) {
  const categoryOf = new Map(COST_CODES.map(c => [normalizeCostCode(c.code), c.category]));
  const result = Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0]));
  expenses.forEach(e => {
    if (isVoidedExpense(e)) return;
    const category = categoryOf.get(normalizeCostCode(e.cost_code));
    if (!category || !(category in result)) return;
    result[category] += Number(e.amount) || 0;
  });
  CATEGORY_ORDER.forEach(c => { result[c] = roundCurrency(result[c]); });
  return result;
}
