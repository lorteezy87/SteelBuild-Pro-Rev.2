/**
 * urgencyEngine.js — Per-entity urgency scoring for the Command Center feed.
 *
 * Each function accepts one entity record and returns:
 * {
 *   urgency:       'overdue' | 'due-soon' | 'blocking' | 'awaiting' | 'normal',
 *   daysValue:     number,          // see "daysValue contract" below
 *   displayStatus: string,          // human label for the feed row
 *   quickAction:   { label: string, route: string },
 *   itemType:      string,          // badge label: RFI / DWG / CO / DEL / WP / SUB / PAY / NOTE
 *   title:         string,
 *   owner:         string | null,   // who the ball is with
 *   projectId:     string,
 *   projectNumber: string | null,
 * }
 *
 * ── daysValue contract (sortLogic.js relies on this — do NOT break it) ────
 *
 *   Invariant: within any single urgency bucket, HIGHER daysValue = more urgent.
 *
 *   sortLogic's tie-breaker is `b.daysValue - a.daysValue` (descending), so
 *   this convention drives the order items appear inside each bucket.
 *
 *   Concrete semantics per entity:
 *     - RFI / Drawing / Delivery / SOVItem with a due date: store `-dueDays`
 *       so 5-days-overdue → +5 (sorts above 1-day-overdue → +1) and
 *       1-day-away → -1 (sorts above 5-days-away → -5).
 *     - RFI / ChangeOrder / WorkPackage / DrawingSet without a due date:
 *       store `daysSince(created/issued/submitted)` so older-is-more-urgent.
 *     - ProductionNote: store `age` (days since note_date) for the same
 *       older-is-more-urgent pattern.
 *
 *   Both branches satisfy "higher = more urgent" — a refactor that stores
 *   `+dueDays` (positive-for-future) would silently invert the sort inside
 *   the overdue bucket. Tests in urgencyEngine.test.js guard against this.
 *
 * Tunable thresholds are exported as constants so they can be overridden.
 */

// ── Helpers ─────────────────────────────────────────────────────────────
// Delegate to the shared local-midnight helpers so urgencyEngine,
// todayView, and UpcomingWindows all agree on what "today" is. Prior
// to unification these split on UTC-vs-local midnight and could place
// the same item into different windows depending on time of day.

import {
  daysSince as _daysSince,
  daysUntil as _daysUntil,
  todayLocalISO,
} from "@/lib/dateMath";

export const daysSince = (v) => _daysSince(v);
export const daysUntil = (v) => _daysUntil(v);

const todayStr = () => todayLocalISO();

// ── Tunable thresholds ──────────────────────────────────────────────────

export const THRESHOLDS = {
  RFI_DEFAULT_RESPONSE_DAYS: 7,
  RFI_DUE_SOON_WINDOW: 3,
  RFI_MIN_OPEN_DAYS: 3,
  CO_STALE_DAYS: 7,
  DELIVERY_SOON_DAYS: 7,
  WP_FAB_RISK_LAG_DAYS: 14,
  SOV_DUE_SOON_DAYS: 7,
  // Schedule tasks surface in the feed if within this many days of
  // today (past or future). 90d covers ~3 months of near-term work
  // (typical Detailing → Fabrication → Delivery → Installation
  // sequence for a steel package), so every Gantt row the user is
  // actively working toward is reachable from the Command Center.
  // Tasks further out still live on the Gantt itself; the cap keeps
  // the main feed from being a firehose on big projects.
  TASK_HORIZON_DAYS: 90,
  TASK_DUE_SOON_DAYS: 7,
};

// ── RFI ─────────────────────────────────────────────────────────────────

