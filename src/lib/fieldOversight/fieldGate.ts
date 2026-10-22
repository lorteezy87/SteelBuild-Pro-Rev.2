/**
 * Field gate — the erector's 48-hour gate and ten-working-day horizon.
 *
 * Deterministic and separate from Production Control scoring (pccEngine): this
 * module answers "can the crew and crane execute what is scheduled?", not how a
 * fabrication item ranks. It raises four kinds of finding:
 *
 *   RD  Site not ready   — a sequence mobilizing within five working days with
 *                          readiness items still open
 *   DN  Delay notice     — a logged delay with no written notice, against the
 *                          notice window
 *   DR  Missing daily    — a field day with no daily report
 *   WX  Weather exposure — forecast risk on a day with erection or a delivery
 */
import { addWorkingDays, DEFAULT_CALENDAR } from "@/lib/schedule/workingCalendar";
import type { WorkingCalendar } from "@/lib/schedule/workingCalendar";
import { effectiveStart, workingDaysToStart } from "./readiness";
import type { ReadinessRecord } from "./readiness";
import { DELAY_CAUSES, formatMoney, needsNotice, noticeState, DEFAULT_NOTICE_WINDOW_DAYS } from "./delays";
import type { DelayRecord } from "./delays";
import { fieldWorkOn, missingDailyReports } from "./dailyReports";
import type {
  DailyLogLike, DeliveryLike, IsoDate, ProjectLike, ScheduleTaskLike, WeatherRiskLike,
} from "./types";
import { textOrNull } from "./types";

export type FieldSignalCode = "RD" | "DN" | "DR" | "WX";
export type FieldSignalSeverity = "critical" | "warning";

export interface FieldSignal {
  id: string;
  code: FieldSignalCode;
  severity: FieldSignalSeverity;
  title: string;
  detail: string;
  /** The day the finding bites, for ordering. */
  date: IsoDate | null;
  /** Where to act on it. */
  target: { page: "SiteReadiness" | "DelayLog" | "DailyLogs" | "ScheduleHub"; id?: string; date?: IsoDate };
  action: string;
}

const SEVERITY_RANK: Record<FieldSignalSeverity, number> = { critical: 0, warning: 1 };

function shortDay(iso: IsoDate): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Weather severity from weatherRisk.js: 2 = planning concern, 3 = likely stop. */
export const WEATHER_WARN = 2;
export const WEATHER_STOP = 3;

export interface FieldGateInput {
  readiness: readonly ReadinessRecord[];
  delays: readonly DelayRecord[];
  tasks: readonly ScheduleTaskLike[];
  deliveries: readonly DeliveryLike[];
  logs: readonly DailyLogLike[];
  /** Null when the forecast has not loaded or failed — never read as "clear". */
  weather: readonly WeatherRiskLike[] | null;
  today: IsoDate;
  noticeWindowDays?: number;
  calendar?: WorkingCalendar;
}

