import { changeOrderStatusOptions, validateChangeOrderDecision, isChangeOrderDate } from "@/lib/changeOrders/lifecycle";
export { isChangeOrderDate } from "@/lib/changeOrders/lifecycle";
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
  "source_rfi_id",
  "sov_line_item_id",
  "sov_line_number",
  "sov_mode",
  "decision_notes",
  "void_reason",
] as const;

export type ChangeOrderFormData = Record<string, unknown>;
type PayloadOptions = { existing?: ChangeOrderFormData | null; canApprove?: boolean; canVoid?: boolean };

function numericField(value: unknown, label: string): number {
  const number = Number(value ?? 0);
  if ((typeof value !== "number" && typeof value !== "string" && value != null) || !Number.isFinite(number)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return number;
}

/**
 * Keep editable fields plus explicit lifecycle decisions for the API router.
 * The router saves decisions through the reviewed transactional command;
 * numbers and approval stamps are never ordinary row edits.
 */
export function buildChangeOrderPayload(form: ChangeOrderFormData, { existing, canApprove = true, canVoid = true }: PayloadOptions = {}): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(form, field)) data[field] = form[field];
  }

  data.co_amount = numericField(form.co_amount, "CO amount");
  const margin = numericField(form.margin_percent, "Margin");
  if (margin < 0 || margin > 100) throw new Error("Margin must be between 0 and 100.");
  data.margin_percent = margin;
  const days = numericField(form.schedule_impact_days, "Schedule impact");
  if (!Number.isInteger(days) || days < 0 || days > 2147483647) throw new Error("Schedule impact must be a nonnegative whole number of days within the supported range.");
  data.schedule_impact_days = days;
  data.sov_line_item_id = form.sov_line_item_id || null;
  data.sov_line_number = form.sov_line_number ?? null;
  data.source_rfi_id = form.source_rfi_id || null;

  const current = existing?.status ? String(existing.status) : undefined;
  const target = String(form.status ?? current ?? "Draft");
  if (target === "Void" && current !== "Void" && !canVoid) throw new Error("You do not have permission to void change orders.");
  if (!changeOrderStatusOptions(current).includes(target)) throw new Error(`Change order cannot move ${current ? `from ${current}` : "on creation"} to ${target}.`);
  if (form.submitted_date && !isChangeOrderDate(form.submitted_date)) throw new Error("Enter a valid submitted date.");
  if (data.submitted_date === "") data.submitted_date = null;
  const approving = target === "Approved" && current !== "Approved";
  if (approving) {
    if (!canApprove) throw new Error("You do not have permission to approve change orders.");
    if (!isChangeOrderDate(form.approved_date)) throw new Error("Enter a valid approval date.");
    data.approved_by = typeof form.approved_by === "string" ? form.approved_by.trim() : "";
  } else {
    delete data.approved_by;
    delete data.approved_date;
    delete data.sov_mode;
  }
  if (target === "Rejected" && target !== current) data.decision_notes = typeof form.decision_notes === "string" ? form.decision_notes.trim() : "";
  else delete data.decision_notes;
  if (target === "Void" && target !== current) data.void_reason = typeof form.void_reason === "string" ? form.void_reason.trim() : "";
  else delete data.void_reason;
  if (current) validateChangeOrderDecision(current, { ...data, status: target });

  if (current === "Approved") {
    for (const field of ["co_amount", "cost_code_id", "sov_line_item_id", "sov_line_number"]) delete data[field];
  }

  return data;
}