export function rfiUrgency(rfi, projectMap = {}) {
  const daysOpen = daysSince(rfi.submitted_date || rfi.created_date);
  const dueDays = daysUntil(rfi.date_required);
  const isBlocking = !!(rfi.schedule_impact || rfi.cost_impact);
  const bic = rfi.ball_in_court || "Contractor";
  const project = projectMap[rfi.project_id] || {};

  // Answered / Closed → skip
  if (rfi.status === "Closed" || rfi.status === "Answered") return null;

  let urgency = "normal";
  let displayStatus = `Open ${daysOpen}d`;

  if (isBlocking) {
    urgency = "blocking";
    displayStatus = `Blocking — open ${daysOpen}d`;
  }

  if (rfi.date_required) {
    if (dueDays < 0) {
      urgency = "overdue";
      displayStatus = `${Math.abs(dueDays)}d past due`;
    } else if (dueDays <= THRESHOLDS.RFI_DUE_SOON_WINDOW) {
      if (urgency !== "blocking") urgency = "due-soon";
      displayStatus = dueDays === 0 ? "Due today" : `Due in ${dueDays}d`;
    }
  } else if (daysOpen > THRESHOLDS.RFI_DEFAULT_RESPONSE_DAYS) {
    if (urgency !== "blocking") urgency = "overdue";
    displayStatus = `${daysOpen - THRESHOLDS.RFI_DEFAULT_RESPONSE_DAYS}d past target`;
  }

  // Awaiting others
  if (urgency === "normal" && bic !== "Contractor" && rfi.status === "Open") {
    urgency = "awaiting";
    displayStatus = `Awaiting ${bic} — ${daysOpen}d`;
  }

  // Inclusion gate: skip low-noise items
  if (urgency === "normal" && daysOpen <= THRESHOLDS.RFI_MIN_OPEN_DAYS && !isBlocking) return null;

  return {
    urgency,
    daysValue: rfi.date_required ? -dueDays : daysOpen,
    displayStatus,
    quickAction: { label: "View RFI", route: `/RFIs?project=${rfi.project_id}&rfi=${rfi.id}` },
    itemType: "RFI",
    title: `${rfi.rfi_number || "RFI"} — ${rfi.subject || rfi.title || "(no subject)"}`,
    owner: bic,
    projectId: rfi.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: rfi.id,
    priority: rfi.priority || null,
    raw: rfi,
  };
}

// ── Drawing (sheet-level) ───────────────────────────────────────────────

export function drawingUrgency(drawing, projectMap = {}) {
  const stage = drawing.stage || "Not Started";
  const project = projectMap[drawing.project_id] || {};

  // Only surface actionable stages
  const actionableStages = new Set(["BFA", "OFS", "FFF"]);
  if (!actionableStages.has(stage)) return null;

  const dueDays = daysUntil(drawing.due_date);
  let urgency = "normal";
  let displayStatus = `Stage: ${stage}`;

  if (drawing.due_date && dueDays < 0) {
    urgency = "overdue";
    displayStatus = `${stage} — ${Math.abs(dueDays)}d past due`;
  } else if (drawing.due_date && dueDays <= 7) {
    urgency = "due-soon";
    displayStatus = `${stage} — due in ${dueDays}d`;
  } else if (stage === "FFF") {
    urgency = "normal";
    displayStatus = "FFF — pending release";
  } else if (!drawing.due_date && (stage === "BFA" || stage === "OFS")) {
    urgency = "awaiting";
    displayStatus = `${stage} — awaiting return`;
  }

  if (urgency === "normal" && stage !== "FFF") return null;

  return {
    urgency,
    daysValue: drawing.due_date ? -dueDays : 0,
    displayStatus,
    quickAction: { label: "Open Drawing", route: `/Drawings?project=${drawing.project_id}` },
    itemType: "DWG",
    title: `${drawing.sheet_number || drawing.drawing_number || "Sheet"} — ${drawing.title || "(untitled)"}`,
    owner: drawing.reviewer || null,
    projectId: drawing.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: drawing.id,
    raw: drawing,
  };
}

// ── DrawingSet (set-level submittals) ───────────────────────────────────

export function drawingSetUrgency(ds, projectMap = {}) {
  const status = ds.set_approval_status;
  const project = projectMap[ds.project_id] || {};

  // Only surface pending_review or rejected
  if (status !== "pending_review" && status !== "rejected") return null;

  const issuedDays = daysSince(ds.issued_date);
  let urgency = "normal";
  let displayStatus = status === "rejected" ? "Rejected — action needed" : `Pending review — ${issuedDays}d`;

  if (status === "rejected") {
    urgency = "overdue";
  } else if (issuedDays > 14) {
    urgency = "overdue";
    displayStatus = `Pending ${issuedDays}d — overdue`;
  } else if (issuedDays > 7) {
    urgency = "due-soon";
    displayStatus = `Pending ${issuedDays}d`;
  } else {
    urgency = "awaiting";
    displayStatus = `Pending review — ${issuedDays}d`;
  }

  return {
    urgency,
    daysValue: issuedDays,
    displayStatus,
    quickAction: { label: "View Set", route: `/Drawings?project=${ds.project_id}` },
    itemType: "SUB",
    title: `${ds.set_name || "Drawing Set"} — ${ds.stage_summary || status}`,
    owner: null,
    projectId: ds.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: ds.id,
    raw: ds,
  };
}

