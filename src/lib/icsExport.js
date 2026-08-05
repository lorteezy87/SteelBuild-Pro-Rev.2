/**
 * icsExport.js — Generate RFC-5545 iCalendar files for Outlook / Teams / Google.
 *
 * Construction PMs live in Outlook (and their GCs often live in Teams, which
 * consumes the same iCalendar format). A one-click "Export to calendar"
 * button on Schedule / Deliveries / RFIs gives us integration with the MS
 * ecosystem without a Microsoft Graph dance.
 *
 * Each event carries a stable UID derived from the source entity + type so
 * a re-export updates the original calendar entry instead of duplicating
 * it. Reminders (VALARM blocks) are set 1 day before due dates by default.
 *
 * Usage:
 *   downloadSchedule({
 *     filename: "project-DEMO-001-schedule.ics",
 *     events: [
 *       { uid: "task-abc", title: "Bldg 2 Erection", start: "2026-05-15", end: "2026-05-22", description: "...", category: "TASK" },
 *       { uid: "rfi-042",  title: "RFI-042 due", start: "2026-04-30", allDay: true, category: "RFI", reminderDaysBefore: 3 },
 *     ],
 *     calendarName: "SteelBuild Pro — Project DEMO-001",
 *   });
 */

// ── RFC 5545 helpers ────────────────────────────────────────────────────

const HOST = (typeof window !== "undefined" && window.location?.hostname) || "steelbuildpro.app";

/**
 * Fold long lines per RFC 5545 §3.1 — lines over 75 octets are split with
 * CRLF + a single leading space. Outlook and most clients are forgiving,
 * but Teams calendar import is strict about this.
 */
function foldLine(line) {
  const MAX = 74;
  if (line.length <= MAX) return line;
  const out = [];
  let i = 0;
  while (i < line.length) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + MAX));
    i += MAX;
  }
  return out.join("\r\n");
}

/**
 * Escape per RFC 5545 §3.3.11 — backslash, comma, semicolon, newlines.
 */
function escapeText(v) {
  if (v == null) return "";
  return String(v)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Format 'YYYY-MM-DD' → 'YYYYMMDD' (VALUE=DATE). */
function fmtDate(s) {
  if (!s) return null;
  const t = String(s).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t.replace(/-/g, "");
}

/** Format 'YYYY-MM-DDTHH:MM:SSZ' or Date → 'YYYYMMDDTHHMMSSZ'. */
function fmtDateTime(s) {
  if (!s) return null;
  const d = s instanceof Date ? s : new Date(s);
  if (isNaN(d)) return null;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function nowStamp() {
  return fmtDateTime(new Date());
}

function uidFor(rawUid) {
  // Stable URN-style so re-exports overwrite the old calendar entry.
  return `${rawUid}@${HOST}`;
}

// ── Public: build + download ────────────────────────────────────────────

/**
 * Returns the full .ics text content (CRLF line endings per spec).
 *
 * @param {object} opts
 * @param {Array}  opts.events          Event objects (see downloadSchedule docs)
 * @param {string} opts.calendarName    Calendar display name (X-WR-CALNAME)
 * @param {string} [opts.timezone='UTC'] Not currently used for DATE values
 */
export function buildIcs({ events = [], calendarName = "SteelBuild Pro" } = {}) {
  const lines = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push(`PRODID:-//S&H Steel Co//SteelBuild Pro//EN`);
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`));

  for (const ev of events) {
    const uid = uidFor(ev.uid || `${ev.category || "evt"}-${Math.random().toString(36).slice(2, 10)}`);
    const allDay = !!ev.allDay || (ev.start && !/T/.test(ev.start));

    let dtStart, dtEnd;
    if (allDay) {
      dtStart = fmtDate(ev.start);
      if (!dtStart) continue;
      // All-day events need DTEND one day AFTER the last day for Outlook
      // to render the right span. Default end = start + 1 day.
      const endDate = ev.end ? fmtDate(ev.end) : null;
      if (endDate) {
        // Add 1 day to end so Outlook renders the range inclusive.
        const d = new Date(endDate.slice(0, 4) + "-" + endDate.slice(4, 6) + "-" + endDate.slice(6, 8));
        d.setUTCDate(d.getUTCDate() + 1);
        dtEnd = fmtDate(d.toISOString().slice(0, 10));
      } else {
        const d = new Date(dtStart.slice(0, 4) + "-" + dtStart.slice(4, 6) + "-" + dtStart.slice(6, 8));
        d.setUTCDate(d.getUTCDate() + 1);
        dtEnd = fmtDate(d.toISOString().slice(0, 10));
      }
    } else {
      dtStart = fmtDateTime(ev.start);
      dtEnd   = fmtDateTime(ev.end || ev.start);
      if (!dtStart || !dtEnd) continue;
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowStamp()}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    } else {
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
    }
    lines.push(foldLine(`SUMMARY:${escapeText(ev.title || "Untitled")}`));
    if (ev.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(ev.description)}`));
    }
    if (ev.location) {
      lines.push(foldLine(`LOCATION:${escapeText(ev.location)}`));
    }
    if (ev.category) {
      lines.push(`CATEGORIES:${escapeText(ev.category)}`);
    }
    if (ev.url) {
      lines.push(foldLine(`URL:${ev.url}`));
    }
    // Status: CONFIRMED is the sane default. Completed tasks become
    // TENTATIVE so they gray out on import without disappearing.
    const status = ev.status === "Complete" ? "TENTATIVE" : "CONFIRMED";
    lines.push(`STATUS:${status}`);

    // Reminder
    const reminderDays = Number.isFinite(ev.reminderDaysBefore)
      ? ev.reminderDaysBefore
      : allDay ? 1 : null;
    if (reminderDays && reminderDays > 0) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(foldLine(`DESCRIPTION:${escapeText(ev.title || "Reminder")}`));
      lines.push(`TRIGGER:-P${reminderDays}D`);
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Trigger a browser download of the generated ICS.
 *
 * @param {object} opts  Same shape as buildIcs + `filename`.
 */
