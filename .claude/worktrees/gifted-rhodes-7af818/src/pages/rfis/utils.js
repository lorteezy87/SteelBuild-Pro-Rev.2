/**
 * Pure helpers for the RFI Hub — date math, overdue checks, sequencing
 * repair, CSV export. No React, no state, no network.
 */

import { parseUTCDate } from "@/components/shared/formatters";
import { RFI_NUMBER_PATTERN } from "./constants";

export const extractRfiSequence = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(RFI_NUMBER_PATTERN);
  return match ? Number(match[1]) : null;
};

export const sortRfisForRepair = (a, b) => {
  const numericDiff =
    (extractRfiSequence(a.rfi_number) ?? Number.MAX_SAFE_INTEGER) -
    (extractRfiSequence(b.rfi_number) ?? Number.MAX_SAFE_INTEGER);
  if (numericDiff !== 0) return numericDiff;

  // Use created_date (full timestamp) for precise ordering of bulk-uploaded RFIs
  const createdA = new Date(a.created_date || 0).getTime();
  const createdB = new Date(b.created_date || 0).getTime();
  if (createdA !== createdB) return createdA - createdB;

  // Fall back to submitted_date, then id
  const dateA = new Date(a.submitted_date || 0).getTime();
  const dateB = new Date(b.submitted_date || 0).getTime();
  if (dateA !== dateB) return dateA - dateB;

  return String(a.id).localeCompare(String(b.id));
};

export const buildRfiNumberRepairs = (records) => {
  const groups = records.reduce((acc, record) => {
    const key = record.project_id || "__missing_project__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {});

  const repairs = [];
  let skippedWithoutProject = 0;

  Object.entries(groups).forEach(([projectKey, group]) => {
    if (projectKey === "__missing_project__") {
      skippedWithoutProject += group.length;
      return;
    }

    const sorted = [...group].sort(sortRfisForRepair);
    const reserved = new Set();
    let nextNumber = 0;
    const candidates = [];

    sorted.forEach((record) => {
      const numeric = extractRfiSequence(record.rfi_number);
      if (numeric && !reserved.has(numeric)) {
        reserved.add(numeric);
        nextNumber = Math.max(nextNumber, numeric);
        return;
      }

      candidates.push(record);
    });

    candidates.forEach((record) => {
      nextNumber += 1;
      repairs.push({
        id: record.id,
        project_id: record.project_id,
        project_name: record.project_name || "",
        previous_number: record.rfi_number || "",
        next_number: `RFI #${String(nextNumber).padStart(3, "0")}`,
      });
    });
  });

  return { repairs, skippedWithoutProject };
};

export const daysOpen = (r) => {
  if (!r.submitted_date) return 0;
  const start = new Date(r.submitted_date + "T00:00:00");
  const end =
    r.date_answered && ["Answered", "Closed"].includes(r.status)
      ? new Date(r.date_answered + "T00:00:00")
      : new Date();
  return Math.max(0, Math.floor((end - start) / 86400000));
};

export const isClosed = (r) => ["Answered", "Closed"].includes(r.status);

export const isOverdue = (r) =>
  !isClosed(r) && r.date_required && parseUTCDate(r.date_required) < new Date();

/**
 * Map a raw RFI status to the short label shown in the row pipeline /
 * status pill. The lifecycle pipeline at the top of the page uses these
 * short labels ("INCOMPLETE" instead of "Incomplete Response", "REVIEW"
 * instead of "Under Review"); the row used to render the raw status text
 * which overflowed the 110-px status column for the longer values.
 *
 * Unknown statuses pass through unchanged so a future status value
 * (e.g. "On Hold") still renders something — just at full length.
 */
const RFI_STATUS_SHORT = {
  "Open": "OPEN",
  "Submitted": "OPEN",
  "Under Review": "REVIEW",
  "Incomplete Response": "INCOMPLETE",
  "Answered": "ANSWERED",
  "Closed": "CLOSED",
  "Draft": "DRAFT",
};

export const rfiStatusShortLabel = (status) =>
  RFI_STATUS_SHORT[status] || status || "OPEN";

export const exportRFIsToCSV = (rows, filename = "rfi-log.csv") => {
  const headers = [
    "RFI #", "Project", "Title", "Priority", "Status", "Ball in Court",
    "Submitted By", "Submitted Date", "Date Required", "Date Answered",
    "Answered By", "Drawing Ref", "Spec Section", "Assigned To", "Days Open",
    "Cost Impact", "Cost Amount", "Schedule Impact", "Schedule Days",
    "Question", "Answer",
  ];
  const data = rows.map((r) => [
    r.rfi_number || "",
    r.project_name || "",
    r.title || "",
    r.priority || "",
    r.status || "",
    r.ball_in_court || "",
    r.submitted_by || "",
    r.submitted_date || "",
    r.date_required || "",
    r.date_answered || "",
    r.answered_by || "",
    r.drawing_reference || "",
    r.spec_section || "",
    r.assigned_to || "",
    daysOpen(r),
    r.cost_impact ? "Yes" : "No",
    r.cost_impact_amount || "",
    r.schedule_impact ? "Yes" : "No",
    r.schedule_impact_days || "",
    (r.question || "").replace(/,/g, ";"),
    (r.answer || "").replace(/,/g, ";"),
  ]);
  const csv = [headers, ...data]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
