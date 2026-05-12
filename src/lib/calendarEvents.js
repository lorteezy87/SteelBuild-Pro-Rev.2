/**
 * calendarEvents.js — normalize every entity into a single CalendarEvent
 * shape so the calendar grid only ever knows about one type.
 *
 * A CalendarEvent looks like:
 *   {
 *     id:        unique key (entity-type prefixed)
 *     entityId:  source row id (for click-to-open)
 *     type:      "task" | "milestone" | "delivery" | "rfi" | "submittal"
 *                | "co" | "action" | "inspection" | "daily_log" | "drawing"
 *                | "project_anchor"
 *     title:     short label rendered in pills
 *     subtitle?: secondary text (status, vendor, etc.)
 *     start:     YYYY-MM-DD
 *     end:       YYYY-MM-DD (inclusive — equals start for single-day)
 *     status?:   passthrough for tinting
 *     accent:    CSS color string (entity palette — no purple/pink)
 *     icon:      single emoji glyph (text icon — keeps print legible)
 *     navTo:     path to navigate to on click (e.g. "/RFIs?id=...")
 *     priority:  sort weight inside a day cell (lower = first)
 *   }
 *
 * The colors picked here line up with what the rest of the app uses
 * for those entities (see ScheduleTimelineSection STAGE_COLOR + Fab
 * Release / Procurement palettes). Strict no-purple, no-pink rule.
 */

// ── Palette tokens (pulled from the existing app vocabulary) ──────────
// Hard-coded hex/var references are intentional — these need to be
// stable across themes for the calendar's "color = entity type" promise
// to hold.
export const EVENT_COLOR = {
  task:           "var(--accent)",                // blue-ish project accent
  milestone:      "var(--status-warning)",        // amber diamond
  delivery:       "#0d9488",                      // teal — same as Shipped chevron
  procurement:    "#2563eb",                      // blue — distinct from freight delivery
  rfi:            "var(--status-error)",          // red — RFI date_required is an SLA cliff
  submittal:      "var(--status-review)",         // amber/orange
  co:             "var(--status-success)",        // green when approved, gray when pending (handled inline)
  co_pending:     "var(--text-secondary)",
  action:         "var(--status-info)",           // info blue
  inspection:     "#0891b2",                      // cyan — distinct from delivery teal
  daily_log:      "var(--text-muted)",            // muted — these are "informational"
  drawing:        "var(--text-secondary)",
  project_anchor: "var(--accent-strong, var(--accent))",
};

// ── Entity → events ─────────────────────────────────────────────────

function iso(s) {
  if (!s) return null;
  return String(s).slice(0, 10);
}

function eventsFromScheduleTask(t) {
  if (!t) return [];
  const start = iso(t.start_date);
  const end   = iso(t.end_date) || start;
  if (!start) return [];
  const isMilestone = t.task_type === "Milestone" || t.is_milestone === true;
  const taskTitle =
    t.task_name ||
    t.name ||
    t.title ||
    t.activity_name ||
    t.description ||
    (t.phase ? `${t.phase} task` : "Untitled task");
  return [{
    id:        `task-${t.id}`,
    entityId:  t.id,
    type:      isMilestone ? "milestone" : "task",
    title:     taskTitle,
    subtitle:  t.phase || t.status || "",
    start,
    end:       isMilestone ? start : end,
    status:    t.status,
    accent:    isMilestone ? EVENT_COLOR.milestone : EVENT_COLOR.task,
    icon:      isMilestone ? "◆" : "▰",
    navTo:     `/Schedule`,
    priority:  isMilestone ? 0 : 1,
    raw:       t,
  }];
}

function eventsFromDelivery(d) {
  if (!d || d.is_deleted) return [];
  const date = iso(d.scheduled_date) || iso(d.required_date);
  if (!date) return [];
  // procurement_category is set on procurement-style deliveries (long
  // lead items, anchor bolts, embeds). null = freight / steel haul.
  const isProcurement = !!d.procurement_category;
  return [{
    id:        `delivery-${d.id}`,
    entityId:  d.id,
    type:      isProcurement ? "procurement" : "delivery",
    title:     d.delivery_title || d.description || d.po_number || "Delivery",
    subtitle:  isProcurement
      ? d.procurement_category || "Procurement"
      : (d.po_number ? `PO ${d.po_number}` : "Freight"),
    start:     date,
    end:       date,
    status:    d.status,
    accent:    isProcurement ? EVENT_COLOR.procurement : EVENT_COLOR.delivery,
    icon:      isProcurement ? "▣" : "🚚",
    navTo:     `/Deliveries`,
    priority:  2,
    raw:       d,
  }];
}