export function deriveFieldSignals(input: FieldGateInput): FieldSignal[] {
  const {
    readiness, delays, tasks, deliveries, logs, weather, today,
    noticeWindowDays = DEFAULT_NOTICE_WINDOW_DAYS, calendar = DEFAULT_CALENDAR,
  } = input;
  const out: FieldSignal[] = [];

  for (const r of readiness) {
    if (!r.open.length) continue;
    const wd = workingDaysToStart(r, today, calendar);
    if (wd === null || wd > 5) continue;
    const items = `${r.open.length} readiness item${r.open.length === 1 ? "" : "s"} open`;
    const start = effectiveStart(r, calendar);
    const title = wd < 0
      ? `${r.sequence} started ${start ? shortDay(start) : ""} with ${items}`.replace("  ", " ")
      : `${r.sequence} mobilizes ${wd === 0 ? "today" : `in ${wd} working day${wd === 1 ? "" : "s"}`} with ${items}`;
    out.push({
      id: `rd:${r.id}`,
      code: "RD",
      severity: wd <= 1 ? "critical" : "warning",
      title,
      detail: `Still open: ${r.open.slice(0, 3).map((i) => i.label).join("; ")}${r.open.length > 3 ? `; +${r.open.length - 3} more` : ""}. Get written confirmation or re-sequence before the crew and crane mobilize.`,
      date: start,
      target: { page: "SiteReadiness", id: r.id },
      action: "Open checklist",
    });
  }

  for (const d of delays) {
    if (!needsNotice(d)) continue;
    const n = noticeState(d.inputs, today, noticeWindowDays, calendar);
    if (n.kind !== "due" && n.kind !== "overdue") continue;
    const cause = d.inputs.cause ? DELAY_CAUSES[d.inputs.cause] : "Delay";
    out.push({
      id: `dn:${d.id}`,
      code: "DN",
      severity: n.kind === "overdue" || n.workingDaysLeft === 0 ? "critical" : "warning",
      title: n.kind === "overdue"
        ? `${d.number ?? "Delay"} — notice window passed ${n.workingDaysLate} working day${n.workingDaysLate === 1 ? "" : "s"} ago`
        : `${d.number ?? "Delay"} — written notice due ${n.workingDaysLeft === 0 ? "today" : `within ${n.workingDaysLeft} working day${n.workingDaysLeft === 1 ? "" : "s"}`}`,
      detail: `${cause}${d.inputs.impactDate ? ` on ${shortDay(d.inputs.impactDate)}` : ""}${d.cost.total !== null ? ` — ${formatMoney(d.cost.total)} logged` : ""}. No notice recorded. Unnoticed delays are the first ones a GC refuses to pay.`,
      date: d.inputs.impactDate,
      target: { page: "DelayLog", id: d.id },
      action: "Write the notice",
    });
  }

  for (const m of missingDailyReports({ tasks, deliveries, logs, today, calendar })) {
    out.push({
      id: `dr:${m.date}`,
      code: "DR",
      severity: "warning",
      title: `No daily report for ${shortDay(m.date)}`,
      detail: `${m.reasons.join("; ")} was on the schedule. Without a daily there is no record of manpower, progress or standby.`,
      date: m.date,
      target: { page: "DailyLogs", date: m.date },
      action: "File the daily",
    });
  }

  if (weather) {
    for (const risk of weather) {
      if (risk.severity < WEATHER_WARN || risk.date < today) continue;
      const last = addWorkingDays(today, 10, calendar);
      if (last && risk.date > last) continue;
      const work = fieldWorkOn(risk.date, tasks, deliveries);
      if (!work.tasks.length && !work.deliveries.length) continue;
      const exposed = [
        ...work.tasks.map((t) => textOrNull(t.task_name) ?? "erection task"),
        ...work.deliveries.map((x) => textOrNull(x.delivery_number) ?? "delivery"),
      ];
      out.push({
        id: `wx:${risk.date}`,
        code: "WX",
        severity: risk.severity >= WEATHER_STOP ? "critical" : "warning",
        title: `${shortDay(risk.date)} — ${textOrNull(risk.summary) ?? "weather risk"} against scheduled field work`,
        detail: `Exposed: ${exposed.slice(0, 3).join(", ")}${exposed.length > 3 ? ` +${exposed.length - 3} more` : ""}. Check the pick plan, wind limits and delivery timing.`,
        date: risk.date,
        target: { page: "ScheduleHub", date: risk.date },
        action: "Review the schedule",
      });
    }
  }

  return out.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || (a.date ?? "9999").localeCompare(b.date ?? "9999")
    || a.id.localeCompare(b.id));
}

export type CoreTone = "critical" | "warning" | "clear" | "empty";

