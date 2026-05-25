import { GANTT_GRADIENT, GANTT_PHASE_HEX, GANTT_STATUS_HEX } from "@/lib/ganttTheme";

export const PHASE_COLORS = {
  "Pre-Construction": { bar: GANTT_GRADIENT.default, solid: GANTT_PHASE_HEX["Pre-Construction"], bg: `${GANTT_PHASE_HEX["Pre-Construction"]}14` },
  Detailing:          { bar: GANTT_GRADIENT.Detailing, solid: GANTT_PHASE_HEX.Detailing, bg: `${GANTT_PHASE_HEX.Detailing}14` },
  Procurement:        { bar: GANTT_GRADIENT.Procurement, solid: GANTT_PHASE_HEX.Procurement, bg: `${GANTT_PHASE_HEX.Procurement}18` },
  Fabrication:        { bar: GANTT_GRADIENT.Fabrication, solid: GANTT_PHASE_HEX.Fabrication, bg: `${GANTT_PHASE_HEX.Fabrication}16` },
  Delivery:           { bar: GANTT_GRADIENT.Delivery, solid: GANTT_PHASE_HEX.Delivery, bg: `${GANTT_PHASE_HEX.Delivery}16` },
  Installation:       { bar: GANTT_GRADIENT.Installation, solid: GANTT_PHASE_HEX.Installation, bg: `${GANTT_PHASE_HEX.Installation}16` },
  Closeout:           { bar: GANTT_GRADIENT.Closeout, solid: GANTT_PHASE_HEX.Closeout, bg: `${GANTT_PHASE_HEX.Closeout}14` },
};

export const STATUS_COLORS = {
"Not Started": "var(--text-muted)",
"In Progress": GANTT_STATUS_HEX.inProgress,
"Complete":    GANTT_STATUS_HEX.complete,
"Delayed":     GANTT_STATUS_HEX.delayed,
};

export const ROW_HEIGHT = 40;
export const HEADER_HEIGHT = 52;
export const TASK_LIST_WIDTH = 360;

export const ZOOM_LEVELS = {
  day:   { pxPerDay: 40, label: "Day" },
  week:  { pxPerDay: 20, label: "Week" },
  month: { pxPerDay: 6,  label: "Month" },
};

// Day math inside the Gantt grid. Previously mixed setUTCHours (in
// getDaysBetween) with getFullYear/getMonth/getDate (in isToday), so in
// non-UTC timezones the "today" vertical line and the date-range start
// drifted by a day from what the task rows were rendering. All math now
// runs against LOCAL midnight to match the rest of the app (urgencyEngine,
// todayView, UpcomingWindows — see src/lib/dateMath.js).
export function toLocalMidnight(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [y, m, dd] = value.trim().split("-").map(Number);
    return new Date(y, m - 1, dd, 0, 0, 0, 0);
  }
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getDaysBetween(d1, d2) {
  const a = toLocalMidnight(d1);
  const b = toLocalMidnight(d2);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function addDays(date, days) {
  const d = toLocalMidnight(date) || new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function isWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; }
export function isToday(d) {
  const a = toLocalMidnight(d);
  const b = toLocalMidnight(new Date());
  return !!a && !!b && a.getTime() === b.getTime();
}
export function getMonthLabel(d) { return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }); }
