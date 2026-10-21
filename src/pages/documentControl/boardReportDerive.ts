/**
 * boardReportDerive — the typed deterministic boundary for the Document
 * Control Board Report.
 *
 * Every status style, bar width, routing step, alert and date label the five
 * screens render is computed here, from normalized inputs, with no React and
 * no I/O. The screens only lay out what this returns. That split is what makes
 * the design's rules (a 14-day contract return, "late" meaning past it, an
 * acknowledgement overdue after 48 hours) assertable in a unit test rather
 * than only visible in a browser.
 *
 * DATE SEMANTICS — read before changing anything here.
 * Every date in this module is a LOCAL CALENDAR DAY. A submittal sent on the
 * 6th is "12 days out" on the 18th in the user's own timezone, not in UTC.
 * The suite runs with TZ=UTC (vite.config.js), which makes a UTC-vs-local bug
 * pass vacuously, so the helpers below never parse an ISO string with
 * `new Date(iso)` — that reads a bare date as midnight UTC and lands on the
 * previous day for anyone west of Greenwich. They split the string and build
 * with local parts. The matching test injects a non-UTC zone.
 */

import { DC_DARK, DC_LIGHT, DC_SIGNAL, type DcSkin } from "./boardReportTheme";

/* ─── dates ──────────────────────────────────────────────────────────────── */

/** A calendar day with no time and no zone. The only date type this module trades in. */
export interface CalendarDay {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Reads the calendar day out of an ISO date or timestamp WITHOUT going through
 * Date. `new Date("2026-10-06")` is midnight UTC, which is Oct 5 in Phoenix.
 * Returns null for anything unparseable — absence is not a date.
 */
export function parseCalendarDay(value: string | null | undefined): CalendarDay | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Today in the viewer's own zone, as a calendar day. */
export function todayCalendarDay(now: Date = new Date()): CalendarDay {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Serial day number, for differencing. Uses Date.UTC purely as a counter — both sides are zoneless. */
function serial(d: CalendarDay): number {
  return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);
}

/** Inclusive-of-neither elapsed calendar days: 6th → 18th is 12. */
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  return serial(to) - serial(from);
}

