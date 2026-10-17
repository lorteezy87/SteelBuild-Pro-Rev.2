interface LaborRecord {
  shop_hours_budget?: unknown;
  field_hours_budget?: unknown;
  shop_hours_actual?: unknown;
  field_hours_actual?: unknown;
}

function recordedHours(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

/** Missing inputs must not become an apparently complete zero-hour report. */
export function summarizeExecutiveLabor(packages: readonly LaborRecord[]) {
  let enteredBudget = 0;
  let enteredActual = 0;
  let missingBudget = 0;
  let missingActual = 0;
  let incompletePackages = 0;
  for (const workPackage of packages) {
    const budget = [recordedHours(workPackage.shop_hours_budget), recordedHours(workPackage.field_hours_budget)];
    const actual = [recordedHours(workPackage.shop_hours_actual), recordedHours(workPackage.field_hours_actual)];
    const budgetMissing = budget.some(value => value === null);
    const actualMissing = actual.some(value => value === null);
    if (budgetMissing) missingBudget++;
    if (actualMissing) missingActual++;
    if (budgetMissing || actualMissing) incompletePackages++;
    enteredBudget += budget.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    enteredActual += actual.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  }
  const budget = packages.length > 0 && missingBudget === 0 ? enteredBudget : null;
  const actual = packages.length > 0 && missingActual === 0 ? enteredActual : null;
  return {
    budget, actual, enteredBudget, enteredActual, incompletePackages,
    burnPercent: budget !== null && budget > 0 && actual !== null ? actual / budget * 100 : null,
  };
}