// ── Change Order ────────────────────────────────────────────────────────

export function changeOrderUrgency(co, projectMap = {}) {
  const status = co.status;
  const project = projectMap[co.project_id] || {};

  if (["Approved", "Rejected", "Void"].includes(status)) return null;

  const daysSub = daysSince(co.submitted_date || co.created_date);
  let urgency = "normal";
  let displayStatus = `${status} — ${daysSub}d`;

  if (status === "Draft") {
    if (daysSub > THRESHOLDS.CO_STALE_DAYS) {
      urgency = "due-soon";
      displayStatus = `Draft — stale ${daysSub}d`;
    } else {
      return null; // Fresh drafts aren't urgent
    }
  } else if (status === "Submitted" || status === "Under Review") {
    if (daysSub > THRESHOLDS.CO_STALE_DAYS) {
      urgency = "overdue";
      displayStatus = `${status} ${daysSub}d — needs follow-up`;
    } else {
      urgency = "awaiting";
      displayStatus = `${status} — ${daysSub}d`;
    }
  }

  return {
    urgency,
    daysValue: daysSub,
    displayStatus,
    quickAction: { label: "View CO", route: `/ChangeOrders?project=${co.project_id}` },
    itemType: "CO",
    title: `${co.co_number || "CO"} — ${co.title || co.description || "(untitled)"}`,
    owner: status === "Submitted" ? "GC" : null,
    projectId: co.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: co.id,
    raw: co,
  };
}

// ── Delivery ────────────────────────────────────────────────────────────

export function deliveryUrgency(del, projectMap = {}) {
  const status = del.status;
  const project = projectMap[del.project_id] || {};

  if (status === "Delivered") return null;

  const dueDays = daysUntil(del.scheduled_date);
  let urgency = "normal";
  let displayStatus = `${status || "Scheduled"}`;

  if (status === "Delayed" || status === "Rejected") {
    urgency = "overdue";
    displayStatus = status === "Delayed" ? "Delayed" : "Rejected — redelivery needed";
  } else if (del.scheduled_date && dueDays < 0) {
    urgency = "overdue";
    displayStatus = `${Math.abs(dueDays)}d late`;
  } else if (del.scheduled_date && dueDays <= THRESHOLDS.DELIVERY_SOON_DAYS) {
    urgency = "due-soon";
    displayStatus = dueDays === 0 ? "Due today" : `Arriving in ${dueDays}d`;
  } else if (status === "In Transit") {
    urgency = "normal";
    displayStatus = "In transit";
  } else {
    return null; // Not imminent
  }

  const pieces = del.pieces ? `${del.pieces} pcs` : "";
  const tons = del.weight_tons ? `${Number(del.weight_tons).toFixed(1)}T` : "";
  const suffix = [pieces, tons].filter(Boolean).join(" / ");

  return {
    urgency,
    daysValue: del.scheduled_date ? -dueDays : 0,
    displayStatus,
    quickAction: { label: "View Delivery", route: `/Deliveries?project=${del.project_id}` },
    itemType: "DEL",
    title: `${del.delivery_title || del.description || "Delivery"} ${suffix ? `(${suffix})` : ""}`,
    owner: del.vendor || del.carrier || null,
    projectId: del.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: del.id,
    raw: del,
  };
}

// ── Work Package ────────────────────────────────────────────────────────

