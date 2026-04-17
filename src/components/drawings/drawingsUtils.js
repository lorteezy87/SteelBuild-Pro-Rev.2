/**
 * drawingsUtils.js — Pure helper functions for the Drawings module
 *
 * No React imports — these are plain JS utilities for
 * overdue detection, CSV export, and filter/stat computation.
 */

import { IN_REVIEW_STAGES, STAGE_ORDER } from "./drawingsConfig";

/**
 * Decide whether a stage transition is legal.
 *
 * The submittal state machine is linear: Not Started → OFA → BFA → OFS →
 * BFS → FFF → Released. We allow:
 *   • Moving forward any number of steps (fast-track from OFA straight to
 *     Released is legitimate for small revisions)
 *   • Moving back to ANY earlier stage (rework/revision cycles often bounce
 *     a sheet back from BFS to OFA)
 *   • Staying put (no-op)
 *
 * The one transition we reject is moving between two unknown stages (legacy
 * rows with garbage strings). This is the F13 fix — before, any string could
 * overwrite any other stage silently.
 *
 * @param {string} from - Current stage
 * @param {string} to - Target stage
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateStageTransition(from, to) {
  if (from === to) return { ok: true };
  const fromIdx = STAGE_ORDER.indexOf(from);
  const toIdx = STAGE_ORDER.indexOf(to);
  if (toIdx === -1) {
    return { ok: false, reason: `Unknown target stage "${to}"` };
  }
  if (fromIdx === -1) {
    // Coming from a legacy/unknown state — allow the move so the user can
    // recover, but only to a well-defined stage.
    return { ok: true };
  }
  // All forward/backward transitions between valid stages are allowed.
  return { ok: true };
}

/**
 * Check whether a drawing is overdue (past due date and not yet released).
 * @param {{ due_date?: string, stage?: string }} drawing
 * @returns {boolean}
 */
export function isOverdue(drawing) {
  if (!drawing.due_date) return false;
  if (drawing.stage === "Released") return false;
  return new Date(drawing.due_date) < new Date();
}

/**
 * Calculate how many calendar days a drawing is late.
 * Returns 0 if not overdue.
 * @param {{ due_date?: string, stage?: string }} drawing
 * @returns {number}
 */
export function daysLate(drawing) {
  if (!isOverdue(drawing) || !drawing.due_date) return 0;
  return Math.max(1, Math.floor((Date.now() - new Date(drawing.due_date).getTime()) / 86400000));
}

/**
 * Determine urgency CSS class based on days late.
 * @param {number} days
 * @returns {string} CSS class name or empty string
 */
export function urgencyClass(days) {
  if (days >= 14) return "urgency-critical";
  if (days >= 7) return "urgency-danger";
  if (days > 0) return "urgency-warn";
  return "";
}

/**
 * Export a CSV transmittal log for the given drawings.
 * Triggers a browser download.
 * @param {Array} drawings
 * @param {string} [projectName]
 */
