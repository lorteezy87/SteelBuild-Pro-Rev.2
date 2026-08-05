/** Pure display helpers for RfiRow. */

export const RFI_ROW_GRID =
  "46px 108px minmax(360px, 1.45fr) minmax(156px, 0.58fr) minmax(142px, 0.5fr) minmax(148px, 0.5fr) minmax(148px, 0.5fr) 44px";

export function rfiReferenceLine(rfi: {
  discipline?: string | null;
  drawing_reference?: string | null;
  spec_section?: string | null;
}): string {
  return [rfi.discipline, rfi.drawing_reference, rfi.spec_section]
    .filter(Boolean)
    .join(" / ");
}

export function rfiSubmittedLine(rfi: {
  submitted_by?: string | null;
  submitted_date?: string | null;
}): string {
  return [rfi.submitted_by, rfi.submitted_date].filter(Boolean).join(" / ");
}

export function rfiAssignedLine(rfi: {
  assigned_to?: string | null;
  project_name?: string | null;
}): string {
  return rfi.assigned_to || rfi.project_name || "";
}

export function rfiPriorityColor(priority?: string | null): string {
  if (priority === "Critical") return "var(--status-review)";
  if (priority === "High") return "var(--status-warning)";
  if (priority === "Medium") return "var(--status-info)";
  return "var(--text-muted)";
}

export function rfiRowClassNames(input: {
  selected?: boolean;
  overdue?: boolean;
  priority?: string | null;
}): string {
  return [
    "rfi-record-row",
    input.selected ? "is-selected" : "",
    input.overdue ? "is-overdue" : "",
    input.priority === "Critical" ? "is-critical" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
