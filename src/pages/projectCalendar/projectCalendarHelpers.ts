/**
 * Pure helpers for Project Calendar page.
 * Behavior-preserving extract from ProjectCalendar.jsx.
 */
import {
  today as todayLocal,
  addDays,
  addMonths,
  fromIsoDate,
  toIsoDate,
  formatMonthYear,
  formatWeekRange,
  formatLongDate,
  startOfWeek,
} from "@/lib/calendarMath";
import {
  downloadIcs,
  scheduleTaskToEvent,
  deliveryToEvent,
  rfiToEvent,
  submittalToEvent,
  changeOrderToEvent,
  actionItemToEvent,
  inspectionToEvent,
  dailyLogToEvent,
} from "@/lib/icsExport";

export const FILTER_LS_KEY = "sbp-calendar-filters";

export const VIEW_OPTIONS = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
] as const;

export type CalendarView = "month" | "week" | "day";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* noop */
  }
  return null;
}

/** Load filter chip map from localStorage. Returns null when missing/invalid. */
export function loadFilters(storage: StorageLike | null = defaultStorage()): Record<string, boolean> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FILTER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, boolean>;
  } catch {
    return null;
  }
}

export function saveFilters(
  filters: Record<string, boolean>,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(FILTER_LS_KEY, JSON.stringify(filters));
  } catch {
    /* noop */
  }
}

/** All groups visible by default. */
export function defaultFilters(groups: Array<{ key: string }>): Record<string, boolean> {
  const def: Record<string, boolean> = {};
  for (const g of groups || []) {
    def[g.key] = true;
  }
  return def;
}

export function parseInitialView(viewParam: string | null | undefined): CalendarView {
  const v = viewParam || "";
  return v === "month" || v === "week" || v === "day" ? v : "month";
}

export function parseInitialFocus(dateParam: string | null | undefined, todayFn: () => Date = todayLocal): Date {
  const parsed = dateParam ? fromIsoDate(dateParam) : null;
  return parsed || todayFn();
}

/** Filter events by chip state; project_anchor always shows. */
export function filterCalendarEvents<T extends { type?: string }>(
  allEvents: T[],
  filters: Record<string, boolean>,
): T[] {
  return (allEvents || []).filter((ev) => {
    if (ev.type === "project_anchor") return true;
    return filters[ev.type as string] !== false;
  });
}

export function computeVisibleRange(
  view: CalendarView,
  focus: Date,
  weekStart: string,
): { start: Date; end: Date } {
  if (view === "day") return { start: focus, end: focus };
  if (view === "week") {
    const s = startOfWeek(focus, weekStart);
    return { start: s, end: addDays(s, 6) };
  }
  // month: extend to the full visible 6-week grid
  const gridStart = startOfWeek(new Date(focus.getFullYear(), focus.getMonth(), 1), weekStart);
  return { start: gridStart, end: addDays(gridStart, 41) };
}

export function computeHeaderLabel(
  view: CalendarView,
  focus: Date,
  weekStart: string,
): string {
  if (view === "month") return formatMonthYear(focus);
  if (view === "week") return formatWeekRange(focus, weekStart);
  return formatLongDate(focus);
}

/** Shift focus by one unit of the current view. direction: -1 prev, +1 next. */
export function shiftFocus(view: CalendarView, focus: Date, direction: -1 | 1): Date {
  if (view === "month") return addMonths(focus, direction);
  if (view === "week") return addDays(focus, direction * 7);
  return addDays(focus, direction);
}

export function countEventsByType(
  allEvents: Array<{ type?: string }>,
  typeKey: string,
): number {
  return (allEvents || []).filter((ev) => ev.type === typeKey).length;
}

type IcsEvent = { start?: string; end?: string; [k: string]: unknown };

function eventOverlapsRange(
  e: IcsEvent | null | undefined,
  range: { start: Date; end: Date },
  checkEnd: boolean,
): boolean {
  if (!e) return false;
  const inRange = (iso: string | undefined) => {
    if (!iso) return false;
    const d = fromIsoDate(iso);
    return !!(d && d >= range.start && d <= range.end);
  };
  if (checkEnd) return inRange(e.start) || inRange(e.end);
  return inRange(e.start);
}

/**
 * Build ICS events for entities whose dates fall in the visible range.
 * Mirrors previous page handleExportIcs logic (tasks check start|end; others start only).
 */
export function collectIcsEventsForRange(input: {
  scheduleTasks?: unknown[];
  deliveries?: unknown[];
  rfis?: unknown[];
  submittals?: unknown[];
  changeOrders?: unknown[];
  actionItems?: unknown[];
  inspections?: unknown[];
  dailyLogs?: unknown[];
  projectNumber?: string;
  visibleRange: { start: Date; end: Date };
}): IcsEvent[] {
  const projectNumber = input.projectNumber || "";
  const range = input.visibleRange;
  const icsEvents: IcsEvent[] = [];

  for (const t of input.scheduleTasks || []) {
    const e = scheduleTaskToEvent(t, projectNumber);
    if (eventOverlapsRange(e, range, true)) icsEvents.push(e);
  }
  for (const d of input.deliveries || []) {
    const e = deliveryToEvent(d, projectNumber);
    if (eventOverlapsRange(e, range, false)) icsEvents.push(e);
  }
  for (const r of input.rfis || []) {
    const e = rfiToEvent(r, projectNumber);
    if (eventOverlapsRange(e, range, false)) icsEvents.push(e);
  }
  for (const s of input.submittals || []) {
    const e = submittalToEvent(s, projectNumber);
    if (eventOverlapsRange(e, range, false)) icsEvents.push(e);
  }
  for (const co of input.changeOrders || []) {
    const e = changeOrderToEvent(co, projectNumber);
    if (eventOverlapsRange(e, range, false)) icsEvents.push(e);
  }
  for (const a of input.actionItems || []) {
    const e = actionItemToEvent(a, projectNumber);
    if (eventOverlapsRange(e, range, false)) icsEvents.push(e);
  }
  for (const i of input.inspections || []) {
    const e = inspectionToEvent(i, projectNumber);
    if (eventOverlapsRange(e, range, false)) icsEvents.push(e);
  }
  for (const l of input.dailyLogs || []) {
    const e = dailyLogToEvent(l, projectNumber);
    if (eventOverlapsRange(e, range, false)) icsEvents.push(e);
  }
  return icsEvents;
}

export function buildIcsFilename(
  projectNumber: string | null | undefined,
  range: { start: Date; end: Date },
): string {
  const safeNum = projectNumber ? `-${projectNumber}` : "";
  return `project${safeNum}-calendar-${toIsoDate(range.start)}-to-${toIsoDate(range.end)}.ics`;
}

export function exportCalendarIcs(opts: {
  scheduleTasks?: unknown[];
  deliveries?: unknown[];
  rfis?: unknown[];
  submittals?: unknown[];
  changeOrders?: unknown[];
  actionItems?: unknown[];
  inspections?: unknown[];
  dailyLogs?: unknown[];
  projectNumber?: string;
  projectName?: string;
  visibleRange: { start: Date; end: Date };
}): void {
  const icsEvents = collectIcsEventsForRange(opts);
  downloadIcs({
    filename: buildIcsFilename(opts.projectNumber, opts.visibleRange),
    events: icsEvents,
    calendarName: `SteelBuild Pro — ${opts.projectName || "Project"} Calendar`,
  });
}

export { todayLocal, toIsoDate, fromIsoDate };
