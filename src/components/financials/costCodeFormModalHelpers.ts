/** Pure empty form for CostCodeFormModal. */

export const EMPTY_COST_CODE_FORM = {
  cost_code_number: "",
  description: "",
  budget_amount: 0,
  actual_cost: 0,
  committed_cost: 0,
  forecast_to_complete: 0,
  project_id: "",
  project_name: "",
  notes: "",
  phase: "Materials", // kept for backwards compat with CostCode entity
};
