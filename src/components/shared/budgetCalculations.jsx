// Budget calculation utilities for Expenses, SOV, and Cost Codes
import { roundCurrency } from './formatters';

export function getCostCodeSummary(costCode, sovItems = [], expenses = [], costCodes = []) {
  const budgetFromCostCodes = roundCurrency(costCodes
    .filter(c => c.cost_code === costCode)
    .reduce((sum, c) => sum + (Number(c.budget_amount) || 0), 0));

  const budgetFromSov = roundCurrency(sovItems
    .filter(s => s.cost_code === costCode)
    .reduce((sum, s) => sum + (Number(s.scheduled_value) || 0), 0));

  const budget = budgetFromCostCodes || budgetFromSov;

  // Committed = sum of non-voided expenses for this cost code
  const committed = roundCurrency(expenses
    .filter(e =>
      e.cost_code === costCode &&
      e.payment_status !== 'Voided'
    )
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  // Paid = sum of paid expenses
  const paid = roundCurrency(expenses
    .filter(e =>
      e.cost_code === costCode &&
      e.payment_status === 'Paid'
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
  // Total budget from all SOV items
  const totalBudget = roundCurrency(sovItems.reduce((sum, s) => sum + (Number(s.scheduled_value) || 0), 0));

  // Total committed (non-voided expenses)
  const totalCommitted = roundCurrency(expenses
    .filter(e => e.payment_status !== 'Voided')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  // Total paid
  const totalPaid = roundCurrency(expenses
    .filter(e => e.payment_status === 'Paid')
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
  const wpExpenses = expenses.filter(e => e.work_package_id === wpId && e.payment_status !== 'Voided');

  const committed = roundCurrency(wpExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
  const paid = roundCurrency(wpExpenses
    .filter(e => e.payment_status === 'Paid')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  return {
    committed,
    paid,
    count: wpExpenses.length,
  };
}

// Group expenses by cost code category for chart display
export function getExpensesByCategory(expenses = []) {
  const categoryMap = {
    Labor: ['01', '07', '08'],
    Materials: ['02', '03', '04', '05', '13'],
    Subcontractor: [], // No specific codes, user-selectable
    Equipment: ['09'],
    'Misc.': ['13', '14'],
    Overhead: ['15'],
  };

  const result = {};
  Object.entries(categoryMap).forEach(([category, codes]) => {
    result[category] = roundCurrency(expenses
      .filter(e => codes.includes(e.cost_code) && e.payment_status !== 'Voided')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
  });

  return result;
}
