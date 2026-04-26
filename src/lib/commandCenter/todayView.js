/**
 * todayView.js — Today-first bucketing for the redesigned Command Center.
 *
 * Takes the existing urgency-scored feed + raw delivery/WP arrays and groups
 * them into actionable "buckets" for a calendar-style agenda view.
 *
 * Buckets:
 *   - blocking       : items with urgency === 'blocking' (needs action NOW)
 *   - overdue        : items with urgency === 'overdue' (past due)
 *   - dueToday       : items whose due date is today
 *   - arrivingToday  : deliveries scheduled to arrive today
 *   - arrivingWeek   : deliveries scheduled this week (not today)
 *   - activeWork     : work packages currently in-progress
 *   - waitingOthers  : items where ball is not in our court
 *   - weekByDay      : array of 7 days [{ date, label, count, items[] }]
 *
 * Also exposes a `snapshot` with the 5 headline numbers for the KPI tiles.
 */

// Share the local-midnight convention with urgencyEngine and
// UpcomingWindows so a given item never lands in two different "today"
// buckets depending on which file is doing the math. Previously each
// file re-implemented these with subtly different UTC-vs-local rules.
import {
  toLocalMidnight,
  startOfToday,
  isToday as _isToday,
  daysUntil,
} from "@/lib/dateMath";

const startOfDayMs = (d) => {
  const m = d ? toLocalMidnight(d) : startOfToday();
  return m ? m.getTime() : startOfToday().getTime();
};

const parseDate = (s) => toLocalMidnight(s);

const isToday = (s) => _isToday(s);

const daysFromToday = (s) => {
  const n = daysUntil(s);
  return Number.isFinite(n) ? n : null;
};

export function buildTodayView(feed = [], { deliveries = [], workPackages = [], projectMap = {} } = {}) {
  const blocking = [];
  const overdue = [];
  const dueToday = [];
  const waitingOthers = [];

  for (const item of feed) {
    // Blocking takes priority
    if (item.urgency === "blocking") {
      blocking.push(item);
      continue;
    }

    // Due today detection: items with a due date === today, or items that say "Due today"
    // (RFIs with date_required today → daysValue === 0 per urgencyEngine; displayStatus has "Due today")
    const dueTodayHit =
      (item.urgency === "due-soon" && /due today/i.test(item.displayStatus)) ||
      (item.daysValue === 0 && item.urgency !== "overdue");
    if (dueTodayHit) {
      dueToday.push(item);
      continue;
    }

    if (item.urgency === "overdue") {
      overdue.push(item);
      continue;
    }

    if (item.urgency === "awaiting") {
      waitingOthers.push(item);
    }
  }

  // Deliveries today (may duplicate feed items; build fresh from raw deliveries)
  const arrivingToday = deliveries
    .filter((d) => d.status !== "Delivered" && isToday(d.scheduled_date))
    .map((d) => ({
      id: d.id,
      title: d.delivery_title || d.description || "Delivery",
      subtitle: [d.pieces ? `${d.pieces} pcs` : null, d.weight_tons ? `${Number(d.weight_tons).toFixed(1)}T` : null, d.carrier || d.vendor || null].filter(Boolean).join(" · "),
      projectNumber: projectMap[d.project_id]?.project_number || null,
      projectName: projectMap[d.project_id]?.name || null,
      status: d.status || "Scheduled",
      raw: d,
      route: `/Deliveries?project=${d.project_id}`,
    }));

  // Active WPs: in-progress in Fabrication or Erection
  const activeWork = workPackages
    .filter((wp) => wp.status === "In Progress" && (wp.phase === "Fabrication" || wp.phase === "Erection" || wp.phase === "Delivery"))
    .slice(0, 8)
    .map((wp) => ({
      id: wp.id,
      title: `${wp.wp_number || "WP"} — ${wp.name || "(unnamed)"}`,
      subtitle: `${wp.phase || "—"} · ${Number(wp.percent_complete || 0)}%`,
      projectNumber: projectMap[wp.project_id]?.project_number || null,
      projectName: projectMap[wp.project_id]?.name || null,
      percent: Number(wp.percent_complete || 0),
      phase: wp.phase,
      raw: wp,
      route: `/WorkPackages?project=${wp.project_id}`,
    }));

  // Week ahead: 7 days starting today. Each day gets a count of deliveries scheduled
  // plus any feed items whose raw.date_required / raw.scheduled_date / raw.due_date matches.
  const weekByDay = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date();
    day.setDate(day.getDate() + i);
    day.setHours(0, 0, 0, 0);
    const dateKey = day.toISOString().slice(0, 10);
    weekByDay.push({
      date: dateKey,
      offset: i,
      label: day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      dayOfMonth: day.getDate(),
      month: day.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      isToday: i === 0,
      deliveries: 0,
      due: 0,
      items: [],
    });
  }
  const dayIndexByDate = Object.fromEntries(weekByDay.map((d, idx) => [d.date, idx]));

  function pushToDay(dateStr, kind, payload) {
    const idx = dayIndexByDate[dateStr];
    if (idx === undefined) return;
    const bucket = weekByDay[idx];
    if (kind === "delivery") bucket.deliveries += 1;
    if (kind === "due") bucket.due += 1;
    bucket.items.push(payload);
  }

  for (const d of deliveries) {
    if (d.status === "Delivered") continue;
    const key = d.scheduled_date ? String(d.scheduled_date).slice(0, 10) : null;
    if (key) {
      pushToDay(key, "delivery", {
        type: "DEL",
        title: d.delivery_title || d.description || "Delivery",
        projectNumber: projectMap[d.project_id]?.project_number || null,
      });
    }
  }

  for (const item of feed) {
    // Look for a due date in common places
    const raw = item.raw || {};
    const dueDateStr =
      raw.date_required ||
      raw.scheduled_date ||
      raw.due_date ||
      raw.period_to ||
      null;
    const key = dueDateStr ? String(dueDateStr).slice(0, 10) : null;
    if (!key) continue;
    const days = daysFromToday(key);
    if (days === null || days < 0 || days > 6) continue;
    if (item.itemType === "DEL") continue; // Already counted from deliveries array
    pushToDay(key, "due", {
      type: item.itemType,
      title: item.title,
      projectNumber: item.projectNumber,
    });
  }

  // Snapshot numbers for the redesigned KPI tile row
  const needsAction = blocking.length + overdue.length + dueToday.length;
  const snapshot = {
    needsAction,
    overdue: overdue.length,
    dueToday: dueToday.length + blocking.length,
    arrivingToday: arrivingToday.length,
    waitingOthers: waitingOthers.length,
  };

  return {
    blocking,
    overdue,
    dueToday,
    arrivingToday,
    activeWork,
    waitingOthers,
    weekByDay,
    snapshot,
  };
}