export function workPackageUrgency(wp, projectMap = {}) {
  const status = wp.status;
  const phase = wp.phase;
  const project = projectMap[wp.project_id] || {};

  if (status === "Complete") return null;

  let urgency = "normal";
  let displayStatus = `${phase || "—"} / ${status}`;

  // On Hold = blocked
  if (status === "On Hold") {
    urgency = "blocking";
    displayStatus = "On Hold — blocked";
  }
  // Fabrication phase, not started, and past released_date
  else if (phase === "Fabrication" && status === "Not Started" && wp.released_date) {
    const relDays = daysSince(wp.released_date);
    if (relDays > THRESHOLDS.WP_FAB_RISK_LAG_DAYS) {
      urgency = "overdue";
      displayStatus = `Released ${relDays}d ago — not started`;
    }
  }
  // Fab or Erection phase, In Progress but low completion
  else if ((phase === "Fabrication" || phase === "Erection") && status === "In Progress") {
    const pct = Number(wp.percent_complete) || 0;
    if (pct < 25 && wp.released_date && daysSince(wp.released_date) > 30) {
      urgency = "due-soon";
      displayStatus = `${phase} — ${pct}% after ${daysSince(wp.released_date)}d`;
    } else {
      return null; // Normal progress
    }
  } else {
    return null; // Not actionable
  }

  return {
    urgency,
    daysValue: wp.released_date ? daysSince(wp.released_date) : 0,
    displayStatus,
    quickAction: { label: "View WP", route: `/WorkPackages?project=${wp.project_id}` },
    itemType: "WP",
    title: `${wp.wp_number || "WP"} — ${wp.name || "(unnamed)"}`,
    owner: wp.crew || null,
    projectId: wp.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: wp.id,
    raw: wp,
  };
}

// ── SOV / Pay App (aggregated by application_number) ────────────────────

export function sovUrgency(sovGroup, projectMap = {}) {
  // sovGroup = { application_number, project_id, period_to, totalScheduled, totalBilled, items }
  const project = projectMap[sovGroup.project_id] || {};
  const dueDays = daysUntil(sovGroup.period_to);

  let urgency = "normal";
  let displayStatus = `App #${sovGroup.application_number}`;

  if (sovGroup.period_to && dueDays < 0) {
    urgency = "overdue";
    displayStatus = `Pay App #${sovGroup.application_number} — ${Math.abs(dueDays)}d past period`;
  } else if (sovGroup.period_to && dueDays <= THRESHOLDS.SOV_DUE_SOON_DAYS) {
    urgency = "due-soon";
    displayStatus = `Pay App #${sovGroup.application_number} — due in ${dueDays}d`;
  } else {
    return null;
  }

  return {
    urgency,
    daysValue: sovGroup.period_to ? -dueDays : 0,
    displayStatus,
    quickAction: { label: "View SOV", route: `/SOV?project=${sovGroup.project_id}` },
    itemType: "PAY",
    title: `Pay App #${sovGroup.application_number}`,
    owner: null,
    projectId: sovGroup.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: `sov-${sovGroup.project_id}-${sovGroup.application_number}`,
    raw: sovGroup,
  };
}

