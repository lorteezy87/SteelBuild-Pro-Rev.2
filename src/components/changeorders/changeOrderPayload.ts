const EDITABLE_FIELDS = [
  "project_id",
  "project_name",
  "title",
  "description",
  "reason_code",
  "status",
  "cost_code_id",
  "submitted_date",
  "approved_date",
  "co_amount",
  "margin_percent",
  "schedule_impact_days",
  "approved_by",
  "notes",
  "attachments",
  "co_number",
  "source_rfi_id",
  "sov_line_item_id",
  "sov_line_number",
] as const;

export type ChangeOrderFormData = Record<string, unknown>;

/**
 * Convert modal state into real change_orders columns only. Edit records may
 * carry aliases, timestamps, and derived values from query/display layers;
 * none of those should reach PostgREST.
 */
export function buildChangeOrderPayload(form: ChangeOrderFormData): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(form, field)) data[field] = form[field];
  }

  data.co_amount = Number(form.co_amount) || 0;
  data.margin_percent = Number(form.margin_percent) || 0;
  data.schedule_impact_days = Number(form.schedule_impact_days) || 0;
  data.sov_line_item_id = form.sov_line_item_id || null;
  data.sov_line_number = form.sov_line_number ?? null;
  data.source_rfi_id = form.source_rfi_id || null;

  return data;
}
