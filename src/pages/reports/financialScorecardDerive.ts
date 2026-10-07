import {
  activeExpenses,
  computeRevisedBudget,
  isPaidExpense,
  resolveProjectSpend,
  type ChangeOrderLike,
  type CostCodeLike,
  type ExpenseLike,
} from "@/services/costRollup";

/** Reconcile report figures with the same cost and budget rules as Cost Control. */
export function deriveScorecardBudget(
  costCodes: CostCodeLike[],
  expenses: ExpenseLike[],
  changeOrders: ChangeOrderLike[],
) {
  const budget = computeRevisedBudget(costCodes, changeOrders);
  const spend = resolveProjectSpend(costCodes, expenses);
  const totalBudget = budget.revisedBudget;
  const committed = spend.committed;
  // Resolve exposure per cost code so commitments in one scope cannot hide
  // actual-only spending elsewhere; unmapped expenses are included once.
  const costExposure = spend.costExposure;
  // Paid is cash recorded on expenses, distinct from manually entered actuals.
  const paid = activeExpenses(expenses).filter(isPaidExpense).reduce((sum, expense) => {
    const amount = Number(expense.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return {
    ...budget,
    ...spend,
    totalBudget,
    paid,
    costExposure,
    budgetUsedPct: totalBudget > 0 ? costExposure / totalBudget * 100 : null,
    costVariance: totalBudget > 0 ? totalBudget - costExposure : null,
    costVariancePct: totalBudget > 0 ? (totalBudget - costExposure) / totalBudget * 100 : null,
    committedVsBudget: totalBudget > 0 ? committed / totalBudget : null,
  };
}

/** Current margin after reconciled cost exposure across all cost codes. */
export function marginPercentAtExposure(contractValue: number, costExposure: number): number | null {
  return contractValue > 0 ? (contractValue - costExposure) / contractValue * 100 : null;
}
