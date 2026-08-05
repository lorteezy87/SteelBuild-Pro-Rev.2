/**
 * Pure detail-row builder for ItemDetailDrawer (command center feed item).
 */
export function extractDetails(item: any): Array<{ label: string; value: any }> {
  const raw = item.raw || {};
  const details = [];

  details.push({ label: "Type", value: item.itemType });
  details.push({ label: "Urgency", value: item.urgency });
  details.push({ label: "Status", value: item.displayStatus || item.status });

  if (item.owner) details.push({ label: "Owner / Ball-in-Court", value: item.owner });
  if (item.projectNumber || item.projectName) {
    // Show "#### — Project Name" when both are present so the user can
    // confirm both the job code (used in folder paths / contracts) and
    // the human-readable name in one line.
    const projectLabel = [item.projectNumber, item.projectName].filter(Boolean).join(" — ");
    details.push({ label: "Project", value: projectLabel });
  }
  if (item.priority) details.push({ label: "Priority", value: item.priority });

  // Type-specific fields from raw data
  switch (item.itemType) {
    case "RFI":
      if (raw.date_required) details.push({ label: "Date Required", value: raw.date_required });
      if (raw.submitted_date) details.push({ label: "Submitted", value: raw.submitted_date });
      if (raw.assigned_to) details.push({ label: "Assigned To", value: raw.assigned_to });
      if (raw.drawing_reference) details.push({ label: "Drawing Ref", value: raw.drawing_reference });
      if (raw.spec_section) details.push({ label: "Spec Section", value: raw.spec_section });
      if (raw.question) details.push({ label: "Question", value: raw.question.slice(0, 300) });
      if (raw.cost_impact_amount) details.push({ label: "Cost Impact", value: `$${Number(raw.cost_impact_amount).toLocaleString()}` });
      if (raw.schedule_impact_days) details.push({ label: "Schedule Impact", value: `${raw.schedule_impact_days} days` });
      break;

    case "DWG":
      if (raw.stage) details.push({ label: "Stage", value: raw.stage });
      if (raw.due_date) details.push({ label: "Due Date", value: raw.due_date });
      if (raw.reviewer) details.push({ label: "Reviewer", value: raw.reviewer });
      if (raw.discipline) details.push({ label: "Discipline", value: raw.discipline });
      if (raw.revision_number) details.push({ label: "Revision", value: raw.revision_number });
      break;

    case "SUB":
      if (raw.stage_summary) details.push({ label: "Stage", value: raw.stage_summary });
      if (raw.issued_date) details.push({ label: "Issued", value: raw.issued_date });
      if (raw.set_approved_date) details.push({ label: "Approved", value: raw.set_approved_date });
      if (raw.revision_history) details.push({ label: "History", value: raw.revision_history });
      break;

    case "CO":
      if (raw.co_amount) details.push({ label: "Amount", value: `$${Number(raw.co_amount).toLocaleString()}` });
      if (raw.submitted_date) details.push({ label: "Submitted", value: raw.submitted_date });
      if (raw.reason_code) details.push({ label: "Reason Code", value: raw.reason_code });
      if (raw.description) details.push({ label: "Description", value: raw.description.slice(0, 300) });
      break;

    case "DEL":
      if (raw.scheduled_date) details.push({ label: "Scheduled", value: raw.scheduled_date });
      if (raw.actual_date) details.push({ label: "Actual", value: raw.actual_date });
      if (raw.vendor) details.push({ label: "Vendor", value: raw.vendor });
      if (raw.carrier) details.push({ label: "Carrier", value: raw.carrier });
      if (raw.tracking_number) details.push({ label: "Tracking #", value: raw.tracking_number });
      if (raw.po_number) details.push({ label: "PO #", value: raw.po_number });
      if (raw.pieces) details.push({ label: "Pieces", value: String(raw.pieces) });
      if (raw.weight_tons) details.push({ label: "Weight", value: `${Number(raw.weight_tons).toFixed(1)}T` });
      break;

    case "WP":
      if (raw.phase) details.push({ label: "Phase", value: raw.phase });
      if (raw.status) details.push({ label: "WP Status", value: raw.status });
      if (raw.tonnage) details.push({ label: "Tonnage", value: `${Number(raw.tonnage).toFixed(1)}T` });
      if (raw.crew) details.push({ label: "Crew", value: raw.crew });
      if (raw.released_date) details.push({ label: "Released", value: raw.released_date });
      if (raw.percent_complete != null) details.push({ label: "% Complete", value: `${raw.percent_complete}%` });
      break;

    case "PAY":
      if (raw.period_to) details.push({ label: "Period End", value: raw.period_to });
      if (raw.totalScheduled) details.push({ label: "Scheduled Value", value: `$${raw.totalScheduled.toLocaleString()}` });
      if (raw.totalBilled) details.push({ label: "Billed to Date", value: `$${Math.round(raw.totalBilled).toLocaleString()}` });
      break;

    case "NOTE":
      if (raw.author) details.push({ label: "Author", value: raw.author });
      if (raw.note_date) details.push({ label: "Date", value: raw.note_date });
      if (raw.note) details.push({ label: "Content", value: raw.note.slice(0, 500) });
      break;
  }

  return details;
}

export const URGENCY_COLORS: Record<string, string> = {
  overdue: "var(--status-error)",
  "due-soon": "var(--status-warning)",
  blocking: "var(--accent)",
  awaiting: "var(--text-muted)",
  normal: "var(--border-default)",
};

export const PAGE_FOR_TYPE: Record<string, string> = {
  RFI: "RFIs",
  SUB: "Submittals",
  DWG: "Drawings",
  CO: "ChangeOrders",
  DEL: "Deliveries",
  WP: "WorkPackages",
  PAY: "SOV",
  NOTE: "ProductionNotes",
  TASK: "Schedule",
};