export function exportTransmittal(drawings, projectName) {
  const headers = [
    "Sheet Number", "Title", "Discipline", "Revision", "Stage",
    "Submitted Date", "Due Date", "Return Date", "Reviewer",
    "Priority", "Linked RFIs", "Notes",
  ];
  const rows = drawings.map(d => [
    d.sheet_number, d.title, d.discipline, d.revision_number, d.stage,
    d.submitted_date || "", d.due_date || "", d.return_date || "",
    d.reviewer || "", d.priority_flag ? "YES" : "",
    d.linked_rfi_ids || "", d.notes || "",
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName || "project"}_transmittal_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Compute package-level summary stats for the stats bar.
 *
 * Groups drawings by drawing_set_name to count unique packages rather
 * than individual sheets. Set-only parent rows (imported from Drive
 * with no child sheets) are also counted.
 *
 * @param {Array} drawings           — child sheet rows
 * @param {Array} [drawingSetRecords] — parent drawing_sets rows (optional)
 * @returns {{ total: number, released: number, inReview: number, overdue: number, priority: number, sheetCount: number }}
 */
export function computeStats(drawings, drawingSetRecords = []) {
  // Group drawings by set name
  const packages = {};
  drawings.forEach(d => {
    const name = (d.drawing_set_name || "").trim() || "(ungrouped)";
    if (!packages[name]) packages[name] = [];
    packages[name].push(d);
  });

  // Also count set-only parent rows (from Drive import, no child sheets)
  const childSetNames = new Set(Object.keys(packages));
  (drawingSetRecords || []).forEach(ds => {
    const name = (ds?.set_name || "").trim();
    if (name && !childSetNames.has(name)) {
      packages[name] = []; // empty = set-only
    }
  });

  const entries = Object.values(packages);

  return {
    total:      entries.length,
    released:   entries.filter(sheets => sheets.length > 0 && sheets.every(d => d.stage === "Released")).length,
    inReview:   entries.filter(sheets => sheets.some(d => IN_REVIEW_STAGES.includes(d.stage))).length,
    overdue:    entries.filter(sheets => sheets.some(d => isOverdue(d))).length,
    priority:   entries.filter(sheets => sheets.some(d => d.priority_flag)).length,
    sheetCount: drawings.length,
  };
}

/**
 * Compute per-discipline count map.
 * @param {Array} drawings
 * @param {string[]} disciplines
 * @returns {Record<string, number>}
 */
export function computeDisciplineCounts(drawings, disciplines) {
  const counts = { ALL: drawings.length };
  disciplines.forEach(d => {
    counts[d] = drawings.filter(x => x.discipline === d).length;
  });
  return counts;
}

/**
 * Build revision-control alert objects from current drawing + RFI data.
 * @param {Array} drawings
 * @param {Record<string, object>} rfiMap
 * @returns {Array<object>}
 */
export function buildRevisionAlerts(drawings, rfiMap) {
  const alerts = [];

  // 1. Unacknowledged revisions
  const unacknowledged = drawings.filter(d =>
    Number(d.revision_number || 0) > 0 &&
    !d.set_approval_status &&
    d.stage !== "Released"
  );
  if (unacknowledged.length > 0) {
    alerts.push({
      type: "warning",
      icon: "⚠",
      title: `${unacknowledged.length} Unacknowledged Revision${unacknowledged.length !== 1 ? "s" : ""}`,
      detail: `${unacknowledged.map(d => d.sheet_number).slice(0, 5).join(", ")}${unacknowledged.length > 5 ? ` +${unacknowledged.length - 5} more` : ""} — revised but not yet reviewed/approved`,
      sheets: unacknowledged,
      color: "var(--status-warning)",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.25)",
    });
  }

  // 2. Superseded drawings still active
  const superseded = drawings.filter(d =>
    (d.is_superseded || d.set_approval_status === "superseded") &&
    d.stage !== "Released"
  );
  if (superseded.length > 0) {
    alerts.push({
      type: "danger",
      icon: "⛔",
      title: `${superseded.length} Superseded Drawing${superseded.length !== 1 ? "s" : ""} Still Active`,
      detail: `${superseded.map(d => d.sheet_number).slice(0, 5).join(", ")}${superseded.length > 5 ? ` +${superseded.length - 5} more` : ""} — marked superseded but not at IFC stage. Remove or replace.`,
      sheets: superseded,
      color: "var(--status-error)",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.25)",
    });
  }

  // 3. Drawings blocked by open RFIs
  const withOpenRFIs = drawings.filter(d => {
    if (!d.linked_rfi_ids) return false;
    const rfiNums = d.linked_rfi_ids.split(",").map(s => s.trim());
    return rfiNums.some(num => {
      const rfi = rfiMap[num];
      return rfi && rfi.status !== "Closed" && rfi.status !== "Answered";
    });
  });
  if (withOpenRFIs.length > 0) {
    alerts.push({
      type: "info",
      icon: "!",
      title: `${withOpenRFIs.length} Drawing${withOpenRFIs.length !== 1 ? "s" : ""} Blocked by Open RFIs`,
      detail: `${withOpenRFIs.map(d => d.sheet_number).slice(0, 5).join(", ")}${withOpenRFIs.length > 5 ? ` +${withOpenRFIs.length - 5} more` : ""} — linked RFIs still unresolved`,
      sheets: withOpenRFIs,
      color: "var(--status-info)",
      bg: "rgba(59,130,246,0.06)",
      border: "rgba(59,130,246,0.25)",
    });
  }

  // 4. Rejected drawings needing resubmission
  const rejected = drawings.filter(d => d.set_approval_status === "rejected");
  if (rejected.length > 0) {
    alerts.push({
      type: "danger",
      icon: "X",
      title: `${rejected.length} Rejected Drawing${rejected.length !== 1 ? "s" : ""} Need Resubmission`,
      detail: `${rejected.map(d => d.sheet_number).slice(0, 5).join(", ")}${rejected.length > 5 ? ` +${rejected.length - 5} more` : ""}`,
      sheets: rejected,
      color: "var(--status-error)",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.25)",
    });
  }

  return alerts;
}