function eventsFromRfi(r) {
  if (!r || r.is_deleted) return [];
  const date = iso(r.date_required) || iso(r.due_date);
  if (!date) return [];
  return [{
    id:        `rfi-${r.id}`,
    entityId:  r.id,
    type:      "rfi",
    title:     `${r.rfi_number || "RFI"} — ${r.title || "Required"}`,
    subtitle:  r.status || "",
    start:     date,
    end:       date,
    status:    r.status,
    accent:    EVENT_COLOR.rfi,
    icon:      "⚑",
    navTo:     `/RFIs`,
    priority:  3,
    raw:       r,
  }];
}

function eventsFromSubmittal(s) {
  if (!s || s.is_deleted) return [];
  const out = [];
  // Required date — the contractor's deadline to provide the submittal
  if (s.required_date) {
    out.push({
      id:        `submittal-req-${s.id}`,
      entityId:  s.id,
      type:      "submittal",
      title:     `${s.submittal_number || "Submittal"} due`,
      subtitle:  s.title || "",
      start:     iso(s.required_date),
      end:       iso(s.required_date),
      status:    s.status,
      accent:    EVENT_COLOR.submittal,
      icon:      "▤",
      navTo:     `/Submittals`,
      priority:  4,
      raw:       s,
    });
  }
  // Returned date — when the GC's review finished. Useful retrospect.
  if (s.returned_date) {
    out.push({
      id:        `submittal-ret-${s.id}`,
      entityId:  s.id,
      type:      "submittal",
      title:     `${s.submittal_number || "Submittal"} returned`,
      subtitle:  s.title || "",
      start:     iso(s.returned_date),
      end:       iso(s.returned_date),
      status:    s.status,
      accent:    EVENT_COLOR.submittal,
      icon:      "▥",
      navTo:     `/Submittals`,
      priority:  4,
      raw:       s,
    });
  }
  return out;
}

function eventsFromChangeOrder(co) {
  if (!co || co.is_deleted) return [];
  const finalized = !!(co.approved_date);
  const status = (co.status || "").toLowerCase();
  // Use approved_date when available, else submitted_date, else
  // created_at — surface the CO at its most-meaningful date.
  let date = iso(co.approved_date) || iso(co.submitted_date) || iso(co.created_at);
  if (!date) return [];
  const isPending = !finalized && (status === "pending" || status === "submitted" || status === "");
  return [{
    id:        `co-${co.id}`,
    entityId:  co.id,
    type:      "co",
    title:     `CO ${co.co_number || ""} ${finalized ? "approved" : isPending ? "pending" : "filed"}`.trim(),
    subtitle:  co.title || "",
    start:     date,
    end:       date,
    status:    co.status,
    accent:    finalized ? EVENT_COLOR.co : EVENT_COLOR.co_pending,
    icon:      "$",
    navTo:     `/ChangeOrders`,
    priority:  5,
    raw:       co,
  }];
}

function eventsFromActionItem(a) {
  if (!a) return [];
  if (!a.due_date) return [];
  const status = (a.status || "").toLowerCase();
  // Closed/done items don't need to clutter the calendar — but show
  // "in progress" + "open" so the PM can see what's coming.
  if (status === "closed" || status === "complete" || status === "done") return [];
  return [{
    id:        `action-${a.id}`,
    entityId:  a.id,
    type:      "action",
    title:     a.title || "Action item",
    subtitle:  a.category || a.status || "",
    start:     iso(a.due_date),
    end:       iso(a.due_date),
    status:    a.status,
    accent:    EVENT_COLOR.action,
    icon:      "✔",
    navTo:     `/ActionItems`,
    priority:  6,
    raw:       a,
  }];
}

function eventsFromInspection(i) {
  if (!i || i.is_deleted) return [];
  if (!i.inspection_date) return [];
  return [{
    id:        `inspection-${i.id}`,
    entityId:  i.id,
    type:      "inspection",
    title:     `Inspection — ${i.description || "Scheduled"}`,
    subtitle:  i.inspector_name || i.status || "",
    start:     iso(i.inspection_date),
    end:       iso(i.inspection_date),
    status:    i.status,
    accent:    EVENT_COLOR.inspection,
    icon:      "🔍",
    navTo:     `/Inspections`,
    priority:  7,
    raw:       i,
  }];
}

