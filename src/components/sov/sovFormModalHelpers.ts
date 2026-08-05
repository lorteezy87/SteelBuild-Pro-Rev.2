/** Pure empty form for SOVFormModal. */

export const EMPTY_SOV_FORM = {
  project_id: "",
  project_name: "",
  application_number: 1,
  period_from: null as string | null,
  period_to: null as string | null,
  line_item_number: 1,
  description: "",
  scheduled_value: 0,
  previous_percent_complete: 0,
  current_percent_complete: 0,
  retainage_percent: 10,
  status: "Draft",
  submitted_date: null as string | null,
  payment_received_date: null as string | null,
};