export function addDays(d: CalendarDay, n: number): CalendarDay {
  const shifted = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** "Oct 18" — the design's long form. */
export function formatDay(d: CalendarDay | null): string {
  return d ? `${MONTHS[d.month - 1]} ${d.day}` : "—";
}

/** "10/18" — the design's short form, used in dense table columns. */
export function formatShortDay(d: CalendarDay | null): string {
  if (!d) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.month)}/${pad(d.day)}`;
}

/** The contract return window, in calendar days. Both the bar's tick and "late" derive from it. */
export const CONTRACT_RETURN_DAYS = 14;

/** The days-out bar is scaled to 28 days, so the 14-day tick sits at the midpoint. */
export const DAYS_OUT_SCALE = 28;

/** A transmittal is chased after this long without an acknowledgement. */
export const ACK_OVERDUE_HOURS = 48;

/* ─── status vocabulary ──────────────────────────────────────────────────── */

/**
 * The Board Report's own display vocabulary. These are NOT ball-in-court
 * parties and NOT submittal statuses — they are the badge the register shows
 * for where a sheet or package currently sits. Mapping from real statuses
 * happens in the data hook, which is the only place that knows the DB's words.
 */
export const DC_STATUSES = ["REL", "REV", "R&R", "LATE", "DET", "HOLD", "NONE"] as const;
export type DcStatus = (typeof DC_STATUSES)[number];

export interface BadgeStyle {
  bg: string;
  fg: string;
  border: string;
}

const { green, blue, amber, red, accent, onAccent } = DC_SIGNAL;

const BADGE_LIGHT: Record<DcStatus, BadgeStyle> = {
  REL: { bg: "#1A1C1E", fg: "#FAFAF8", border: "1px solid #1A1C1E" },
  REV: { bg: "oklch(0.92 0.04 245)", fg: "oklch(0.38 0.1 245)", border: "1px solid oklch(0.85 0.05 245)" },
  "R&R": { bg: "oklch(0.93 0.07 80)", fg: "oklch(0.42 0.1 65)", border: "1px solid oklch(0.85 0.09 78)" },
  LATE: { bg: red, fg: "#fff", border: `1px solid ${red}` },
  DET: { bg: DC_LIGHT.badgeNeutralBg, fg: DC_LIGHT.badgeNeutralFg, border: `1px solid ${DC_LIGHT.badgeNeutralBorder}` },
  HOLD: { bg: accent, fg: onAccent, border: `1px solid ${accent}` },
  NONE: { bg: "transparent", fg: DC_LIGHT.dashedFg, border: `1px dashed ${DC_LIGHT.dashed}` },
};

const BADGE_DARK: Record<DcStatus, BadgeStyle> = {
  REL: { bg: green, fg: "#0C0F12", border: `1px solid ${green}` },
  REV: { bg: "oklch(0.62 0.11 245 / .18)", fg: "oklch(0.82 0.08 245)", border: "1px solid oklch(0.62 0.11 245 / .45)" },
  "R&R": { bg: "oklch(0.76 0.14 75 / .16)", fg: "oklch(0.85 0.12 80)", border: "1px solid oklch(0.76 0.14 75 / .45)" },
  LATE: { bg: red, fg: "#fff", border: `1px solid ${red}` },
  DET: { bg: DC_DARK.badgeNeutralBg, fg: DC_DARK.badgeNeutralFg, border: `1px solid ${DC_DARK.badgeNeutralBorder}` },
  HOLD: { bg: accent, fg: onAccent, border: `1px solid ${accent}` },
  NONE: { bg: "transparent", fg: DC_DARK.dashedFg, border: `1px dashed ${DC_DARK.dashed}` },
};

export function badgeStyle(status: DcStatus, dark = false): BadgeStyle {
  return (dark ? BADGE_DARK : BADGE_LIGHT)[status];
}

/** The label the badge prints. NONE is an em dash — the sheet has not started. */
export function badgeLabel(status: DcStatus): string {
  return status === "NONE" ? "—" : status;
}

/** Long-form status, for the matrix legend. */
export const STATUS_TEXT: Record<DcStatus, string> = {
  REL: "Released",
  REV: "In review",
  "R&R": "Revise & resubmit",
  LATE: "Return overdue",
  DET: "Detailing",
  HOLD: "Fab hold",
  NONE: "Not started",
};

/* ─── row and chip chrome ────────────────────────────────────────────────── */

export interface RowChrome {
  background: string;
  boxShadow: string;
}

/** The selected row gets a white card and the accent rail; nothing else moves. */
export function rowChrome(selected: boolean, dark = false): RowChrome {
  const skin = dark ? DC_DARK : DC_LIGHT;
  return {
    background: selected ? skin.rowSelectedBg : "transparent",
    boxShadow: selected ? `inset 3px 0 0 ${DC_SIGNAL.accent}` : "none",
  };
}

export interface ChipStyle {
  background: string;
  color: string;
  border: string;
}

export function chipStyle(active: boolean, dark = false): ChipStyle {
  const skin: DcSkin = dark ? DC_DARK : DC_LIGHT;
  return active
    ? { background: skin.chipActiveBg, color: skin.chipActiveFg, border: `1px solid ${skin.chipActiveBg}` }
    : { background: skin.chipIdleBg, color: skin.chipIdleFg, border: `1px solid ${skin.chipIdleBorder}` };
}

/* ─── submittals: days out ───────────────────────────────────────────────── */

export interface DaysOutBar {
  /** Percentage width, capped at 100 so a very old package cannot overflow the track. */
  width: string;
  fill: string;
  /** The count's own color — red once past the contract return. */
  countColor: string;
}

/**
 * The bar is the whole point of the submittals screen: how long a package has
 * been out, against the 14-day contract return marked at the midpoint.
 */
export function daysOutBar(days: number, status: DcStatus): DaysOutBar {
  const pct = Math.min(Math.max(days, 0) / DAYS_OUT_SCALE, 1) * 100;
  const fill =
    status === "LATE"
      ? red
      : status === "R&R"
        ? amber
        : days >= 11
          ? "oklch(0.55 0.1 245)"
          : "oklch(0.75 0.07 245)";
  return {
    width: `${pct.toFixed(1)}%`,
    fill,
    countColor: status === "LATE" ? DC_SIGNAL.redText : DC_LIGHT.textSecondary,
  };
}

/** Past the contract return is late — the one definition, used by the badge and the bar alike. */
export function isPastContractReturn(days: number): boolean {
  return days > CONTRACT_RETURN_DAYS;
}

/* ─── submittals: routing timeline ───────────────────────────────────────── */

export type RouteState = "done" | "late" | "todo";

export interface RouteStep {
  title: string;
  who: string;
  date: string;
  state: RouteState;
  dot: string;
  ring: string;
  titleColor: string;
  dateColor: string;
}

export interface RoutingInput {
  sentOn: CalendarDay | null;
  /** Who holds it now. Drawn from the canonical ball-in-court vocabulary. */
  ballInCourt: string | null;
  status: DcStatus;
  detailer: string;
  gc: string;
  /** Resolved contact for the current holder, when there is one. */
  holder: string;
  /** The receiving organization — never a hardcoded company. */
  returnTo: string;
}

/**
 * detailer → GC (+1 day) → current holder (+2 days, when it is not the GC) →
 * contract return (sent + 14) → return. The design's five steps.
 */
export function routingSteps(input: RoutingInput): RouteStep[] {
  const { sentOn, ballInCourt, status, detailer, gc, holder, returnTo } = input;
  const raw: Array<[string, string, CalendarDay | null, RouteState]> = [];

  if (status === "R&R") {
    raw.push(
      ["Submitted by detailer", detailer, sentOn, "done"],
      ["Returned revise & resubmit", holder || gc, null, "done"],
      ["Resubmit due", detailer, null, "todo"],
    );
  } else {
    raw.push(["Submitted by detailer", detailer, sentOn, "done"]);
    raw.push(["Received by GC", gc, sentOn ? addDays(sentOn, 1) : null, "done"]);
    if (ballInCourt && ballInCourt !== "GC") {
      raw.push([`Forwarded to ${ballInCourt}`, holder, sentOn ? addDays(sentOn, 2) : null, "done"]);
    }
    raw.push([
      "Contract return date",
      `${CONTRACT_RETURN_DAYS} calendar days`,
      sentOn ? addDays(sentOn, CONTRACT_RETURN_DAYS) : null,
      status === "LATE" ? "late" : "todo",
    ]);
    raw.push([`Return to ${returnTo}`, "Pending", null, "todo"]);
  }

  return raw.map(([title, who, date, state]) => ({
    title,
    who,
    date: formatDay(date),
    state,
    dot: state === "done" ? "#17191C" : state === "late" ? red : "#fff",
    ring: state === "done" ? "#17191C" : state === "late" ? red : "#A3A6A9",
    titleColor: state === "todo" ? DC_LIGHT.textMuted : DC_LIGHT.text,
    dateColor: state === "late" ? DC_SIGNAL.redText : DC_LIGHT.textMuted,
  }));
}

/* ─── alert boxes ────────────────────────────────────────────────────────── */

export type AlertTone = "late" | "warn" | "ok";

export interface AlertBox {
  tone: AlertTone;
  background: string;
  border: string;
  titleColor: string;
}

const ALERT: Record<AlertTone, Omit<AlertBox, "tone">> = {
  late: {
    background: "oklch(0.6 0.18 28 / .08)",
    border: "1px solid oklch(0.6 0.18 28 / .25)",
    titleColor: "oklch(0.45 0.17 28)",
  },
  warn: {
    background: "oklch(0.76 0.14 75 / .12)",
    border: "1px solid oklch(0.76 0.14 75 / .4)",
    titleColor: "oklch(0.45 0.1 65)",
  },
  ok: { background: DC_LIGHT.wellBg, border: `1px solid ${DC_LIGHT.wellBorder}`, titleColor: DC_LIGHT.text },
};

export function alertBox(tone: AlertTone): AlertBox {
  return { tone, ...ALERT[tone] };
}

/** Late beats due-soon beats quiet. Returns null when there is nothing to say. */
export function submittalAlertTone(days: number, status: DcStatus): AlertTone | null {
  if (status === "LATE") return "late";
  if (status === "R&R") return "warn";
  if (days >= CONTRACT_RETURN_DAYS - 3) return "warn";
  return null;
}

/* ─── RFI impact ─────────────────────────────────────────────────────────── */

export const RFI_IMPACTS = ["Fab hold", "Cost", "Schedule", "Info"] as const;
export type RfiImpact = (typeof RFI_IMPACTS)[number];

export interface PillStyle {
  color: string;
  background: string;
}

const IMPACT: Record<RfiImpact, PillStyle> = {
  "Fab hold": { color: "#C2410C", background: "rgba(255,90,31,.12)" },
  Cost: { color: "oklch(0.5 0.11 65)", background: "oklch(0.76 0.14 75 / .2)" },
  Schedule: { color: "oklch(0.42 0.1 245)", background: "oklch(0.62 0.11 245 / .14)" },
  Info: { color: DC_LIGHT.badgeNeutralFg, background: DC_LIGHT.badgeNeutralBg },
};

export function impactPill(impact: RfiImpact): PillStyle {
  return IMPACT[impact];
}

/** An RFI past its response date reads red; everything else reads normal. */
export function dueDateColor(due: CalendarDay | null, today: CalendarDay): string {
  if (!due) return DC_LIGHT.textSecondary;
  return daysBetween(due, today) > 0 ? DC_SIGNAL.redText : DC_LIGHT.textSecondary;
}

/* ─── transmittal acknowledgement ────────────────────────────────────────── */

export type AckState = "acknowledged" | "waiting" | "overdue";

/**
 * Acknowledged reads muted, waiting reads amber, and past 48 hours reads red.
 * `hoursWaiting` is null when the transmittal was acknowledged.
 */
export function ackState(acknowledged: boolean, hoursWaiting: number | null): AckState {
  if (acknowledged) return "acknowledged";
  return (hoursWaiting ?? 0) >= ACK_OVERDUE_HOURS ? "overdue" : "waiting";
}

export function ackColor(state: AckState): string {
  if (state === "acknowledged") return DC_LIGHT.textSecondary;
  return state === "overdue" ? DC_SIGNAL.redText : "oklch(0.5 0.11 65)";
}

/** The badge an acknowledgement state prints in the detail pane. */
export const ACK_BADGE: Record<AckState, { status: DcStatus; label: string }> = {
  acknowledged: { status: "REL", label: "ACK'D" },
  waiting: { status: "R&R", label: "WAITING" },
  overdue: { status: "LATE", label: "OVERDUE" },
};

/** "20 h" / "4 d" → "20 hours" / "4 days", for the alert title. */
export function humanizeWait(hours: number): string {
  if (hours < 48) return `${hours} hours`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/* ─── brief: release matrix ──────────────────────────────────────────────── */

export interface MatrixCell {
  status: DcStatus;
  label: string;
  style: BadgeStyle;
}

export function matrixCell(status: DcStatus, dark = false): MatrixCell {
  return { status, label: badgeLabel(status), style: badgeStyle(status, dark) };
}

/** Released percentage, floored at 0 and rounded — never NaN on a job with no sheets. */
export function releasedPct(released: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((released / total) * 100)}%`;
}

/* ─── brief: ball in court ───────────────────────────────────────────────── */

export interface BicSlice {
  party: string;
  count: number;
  share: string;
  color: string;
}

/**
 * The stacked bar across the open items. Colors cycle through the signal
 * palette; the PARTIES come from the caller, which reads the canonical
 * BALL_IN_COURT_PARTIES — this module never invents a party.
 */
export function bicSlices(counts: Array<{ party: string; count: number }>, dark = false): BicSlice[] {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const palette = dark
    ? ["#5B656E", "#A7B0B8", accent, blue, amber, green]
    : ["#B9B4AA", "#1A1C1E", accent, blue, amber, green];
  return counts.map((c, i) => ({
    party: c.party,
    count: c.count,
    share: total ? `${((c.count / total) * 100).toFixed(2)}%` : "0%",
    color: palette[i % palette.length],
  }));
}
