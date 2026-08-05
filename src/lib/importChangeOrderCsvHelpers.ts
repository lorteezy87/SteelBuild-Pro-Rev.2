/**
 * Pure column-alias catalog for change-order CSV import.
 * Month map reuses RFI CSV months (identical WMO-style month names).
 */

export { RFI_CSV_MONTHS as CO_CSV_MONTHS } from "./importRfiCsvHelpers";

export const CO_CSV_COLUMN_ALIASES: Record<string, string[]> = {
  co_number: [
    "co #", "co no", "co number", "number", "no", "no.", "#",
    "change order #", "change order no", "change order number",
    "cco #", "cco number", "co id", "id", "co",
  ],
  title: [
    "title", "subject", "description short", "co title",
    "change order title", "summary", "name",
  ],
  description: [
    "description", "scope", "scope description", "details", "notes",
    "change description", "long description",
  ],
  reason_code: [
    "reason", "reason code", "type", "category", "change type",
    "classification", "co type",
  ],
  status: [
    "status", "state", "co status", "approval status", "phase",
  ],
  co_amount: [
    "amount", "co amount", "change order amount", "cost",
    "price", "value", "total", "sub total", "change value",
  ],
  submitted_date: [
    "submitted", "submitted date", "date submitted", "issue date",
    "issued", "issued date", "date issued", "date", "submit date",
    "co date",
  ],
  approved_date: [
    "approved", "approved date", "date approved", "approval date",
    "date approval", "executed", "executed date",
  ],
  approved_by: [
    "approved by", "approver", "signed by", "executed by",
    "approval by",
  ],
  notes: [
    "note", "notes", "comment", "comments", "remarks",
  ],
  schedule_impact_days: [
    "schedule impact", "schedule days", "days impact",
    "schedule impact days", "time impact", "days", "time ext",
    "time extension",
  ],
  margin_percent: [
    "margin", "margin %", "margin percent", "margin pct",
    "gross margin", "gm%", "gm %",
  ],
  project_name: [
    "project", "project name", "job", "job name",
  ],
  project_number: [
    "project number", "project #", "project no", "project no.",
    "job number", "job #", "job no", "job no.",
  ],
};