export function downloadIcs({ filename = "schedule.ics", ...rest } = {}) {
  const ics = buildIcs(rest);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on a tick delay so Safari has time to read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Entity → event shape helpers ────────────────────────────────────────

export function scheduleTaskToEvent(task, projectNumber = "") {
  if (!task?.start_date && !task?.end_date) return null;
  const start = task.start_date || task.end_date;
  const end   = task.end_date   || task.start_date;
  const desc = [
    task.phase ? `Phase: ${task.phase}` : "",
    task.crew_name ? `Crew: ${task.crew_name}` : "",
    task.status ? `Status: ${task.status}` : "",
    task.notes || "",
  ].filter(Boolean).join("\n");
  return {
    uid:       `task-${task.id}`,
    title:     projectNumber ? `[${projectNumber}] ${task.task_name}` : task.task_name,
    start,
    end,
    allDay:    true,
    description: desc,
    status:    task.status,
    category:  "TASK",
    reminderDaysBefore: task.is_milestone ? 2 : 1,
  };
}

export function rfiToEvent(rfi, projectNumber = "") {
  if (!rfi?.date_required) return null;
  return {
    uid:         `rfi-${rfi.id}`,
    title:       projectNumber
      ? `[${projectNumber}] ${rfi.rfi_number || "RFI"} — ${rfi.subject || "Due"}`
      : `${rfi.rfi_number || "RFI"} due`,
    start:       rfi.date_required,
    allDay:      true,
    description: rfi.question || rfi.subject || "",
    category:    "RFI",
    reminderDaysBefore: 3,
  };
}

export function submittalToEvent(sub, projectNumber = "") {
  if (!sub?.required_date) return null;
  return {
    uid:         `submittal-${sub.id}`,
    title:       projectNumber
      ? `[${projectNumber}] ${sub.submittal_number} — ${sub.title}`
      : `${sub.submittal_number} — ${sub.title}`,
    start:       sub.required_date,
    allDay:      true,
    description: [
      sub.status ? `Status: ${sub.status}` : "",
      sub.ball_in_court ? `Ball in court: ${sub.ball_in_court}` : "",
      sub.notes || "",
    ].filter(Boolean).join("\n"),
    category:    "SUBMITTAL",
    reminderDaysBefore: 5,
  };
}

export function deliveryToEvent(del, projectNumber = "") {
  // deliveries.scheduled_date is the planned arrival; fall back to the
  // contractor-stated required_date if scheduled hasn't been set yet so
  // the calendar still shows the constraint.
  const date = del?.scheduled_date || del?.required_date;
  if (!date) return null;
  return {
    uid:         `delivery-${del.id}`,
    title:       projectNumber
      ? `[${projectNumber}] Delivery: ${del.description || del.delivery_title || del.po_number || "Load"}`
      : `Delivery: ${del.description || del.delivery_title || del.po_number || "Load"}`,
    start:       date,
    allDay:      true,
    description: [
      del.vendor ? `Vendor: ${del.vendor}` : "",
      del.po_number ? `PO: ${del.po_number}` : "",
      del.pieces ? `Pieces: ${del.pieces}` : "",
      del.weight_tons ? `Weight: ${del.weight_tons}t` : "",
      del.procurement_category ? `Type: ${del.procurement_category}` : "",
      del.is_long_lead ? `⚠ Long-lead item` : "",
    ].filter(Boolean).join("\n"),
    location:    del.receiving_location || "",
    category:    "DELIVERY",
    reminderDaysBefore: del.is_long_lead ? 14 : 2,
  };
}

export function actionItemToEvent(item, projectNumber = "") {
  if (!item?.due_date) return null;
  return {
    uid:         `action-${item.id}`,
    title:       projectNumber
      ? `[${projectNumber}] Action: ${item.title || "Item"}`
      : `Action: ${item.title || "Item"}`,
    start:       item.due_date,
    allDay:      true,
    description: [
      item.status ? `Status: ${item.status}` : "",
      item.category ? `Category: ${item.category}` : "",
      item.description || "",
    ].filter(Boolean).join("\n"),
    category:    "ACTION",
    reminderDaysBefore: 1,
  };
}

export function inspectionToEvent(insp, projectNumber = "") {
  if (!insp?.inspection_date) return null;
  return {
    uid:         `inspection-${insp.id}`,
    title:       projectNumber
      ? `[${projectNumber}] Inspection: ${insp.description || "Scheduled"}`
      : `Inspection: ${insp.description || "Scheduled"}`,
    start:       insp.inspection_date,
    allDay:      true,
    description: [
      insp.inspector_name ? `Inspector: ${insp.inspector_name}` : "",
      insp.status ? `Status: ${insp.status}` : "",
      insp.sign_off_status ? `Sign-off: ${insp.sign_off_status}` : "",
    ].filter(Boolean).join("\n"),
    category:    "INSPECTION",
    reminderDaysBefore: 1,
  };
}

export function changeOrderToEvent(co, projectNumber = "") {
  // Surface COs on the calendar at their most-recent meaningful date:
  // approved → submitted → created. Helps PMs see "the day this CO was
  // signed" alongside the rest of the schedule.
  const date = co?.approved_date || co?.submitted_date || co?.created_at;
  if (!date) return null;
  const dateOnly = String(date).slice(0, 10);
  const label = co?.approved_date ? "Approved" : co?.submitted_date ? "Submitted" : "Filed";
  return {
    uid:         `co-${co.id}`,
    title:       projectNumber
      ? `[${projectNumber}] CO ${co.co_number || ""} ${label}`.trim()
      : `CO ${co.co_number || ""} ${label}`.trim(),
    start:       dateOnly,
    allDay:      true,
    description: [
      co.title ? co.title : "",
      co.status ? `Status: ${co.status}` : "",
      co.description || "",
    ].filter(Boolean).join("\n"),
    category:    "CHANGE_ORDER",
    reminderDaysBefore: 0,
  };
}

export function dailyLogToEvent(log, projectNumber = "") {
  if (!log?.date) return null;
  return {
    uid:         `dailylog-${log.id}`,
    title:       projectNumber
      ? `[${projectNumber}] Daily Log Filed`
      : `Daily Log Filed`,
    start:       log.date,
    allDay:      true,
    description: [
      log.crew_name ? `Crew: ${log.crew_name}` : "",
      log.weather_description ? `Weather: ${log.weather_description}` : "",
      Number.isFinite(log.safety_incidents) && log.safety_incidents > 0
        ? `Safety incidents: ${log.safety_incidents}` : "",
    ].filter(Boolean).join("\n"),
    category:    "DAILY_LOG",
    reminderDaysBefore: 0,
  };
}
