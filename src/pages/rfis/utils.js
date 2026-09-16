/**
 * Pure helpers for the RFI Hub — date math, overdue checks, sequencing
 * repair, CSV export. No React, no state, no network.
 */

import { RFI_NUMBER_PATTERN, DENSITY_LS_KEY, DENSITY_PRESETS, INSIGHTS_LS_KEY } from "./constants";
import { isRfiClosed } from "@/lib/entityPredicates";
import { localToday } from "@/utils/dates";

export const extractRfiSequence = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(RFI_NUMBER_PATTERN);
  if (!match) return null;
  const sequence = Number(match[1]);
  return Number.isFinite(sequence) ? sequence : null;
};

const rfiSortTimestamp = (record) => {
  const time = new Date(record?.created_date || record?.created_at || record?.submitted_date || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const compareRfisByNumber = (a = {}, b = {}) => {
  const numA = extractRfiSequence(a.rfi_number);
  const numB = extractRfiSequence(b.rfi_number);
  const hasNumA = numA !== null;
  const hasNumB = numB !== null;

  if (hasNumA && hasNumB && numA !== numB) return numA - numB;
  if (hasNumA !== hasNumB) return hasNumA ? -1 : 1;

  const labelDiff = String(a.rfi_number || "").localeCompare(
    String(b.rfi_number || ""),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
  if (labelDiff !== 0) return labelDiff;

  const dateDiff = rfiSortTimestamp(a) - rfiSortTimestamp(b);
  if (dateDiff !== 0) return dateDiff;

  return String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true, sensitivity: "base" });
};

export const sortRfisForRepair = compareRfisByNumber;

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

/**
 * Age in days. A closed RFI stops ageing at `date_answered`; an open one ages
 * against today.
 *
 * The terminal check goes through the canonical predicate rather than a local
 * ["Answered","Closed"] list, which omitted **Void** — so a voided RFI kept
 * accruing "days open" forever and drifted to the top of age-sorted views.
 * Void rarely carries a `date_answered`, so it falls back to today's date and
 * is clamped at 0 rather than showing a negative age.
 */
export const daysOpen = (r) => {
  if (!r.submitted_date) return 0;
  const start = new Date(r.submitted_date + "T00:00:00");
  let end;
  if (isClosed(r)) {
    const stopDate = r.date_answered || r.updated_at;
    end = stopDate ? new Date(stopDate.slice(0, 10) + "T00:00:00") : start;
  } else {
    end = new Date();
  }
  return Math.max(0, Math.floor((end - start) / 86400000));
};

/** Terminal RFI statuses: Answered / Closed / Void (canonical entityPredicates). */
export const isClosed = (r) => isRfiClosed(r);

/**
 * Overdue = still open and `date_required` is strictly before local today.
 * Date-only comparison: `date_required` is a DATE column, and the date-only
 * shim parses "YYYY-MM-DD" as local NOON — comparing that against `new Date()`
 * made an RFI due today flip to overdue at 12:00. A day-string compare has no
 * time-of-day to flip on, and matches rfiControlCenter.derive's daysUntil.
 */
export const isOverdue = (r) => {
  if (!r || isClosed(r) || !r.date_required) return false;
  const due = String(r.date_required).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(due) && due < localToday();
};

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

// ─── RFI page derivations (extracted from RFIs.jsx) ─────────────────────────

/** Read the persisted density preset key from localStorage (default "normal"). */
export function loadDensity() {
  try {
    const v = localStorage.getItem(DENSITY_LS_KEY);
    if (v && DENSITY_PRESETS[v]) return v;
  } catch { /* noop */ }
  return "normal";
}

/** Read the persisted "insights strip collapsed" flag from localStorage. */
export function loadInsightsCollapsed() {
  try { return localStorage.getItem(INSIGHTS_LS_KEY) === "1"; } catch { return false; }
}

/** Count RFIs by status / overdue / critical for the filter tiles. */
/**
 * Count RFIs by status / overdue / critical for the filter tiles.
 *
 * `void` and the lifecycle rollups (`liveOpen` / `liveClosed`) are included so
 * the per-status counts actually reconcile against `all`. Previously Void was
 * counted in `all` but had no bucket and no filter, so a voided RFI inflated
 * the total while being unreachable from any chip.
 */
export function buildRfiCounts(rfis) {
  const overdue = rfis.filter((r) => isOverdue(r));
  return {
    all:        rfis.length,
    open:       rfis.filter((r) => r.status === "Open").length,
    review:     rfis.filter((r) => r.status === "Under Review").length,
    incomplete: rfis.filter((r) => r.status === "Incomplete Response").length,
    answered:   rfis.filter((r) => r.status === "Answered").length,
    closed:     rfis.filter((r) => r.status === "Closed").length,
    void:       rfis.filter((r) => r.status === "Void").length,
    // Lifecycle rollups — what the register's open/closed grouping counts.
    liveOpen:   rfis.filter((r) => !isClosed(r)).length,
    liveClosed: rfis.filter((r) => isClosed(r)).length,
    overdue:    overdue.length,
    critical:   rfis.filter((r) => r.priority === "Critical").length,
  };
}

/**
 * Apply the status filter, discipline filter, sequence filter, and free-text
 * search, then sort by RFI number. `matchesSeq` is the sequence-filter
 * predicate (passed in so this stays React-free) — the caller supplies
 * `matchesSequenceFilter` from the SequenceFilter component.
 */
export function filterAndSortRfis(rfis, { filter, disciplineFilter, seqFilter, search }, matchesSeq) {
  const q = search.trim().toLowerCase();
  return rfis
    .filter((r) => {
      if (filter === "open")       return r.status === "Open";
      if (filter === "review")     return r.status === "Under Review";
      if (filter === "incomplete") return r.status === "Incomplete Response";
      if (filter === "answered")   return r.status === "Answered";
      if (filter === "closed")     return r.status === "Closed";
      if (filter === "void")       return r.status === "Void";
      // Lifecycle filters — the "show me what is still live" question the
      // per-status chips could not express.
      if (filter === "live")       return !isClosed(r);
      if (filter === "settled")    return isClosed(r);
      if (filter === "overdue")    return isOverdue(r);
      if (filter === "critical")   return r.priority === "Critical";
      return true;
    })
    .filter((r) => {
      if (disciplineFilter === "All") return true;
      return (r.discipline || "").toLowerCase().trim() === disciplineFilter.toLowerCase().trim();
    })
    .filter((r) => matchesSeq(r, seqFilter))
    .filter((r) => {
      if (!q) return true;
      return (
        (r.rfi_number || "").toLowerCase().includes(q) ||
        (r.title || "").toLowerCase().includes(q) ||
        (r.submitted_by || "").toLowerCase().includes(q) ||
        (r.drawing_reference || "").toLowerCase().includes(q) ||
        (r.question || "").toLowerCase().includes(q) ||
        (r.answer || "").toLowerCase().includes(q)
      );
    })
    .sort(compareRfisByNumber);
}

/** Build a `project_id -> project name` lookup map. */
export function buildProjectNameMap(projects) {
  const m = {};
  for (const p of projects) m[p.id] = p.name || "";
  return m;
}
