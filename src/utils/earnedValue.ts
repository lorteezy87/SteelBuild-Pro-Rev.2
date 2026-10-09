/** Deterministic earned-value figures. Planned value must come from a baseline. */
export interface EarnedValueWorkPackage {
  budgeted_labor_value?: number | string | null;
  budgeted_material_value?: number | string | null;
  actual_labor_cost_to_date?: number | string | null;
  actual_material_cost_to_date?: number | string | null;
  percent_complete?: number | string | null;
}

export interface EarnedValueFigures {
  bac: number;
  ev: number;
  ac: number;
  cpi: number | null;
  spi: number | null;
  tcpi: number | null;
  vac: number;
  eac: number;
}

const numeric = (value: number | string | null | undefined): number => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

export function calculateEarnedValue(
  workPackages: readonly EarnedValueWorkPackage[] = [],
  budgetAtCompletion?: number,
  plannedValue?: number | null,
): EarnedValueFigures {
  const bac = budgetAtCompletion ?? workPackages.reduce(
    (sum, wp) => sum + numeric(wp.budgeted_labor_value) + numeric(wp.budgeted_material_value),
    0,
  );
  const ev = workPackages.reduce((sum, wp) => {
    const wpBudget = numeric(wp.budgeted_labor_value) + numeric(wp.budgeted_material_value);
    return sum + wpBudget * (numeric(wp.percent_complete) / 100);
  }, 0);
  const ac = workPackages.reduce(
    (sum, wp) => sum + numeric(wp.actual_labor_cost_to_date) + numeric(wp.actual_material_cost_to_date),
    0,
  );

  const cpi = ac > 0 ? ev / ac : null;
  // BAC is the budget for the WHOLE job, not the work planned by the data date.
  // No dated baseline means no defensible schedule-performance claim.
  const spi = plannedValue != null && Number.isFinite(plannedValue) && plannedValue > 0
    ? ev / plannedValue
    : null;
  const eac = cpi != null && cpi > 0 ? ac + (bac - ev) / cpi : bac;
  const remainingWork = bac - ev;
  const remainingBudget = bac - ac;
  // Required efficiency = remaining work / remaining budget. Exhausting the
  // budget cannot produce a finite, achievable index; completed work needs none.
  const tcpi = remainingWork > 0 && remainingBudget > 0
    ? remainingWork / remainingBudget
    : null;

  return { bac, ev, ac, cpi, spi, tcpi, vac: bac - eac, eac };
}
