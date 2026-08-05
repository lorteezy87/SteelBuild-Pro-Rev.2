/** Pure empty form for COFormModal. */

export const EMPTY_CHANGE_ORDER_FORM = {
  project_id: "",
  project_name: "",
  title: "",
  description: "",
  reason_code: "Owner Request",
  status: "Draft",
  cost_code_id: "",
  submitted_date: new Date().toISOString().split("T")[0],
  approved_date: null as string | null,
  co_amount: 0,
  margin_percent: 0,
  schedule_impact_days: 0,
  approved_by: "",
  notes: "",
  attachments: "",
  co_number: "",
  source_rfi_id: null as string | null,
  sov_line_item_id: "",
  sov_line_number: null as number | null,
};