// ── Schedule Task ───────────────────────────────────────────────────────
//
// Every non-complete schedule_task inside our TASK_HORIZON_DAYS becomes
// a feed item. This is the missing piece that was keeping Installation-
// phase rows out of the 48-hour / 10-day windows: Command Center was
// pulling rfis, drawings, deliveries, WPs, COs, SOV, notes — but not
// schedule_tasks themselves.
//
// Anchor date picks what's most relevant for the row:
//   - "Not Started"       → anchor on start_date   (when work should begin)
//   - "In Progress"       → anchor on end_date     (when it's due to finish)
//   - "Delayed"           → anchor on end_date, forced overdue
//   - anything else w/ dates → fall back to start_date, then end_date
//
// raw.due_date is populated with the chosen anchor so the downstream
// UpcomingWindows + todayView components (which look at raw.due_date /
// raw.scheduled_date / raw.date_required / raw.period_to) bucket the
// task into the correct horizon without further changes.
export function scheduleTaskUrgency(task, projectMap = {}) {
  if (!task) return null;
  const project = projectMap[task.project_id] || {};
  const status = task.status || "Not Started";

  // Done & cancelled don't need action.
  if (status === "Complete" || status === "Cancelled") return null;

  // Pick the anchor date — drives bucket placement and days-calculation.
  let anchor = null;
  let anchorKind = null;
  if (status === "In Progress" || status === "Delayed") {
    anchor = task.end_date || task.start_date || null;
    anchorKind = task.end_date ? "finish" : "start";
  } else {
    anchor = task.start_date || task.end_date || null;
    anchorKind = task.start_date ? "start" : "finish";
  }
  if (!anchor) return null; // no dates → can't place

  const dueDays = daysUntil(anchor);
  if (!Number.isFinite(dueDays)) return null;

  // Horizon gate: keep the feed focused. Anything past-due gets in; anything
  // further than TASK_HORIZON_DAYS in the future drops out unless it's
  // blocking (On Hold).
  const onHold = status === "On Hold";
  if (!onHold && dueDays > THRESHOLDS.TASK_HORIZON_DAYS) return null;

  // Urgency classification.
  let urgency = "normal";
  let displayStatus;
  if (onHold) {
    urgency = "blocking";
    displayStatus = "On hold — blocked";
  } else if (status === "Delayed") {
    urgency = "overdue";
    displayStatus = `Delayed${dueDays < 0 ? ` — ${Math.abs(dueDays)}d past finish` : ""}`;
  } else if (dueDays < 0) {
    urgency = "overdue";
    displayStatus = anchorKind === "finish"
      ? `${Math.abs(dueDays)}d past finish`
      : `${Math.abs(dueDays)}d past start`;
  } else if (dueDays === 0) {
    urgency = "due-soon";
    displayStatus = anchorKind === "finish" ? "Due today" : "Starts today";
  } else if (dueDays <= THRESHOLDS.TASK_DUE_SOON_DAYS) {
    urgency = "due-soon";
    displayStatus = anchorKind === "finish"
      ? `Due in ${dueDays}d`
      : `Starts in ${dueDays}d`;
  } else {
    urgency = "normal";
    displayStatus = anchorKind === "finish"
      ? `Due in ${dueDays}d`
      : `Starts in ${dueDays}d`;
  }

  // Compose row copy
  const phaseLabel = task.phase ? task.phase : null;
  const prefix = phaseLabel ? `${phaseLabel} — ` : "";
  const titleBits = [task.wbs_code, task.task_name].filter(Boolean);
  const title = titleBits.length ? titleBits.join(" — ") : "(unnamed task)";
  const owner = task.resource_names || task.assigned_to || task.crew || null;

  return {
    urgency,
    // Same sign convention as RFI/Delivery: higher daysValue = more
    // urgent within the same bucket. `-dueDays` turns past-due into
    // positive numbers that sort first.
    daysValue: -dueDays,
    displayStatus: `${prefix}${displayStatus}`,
    quickAction: { label: "View Schedule", route: `/Schedule?project=${task.project_id}` },
    itemType: "TASK",
    title,
    owner,
    projectId: task.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: task.id,
    raw: {
      ...task,
      // Prime due_date with the chosen anchor so UpcomingWindows and
      // todayView (which expect raw.due_date / scheduled_date / etc.)
      // place this item into the right day without special-casing.
      due_date: anchor,
    },
  };
}

// ── Production Note ─────────────────────────────────────────────────────

export function productionNoteUrgency(note, projectMap = {}) {
  if (note.is_resolved) return null;

  const project = projectMap[note.project_id] || {};
  const age = daysSince(note.note_date || note.created_date);

  let urgency = "normal";
  let displayStatus = `Unresolved — ${age}d`;

  if (note.is_high_priority) {
    urgency = age > 3 ? "overdue" : "blocking";
    displayStatus = `High priority — ${age}d unresolved`;
  } else if (age > 7) {
    urgency = "due-soon";
    displayStatus = `Unresolved ${age}d`;
  } else {
    return null; // Recent, low-priority — not urgent
  }

  return {
    urgency,
    daysValue: age,
    displayStatus,
    quickAction: { label: "View Note", route: `/ProductionNotes?project=${note.project_id}` },
    itemType: "NOTE",
    title: `${note.note ? note.note.slice(0, 80) : "(empty note)"}${note.note && note.note.length > 80 ? "…" : ""}`,
    owner: note.author || null,
    projectId: note.project_id,
    projectNumber: project.project_number || null,
    projectName: project.name || null,
    sourceId: note.id,
    raw: note,
  };
}