function eventsFromDailyLog(l) {
  if (!l) return [];
  if (!l.date) return [];
  return [{
    id:        `dailylog-${l.id}`,
    entityId:  l.id,
    type:      "daily_log",
    title:     `Daily log filed`,
    subtitle:  l.crew_name || "",
    start:     iso(l.date),
    end:       iso(l.date),
    status:    l.status,
    accent:    EVENT_COLOR.daily_log,
    icon:      "📋",
    navTo:     `/DailyLogs`,
    priority:  9,
    raw:       l,
  }];
}

function eventsFromProject(p) {
  if (!p) return [];
  const out = [];
  if (p.start_date) {
    out.push({
      id:        `proj-start-${p.id}`,
      entityId:  p.id,
      type:      "project_anchor",
      title:     `Project start`,
      subtitle:  p.project_number ? `Project ${p.project_number}` : "",
      start:     iso(p.start_date),
      end:       iso(p.start_date),
      accent:    EVENT_COLOR.project_anchor,
      icon:      "▶",
      navTo:     `/ProjectDetail?projectId=${p.id}`,
      priority:  -1,
      raw:       p,
    });
  }
  const finish = p.target_completion_date || p.forecast_completion_date;
  if (finish) {
    out.push({
      id:        `proj-finish-${p.id}`,
      entityId:  p.id,
      type:      "project_anchor",
      title:     p.target_completion_date ? `Target completion` : `Forecast completion`,
      subtitle:  p.project_number ? `Project ${p.project_number}` : "",
      start:     iso(finish),
      end:       iso(finish),
      accent:    EVENT_COLOR.project_anchor,
      icon:      "🏁",
      navTo:     `/ProjectDetail?projectId=${p.id}`,
      priority:  -1,
      raw:       p,
    });
  }
  return out;
}

// ── Public: build event list from raw entity arrays ───────────────────

export function buildCalendarEvents({
  scheduleTasks = [],
  deliveries = [],
  rfis = [],
  submittals = [],
  changeOrders = [],
  actionItems = [],
  inspections = [],
  dailyLogs = [],
  project = null,
} = {}) {
  const events = [];
  scheduleTasks.forEach((t) => events.push(...eventsFromScheduleTask(t)));
  deliveries.forEach((d)   => events.push(...eventsFromDelivery(d)));
  rfis.forEach((r)         => events.push(...eventsFromRfi(r)));
  submittals.forEach((s)   => events.push(...eventsFromSubmittal(s)));
  changeOrders.forEach((c) => events.push(...eventsFromChangeOrder(c)));
  actionItems.forEach((a)  => events.push(...eventsFromActionItem(a)));
  inspections.forEach((i)  => events.push(...eventsFromInspection(i)));
  dailyLogs.forEach((l)    => events.push(...eventsFromDailyLog(l)));
  if (project) events.push(...eventsFromProject(project));
  // Stable sort: priority then start date then title — keeps day cells
  // visually consistent across re-renders.
  events.sort((a, b) =>
    (a.priority - b.priority)
    || (a.start || "").localeCompare(b.start || "")
    || (a.title || "").localeCompare(b.title || "")
  );
  return events;
}

// ── Filter chip metadata (used by the page header) ──────────────────

export const EVENT_TYPE_GROUPS = [
  { key: "task",        label: "Tasks",       color: EVENT_COLOR.task },
  { key: "milestone",   label: "Milestones",  color: EVENT_COLOR.milestone },
  { key: "delivery",    label: "Deliveries",  color: EVENT_COLOR.delivery },
  { key: "procurement", label: "Procurement", color: EVENT_COLOR.procurement },
  { key: "rfi",         label: "RFIs",        color: EVENT_COLOR.rfi },
  { key: "submittal",   label: "Submittals",  color: EVENT_COLOR.submittal },
  { key: "co",          label: "Change Orders", color: EVENT_COLOR.co },
  { key: "action",      label: "Action Items",  color: EVENT_COLOR.action },
  { key: "inspection",  label: "Inspections",   color: EVENT_COLOR.inspection },
  { key: "daily_log",   label: "Daily Logs",   color: EVENT_COLOR.daily_log },
];
