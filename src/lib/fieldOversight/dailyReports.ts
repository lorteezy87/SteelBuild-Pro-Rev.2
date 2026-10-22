/**
 * Daily report coverage — a field day without a daily is a day with no record
 * of manpower, progress or standby, which is the backup every delay claim and
 * change order needs.
 *
 * A "field day" is a working day on which the schedule shows erection work in
 * progress or a delivery due on site. Days with nothing scheduled are never
 * reported missing: no schedule is not evidence that the crew was on site.
 */
import { addWorkingDays, isWorkingDay, DEFAULT_CALENDAR } from "@/lib/schedule/workingCalendar";
import type { WorkingCalendar } from "@/lib/schedule/workingCalendar";
import { canonicalFieldPhase } from "@/lib/field/fieldPhase";
import { dateOnlyOrNull, isLive, numberOrNull, textOrNull } from "./types";
import type { DailyLogLike, DeliveryLike, IsoDate, ProjectLike, ScheduleTaskLike } from "./types";

/** Delivery statuses that mean nothing is coming to site that day. */
const INACTIVE_DELIVERY = new Set(["Cancelled", "Rejected", "Identified", "Quoted"]);

export function isErectionTask(task: ScheduleTaskLike): boolean {
  if (!isLive(task) || task.is_summary) return false;
  return canonicalFieldPhase(task.phase ?? null) === "Erection";
}

/** Erection task in progress on `day` (inclusive), not complete. */
export function erectionTaskOnDay(task: ScheduleTaskLike, day: IsoDate): boolean {
  if (!isErectionTask(task)) return false;
  const start = dateOnlyOrNull(task.start_date);
  const end = dateOnlyOrNull(task.end_date) ?? start;
  if (!start || !end) return false;
  return start <= day && day <= end;
}

export function deliveryOnDay(delivery: DeliveryLike, day: IsoDate): boolean {
  if (!isLive(delivery)) return false;
  if (delivery.status && INACTIVE_DELIVERY.has(delivery.status)) return false;
  return dateOnlyOrNull(delivery.scheduled_date) === day;
}

export interface FieldDay {
  date: IsoDate;
  tasks: ScheduleTaskLike[];
  deliveries: DeliveryLike[];
}

export function fieldWorkOn(
  day: IsoDate,
  tasks: readonly ScheduleTaskLike[],
  deliveries: readonly DeliveryLike[],
): FieldDay {
  return {
    date: day,
    tasks: tasks.filter((t) => erectionTaskOnDay(t, day)),
    deliveries: deliveries.filter((d) => deliveryOnDay(d, day)),
  };
}

export interface MissingDaily {
  date: IsoDate;
  /** What put the day on the field calendar. */
  reasons: string[];
}

/**
 * Field days in the last `lookback` working days (today excluded — the crew may
 * not have filed yet) with no live daily log for that date.
 */
export function missingDailyReports(args: {
  tasks: readonly ScheduleTaskLike[];
  deliveries: readonly DeliveryLike[];
  logs: readonly DailyLogLike[];
  today: IsoDate;
  lookback?: number;
  calendar?: WorkingCalendar;
}): MissingDaily[] {
  const { tasks, deliveries, logs, today, lookback = 5, calendar = DEFAULT_CALENDAR } = args;
  const filed = new Set(logs.filter(isLive).map((l) => dateOnlyOrNull(l.date)).filter(Boolean));
  const out: MissingDaily[] = [];
  for (let i = 1; i <= lookback; i++) {
    const day = addWorkingDays(today, -i, calendar);
    if (!day || !isWorkingDay(day, calendar) || filed.has(day)) continue;
    const work = fieldWorkOn(day, tasks, deliveries);
    if (!work.tasks.length && !work.deliveries.length) continue;
    const reasons = [
      ...work.tasks.slice(0, 2).map((t) => `Erection: ${textOrNull(t.task_name) ?? "scheduled task"}`),
      ...work.deliveries.slice(0, 2).map((d) => `Delivery ${textOrNull(d.delivery_number) ?? ""}`.trim()),
    ];
    out.push({ date: day, reasons });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function fmtLongDate(iso: IsoDate | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Paste-ready text of one daily log. Unrecorded fields are omitted, not zeroed. */
export function formatDailyReport(log: DailyLogLike, project: ProjectLike | null, orgName: string | null): string {
  const job = [project?.project_number, project?.name].filter(Boolean).join(" ");
  const crew = numberOrNull(log.headcount);
  // hours_worked is the form's "Total Man-Hours" (the manning grid's sum of
  // count × hours) — already a crew total, never hours per person.
  const manHours = numberOrNull(log.hours_worked);
  const line = (label: string, value: unknown) => {
    const v = typeof value === "number" ? String(value) : textOrNull(value);
    return v ? `${label}: ${v}` : null;
  };
  const block = (label: string, value: unknown) => {
    const v = textOrNull(value);
    return v ? `\n${label}:\n${v}` : null;
  };
  const weather = [log.weather_description, log.temperature, log.wind_speed ? `wind ${log.wind_speed}` : null]
    .map(textOrNull).filter(Boolean).join(" · ");
  return [
    `DAILY FIELD REPORT${job ? ` — ${job}` : ""}`,
    [fmtLongDate(dateOnlyOrNull(log.date)), orgName].filter(Boolean).join(" · "),
    "",
    line("Superintendent / foreman", log.superintendent),
    line("Crew", log.crew_name),
    crew !== null || manHours !== null
      ? `Manpower: ${[crew !== null ? `${crew} on site` : null, manHours !== null ? `${manHours} man-hours` : null].filter(Boolean).join(" · ")}`
      : null,
    line("Weather", weather),
    line("Equipment on site", log.equipment_used),
    line("Materials received", log.materials_received),
    block("Work performed", log.activities),
    block("Delays / problems", log.delays),
    numberOrNull(log.delay_hours) !== null ? `Delay hours: ${log.delay_hours}` : null,
    line("Safety", log.safety_notes),
    log.toolbox_talk_completed === true ? "Toolbox talk: completed" : null,
    numberOrNull(log.safety_incidents) ? `Safety incidents: ${log.safety_incidents}` : null,
  ].filter((v): v is string => v !== null).join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