export interface CoreDay {
  date: IsoDate;
  /** True for the first two working days: the 48-hour gate. */
  inGate: boolean;
  tasks: ScheduleTaskLike[];
  deliveries: DeliveryLike[];
  readinessOpen: number;
  weatherSeverity: number | null;
  tone: CoreTone;
}

const BLOCKED_TASK = new Set(["On Hold", "Delayed"]);
const BLOCKED_DELIVERY = new Set(["Delayed", "Rejected"]);

/** The next ten working days as the Schedule Core ring reads them. */
export function deriveScheduleCore(input: Omit<FieldGateInput, "delays" | "logs">): CoreDay[] {
  const { readiness, tasks, deliveries, weather, today, calendar = DEFAULT_CALENDAR } = input;
  const days: CoreDay[] = [];
  for (let i = 0; i < 10; i++) {
    const date = addWorkingDays(today, i, calendar);
    if (!date) break;
    const work = fieldWorkOn(date, tasks, deliveries);
    const readinessOpen = readiness
      .filter((r) => effectiveStart(r, calendar) === date)
      .reduce((n, r) => n + r.open.length, 0);
    const wx = weather ? weather.filter((w) => w.date === date).reduce<number | null>((m, w) => Math.max(m ?? 0, w.severity), null) : null;
    const blocked = work.tasks.some((t) => t.status && BLOCKED_TASK.has(t.status))
      || work.deliveries.some((d) => d.status && BLOCKED_DELIVERY.has(d.status));
    const hasWork = work.tasks.length + work.deliveries.length > 0;
    const inGate = i < 2;
    let tone: CoreTone = hasWork ? "clear" : "empty";
    if (hasWork && ((wx ?? 0) >= WEATHER_WARN || readinessOpen > 0)) tone = "warning";
    if (blocked || (inGate && readinessOpen > 0) || (hasWork && (wx ?? 0) >= WEATHER_STOP)) tone = "critical";
    days.push({ date, inGate, tasks: work.tasks, deliveries: work.deliveries, readinessOpen, weatherSeverity: wx, tone });
  }
  return days;
}

/**
 * A paste-ready field brief: the signals, then the gate days. Deterministic —
 * nothing here is generated by a model, so it can be sent as written.
 */
export function buildFieldBrief(args: {
  project: ProjectLike | null;
  signals: readonly FieldSignal[];
  core: readonly CoreDay[];
  today: IsoDate;
  weatherKnown: boolean;
}): string {
  const { project, signals, core, today, weatherKnown } = args;
  const job = [project?.project_number, project?.name].filter(Boolean).join(" ");
  const crit = signals.filter((s) => s.severity === "critical");
  const warn = signals.filter((s) => s.severity === "warning");
  const gate = core.filter((d) => d.inGate);
  const lines = [
    `FIELD BRIEF${job ? ` — ${job}` : ""} — ${shortDay(today)}`,
    "",
    crit.length || warn.length
      ? `${crit.length} critical, ${warn.length} warning.`
      : "No field findings: readiness, delay notices and daily reports are all current.",
    ...(crit.length ? ["", "CRITICAL", ...crit.map((s) => `- [${s.code}] ${s.title}`)] : []),
    ...(warn.length ? ["", "WATCH", ...warn.map((s) => `- [${s.code}] ${s.title}`)] : []),
    "",
    "48-HOUR GATE",
    ...gate.map((d) => {
      const items = [
        ...d.tasks.map((t) => textOrNull(t.task_name) ?? "erection task"),
        ...d.deliveries.map((x) => `delivery ${textOrNull(x.delivery_number) ?? ""}`.trim()),
      ];
      return `- ${shortDay(d.date)}: ${items.length ? items.join("; ") : "no field work scheduled"}${d.readinessOpen ? ` — ${d.readinessOpen} readiness item(s) open` : ""}`;
    }),
    ...(weatherKnown ? [] : ["", "Weather: forecast not available for this project; check it before committing the crane."]),
  ];
  return lines.join("\n") + "\n";
}
