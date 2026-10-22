/**
 * Delay & standby log — every hour a crew or crane stands by for someone
 * else's reason, recorded the day it happens with its cost and its notice.
 *
 * Stored as a `change_requests` row (reason DELAY_CR_REASON, inputs in
 * metadata.delay_log). That puts each delay on the path it has to travel
 * anyway — notice → change request → change order — with an official CR
 * number from the atomic sequence RPC, never one minted here.
 */
import { workingDaysBetween, DEFAULT_CALENDAR } from "@/lib/schedule/workingCalendar";
import type { WorkingCalendar } from "@/lib/schedule/workingCalendar";
import type { Json } from "@/types/supabase";
import {
  dateOnlyOrNull, isLive, metadataSection, numberOrNull, textOrNull, withMetadataSection,
} from "./types";
import type { ChangeRequestLike, IsoDate, ProjectLike } from "./types";

export const DELAY_CR_REASON = "Delay / standby";
export const DELAY_METADATA_KEY = "delay_log";
/** Default written-notice window in working days. Every subcontract differs. */
export const DEFAULT_NOTICE_WINDOW_DAYS = 2;

export const DELAY_CAUSES = Object.freeze({
  steel: "Steel late or short-shipped",
  site: "Site not ready",
  gc: "GC or other trade interference",
  design: "RFI or design not answered",
  anchors: "Anchor bolts or embeds out of tolerance",
  access: "No access or laydown",
  inspection: "Inspection hold",
  weather: "Weather",
  equipment: "Others' equipment",
  other: "Other",
} as const);
export type DelayCause = keyof typeof DELAY_CAUSES;

export function isDelayCause(value: unknown): value is DelayCause {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DELAY_CAUSES, value);
}

export interface DelayInputs {
  impactDate: IsoDate | null;
  cause: DelayCause | null;
  responsibleParty: string | null;
  crew: number | null;
  hoursEach: number | null;
  laborRate: number | null;
  craneHours: number | null;
  craneRate: number | null;
  otherCost: number | null;
  scheduleTaskId: string | null;
  dailyLogId: string | null;
  noticeSentOn: IsoDate | null;
  whatHappened: string | null;
}

export interface DelayCost {
  manHours: number | null;
  labor: number | null;
  crane: number | null;
  other: number | null;
  /** Null when no cost input is recorded at all — unknown, not $0. */
  total: number | null;
}

export interface DelayRecord {
  id: string;
  number: string | null;
  inputs: DelayInputs;
  cost: DelayCost;
  status: string | null;
  raw: ChangeRequestLike;
}

export function isDelayRequest(row: ChangeRequestLike): boolean {
  return isLive(row) && (row.reason === DELAY_CR_REASON || metadataSection(row.metadata, DELAY_METADATA_KEY) !== null);
}

export function readDelayInputs(row: ChangeRequestLike): DelayInputs {
  const s = metadataSection(row.metadata, DELAY_METADATA_KEY) ?? {};
  return {
    impactDate: dateOnlyOrNull(s.impact_date) ?? dateOnlyOrNull(row.request_date),
    cause: isDelayCause(s.cause) ? s.cause : null,
    responsibleParty: textOrNull(s.responsible_party),
    crew: numberOrNull(s.crew),
    hoursEach: numberOrNull(s.hours_each),
    laborRate: numberOrNull(s.labor_rate),
    craneHours: numberOrNull(s.crane_hours),
    craneRate: numberOrNull(s.crane_rate),
    otherCost: numberOrNull(s.other_cost),
    scheduleTaskId: textOrNull(s.schedule_task_id),
    dailyLogId: textOrNull(s.daily_log_id),
    noticeSentOn: dateOnlyOrNull(s.notice_sent_on),
    whatHappened: textOrNull(row.description),
  };
}

/** A product of two recorded numbers, else null. */
function product(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a * b;
}

export function delayCost(inputs: DelayInputs): DelayCost {
  const manHours = product(inputs.crew, inputs.hoursEach);
  const labor = product(manHours, inputs.laborRate);
  const crane = product(inputs.craneHours, inputs.craneRate);
  const other = inputs.otherCost;
  const parts = [labor, crane, other].filter((v): v is number => v !== null);
  return { manHours, labor, crane, other, total: parts.length ? parts.reduce((a, b) => a + b, 0) : null };
}

export function toDelayRecord(row: ChangeRequestLike): DelayRecord {
  const inputs = readDelayInputs(row);
  return { id: row.id, number: textOrNull(row.cr_number), inputs, cost: delayCost(inputs), status: textOrNull(row.status), raw: row };
}

export function deriveDelays(rows: readonly ChangeRequestLike[]): DelayRecord[] {
  return rows.filter(isDelayRequest).map(toDelayRecord).sort((a, b) => {
    const da = a.inputs.impactDate ?? "";
    const db = b.inputs.impactDate ?? "";
    if (da !== db) return da < db ? 1 : -1;
    return (b.number ?? "").localeCompare(a.number ?? "");
  });
}

export type NoticeState =
  | { kind: "sent"; on: IsoDate }
  | { kind: "due"; workingDaysLeft: number }
  | { kind: "overdue"; workingDaysLate: number }
  | { kind: "unknown" };

/**
 * Where a delay stands against the notice window. Day of impact is day 0; with
 * a 2-day window, notice is due by the end of the second working day after it.
 */
export function noticeState(
  inputs: Pick<DelayInputs, "impactDate" | "noticeSentOn">,
  today: IsoDate,
  windowDays: number = DEFAULT_NOTICE_WINDOW_DAYS,
  calendar: WorkingCalendar = DEFAULT_CALENDAR,
): NoticeState {
  if (inputs.noticeSentOn) return { kind: "sent", on: inputs.noticeSentOn };
  if (!inputs.impactDate) return { kind: "unknown" };
  if (today <= inputs.impactDate) return { kind: "due", workingDaysLeft: windowDays };
  const inclusive = workingDaysBetween(inputs.impactDate, today, calendar);
  if (inclusive === null) return { kind: "unknown" };
  const impactCounts = (workingDaysBetween(inputs.impactDate, inputs.impactDate, calendar) ?? 0) > 0;
  const elapsed = inclusive - (impactCounts ? 1 : 0);
  if (elapsed > windowDays) return { kind: "overdue", workingDaysLate: elapsed - windowDays };
  return { kind: "due", workingDaysLeft: windowDays - elapsed };
}

/** Rows that are closed out commercially no longer carry open exposure. */
export function isOpenExposure(record: DelayRecord): boolean {
  return record.status !== "Approved" && record.status !== "Rejected";
}

export interface DelayDraft {
  impactDate: IsoDate;
  cause: DelayCause;
  responsibleParty: string;
  crew: string;
  hoursEach: string;
  laborRate: string;
  craneHours: string;
  craneRate: string;
  otherCost: string;
  scheduleTaskId: string;
  dailyLogId: string;
  noticeSentOn: string;
  whatHappened: string;
}

export function emptyDelayDraft(today: IsoDate): DelayDraft {
  return {
    impactDate: today, cause: "site", responsibleParty: "", crew: "", hoursEach: "", laborRate: "",
    craneHours: "", craneRate: "", otherCost: "", scheduleTaskId: "", dailyLogId: "", noticeSentOn: "", whatHappened: "",
  };
}

export function draftFromRecord(record: DelayRecord, today: IsoDate): DelayDraft {
  const i = record.inputs;
  const s = (n: number | null) => (n === null ? "" : String(n));
  return {
    impactDate: i.impactDate ?? today,
    cause: i.cause ?? "other",
    responsibleParty: i.responsibleParty ?? "",
    crew: s(i.crew), hoursEach: s(i.hoursEach), laborRate: s(i.laborRate),
    craneHours: s(i.craneHours), craneRate: s(i.craneRate), otherCost: s(i.otherCost),
    scheduleTaskId: i.scheduleTaskId ?? "", dailyLogId: i.dailyLogId ?? "",
    noticeSentOn: i.noticeSentOn ?? "", whatHappened: i.whatHappened ?? "",
  };
}

export function draftInputs(draft: DelayDraft): DelayInputs {
  return {
    impactDate: dateOnlyOrNull(draft.impactDate),
    cause: draft.cause,
    responsibleParty: textOrNull(draft.responsibleParty),
    crew: numberOrNull(draft.crew),
    hoursEach: numberOrNull(draft.hoursEach),
    laborRate: numberOrNull(draft.laborRate),
    craneHours: numberOrNull(draft.craneHours),
    craneRate: numberOrNull(draft.craneRate),
    otherCost: numberOrNull(draft.otherCost),
    scheduleTaskId: textOrNull(draft.scheduleTaskId),
    dailyLogId: textOrNull(draft.dailyLogId),
    noticeSentOn: dateOnlyOrNull(draft.noticeSentOn),
    whatHappened: textOrNull(draft.whatHappened),
  };
}

/** Validation messages for a draft; empty when it can be saved. */
export function validateDelayDraft(draft: DelayDraft): string[] {
  const errors: string[] = [];
  if (!dateOnlyOrNull(draft.impactDate)) errors.push("Enter the date of impact.");
  if (!isDelayCause(draft.cause)) errors.push("Choose a cause.");
  for (const [label, value] of [
    ["Crew", draft.crew], ["Hours each", draft.hoursEach], ["Labor rate", draft.laborRate],
    ["Crane hours", draft.craneHours], ["Crane rate", draft.craneRate], ["Other cost", draft.otherCost],
  ] as const) {
    if (value.trim() && (numberOrNull(value) === null || (numberOrNull(value) ?? 0) < 0)) errors.push(`${label} must be a number of zero or more.`);
  }
  if (draft.noticeSentOn && draft.impactDate && draft.noticeSentOn < draft.impactDate) errors.push("Notice cannot be sent before the date of impact.");
  return errors;
}

function metadataFromInputs(inputs: DelayInputs): Record<string, unknown> {
  return {
    version: 1,
    impact_date: inputs.impactDate,
    cause: inputs.cause,
    responsible_party: inputs.responsibleParty,
    crew: inputs.crew,
    hours_each: inputs.hoursEach,
    labor_rate: inputs.laborRate,
    crane_hours: inputs.craneHours,
    crane_rate: inputs.craneRate,
    other_cost: inputs.otherCost,
    schedule_task_id: inputs.scheduleTaskId,
    daily_log_id: inputs.dailyLogId,
    notice_sent_on: inputs.noticeSentOn,
  };
}

function delayTitle(inputs: DelayInputs): string {
  const cause = inputs.cause ? DELAY_CAUSES[inputs.cause] : "Delay";
  return `Delay — ${cause}${inputs.impactDate ? ` — ${inputs.impactDate}` : ""}`;
}

/**
 * Change-request fields for a delay. `estimated_cost_impact` is left NULL when
 * no cost is recorded, so the CR register never shows an invented $0.
 * cr_number is NOT set here: the atomic create assigns it.
 */
export function delayChangeRequestFields(
  draft: DelayDraft,
  existingMetadata: Json | null | undefined,
  requestedBy: string | null,
): Record<string, unknown> {
  const inputs = draftInputs(draft);
  const cost = delayCost(inputs);
  return {
    title: delayTitle(inputs),
    description: inputs.whatHappened,
    reason: DELAY_CR_REASON,
    request_date: inputs.impactDate,
    requested_by: requestedBy,
    estimated_cost_impact: cost.total === null ? null : Math.round(cost.total * 100) / 100,
    affected_areas: inputs.responsibleParty ? `Responsible: ${inputs.responsibleParty}` : null,
    priority: "High",
    metadata: withMetadataSection(existingMetadata, DELAY_METADATA_KEY, metadataFromInputs(inputs)),
  };
}

/** Patch that records a notice as sent today without touching anything else. */
export function noticeSentPatch(record: DelayRecord, on: IsoDate): Record<string, unknown> {
  const inputs = { ...record.inputs, noticeSentOn: on };
  return { metadata: withMetadataSection(record.raw.metadata, DELAY_METADATA_KEY, metadataFromInputs(inputs)) };
}

export function formatMoney(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtLongDate(iso: IsoDate | null): string {
  if (!iso) return "[date]";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Paste-ready written notice of delay. Language reserves rights without
 * asserting entitlement; the PM reviews and sends it under their own name.
 * Sender is the signed-in org — never a literal company.
 */
export function buildDelayNotice(args: {
  record: DelayRecord;
  project: ProjectLike | null;
  senderName: string | null;
  orgName: string | null;
  today: IsoDate;
  affectedWork?: string | null;
}): string {
  const { record, project, senderName, orgName, today, affectedWork } = args;
  const i = record.inputs;
  const c = record.cost;
  const job = [project?.project_number, project?.name].filter(Boolean).join(" ");
  const impact: string[] = [];
  if (c.manHours !== null) {
    impact.push(`- Erection crew of ${i.crew} on standby ${i.hoursEach} hours each (${Math.round(c.manHours)} man-hours${c.labor !== null ? ` at ${formatMoney(i.laborRate)}/MH = ${formatMoney(c.labor)}` : ""})`);
  }
  if (i.craneHours !== null) {
    impact.push(`- Crane standby ${i.craneHours} hours${c.crane !== null ? ` at ${formatMoney(i.craneRate)}/hr = ${formatMoney(c.crane)}` : ""}`);
  }
  if (c.other !== null) impact.push(`- Other costs: ${formatMoney(c.other)}`);
  if (c.total !== null) impact.push(`- Estimated cost to date: ${formatMoney(c.total)}`);
  if (!impact.length) impact.push("- Crew and equipment impact to be quantified from the daily reports.");

  return [
    `Date: ${fmtLongDate(today)}`,
    `To: ${project?.general_contractor || "[General Contractor]"}${job ? ` — ${job}` : ""}`,
    `From: ${[senderName, orgName].filter(Boolean).join(", ") || "[Sender]"}`,
    `Re: NOTICE OF DELAY${record.number ? ` — ${record.number}` : ""} — ${i.cause ? DELAY_CAUSES[i.cause] : "Delay"}`,
    "",
    `This letter is written notice, under the notice provisions of our subcontract, of a delay to ${orgName ? `${orgName}'s` : "our"} structural steel erection work on the above project.`,
    "",
    `Date of impact: ${fmtLongDate(i.impactDate)}`,
    `Cause: ${i.cause ? DELAY_CAUSES[i.cause] : "[cause]"}`,
    `Responsible party: ${i.responsibleParty || "[to be determined]"}`,
    ...(affectedWork ? [`Work affected: ${affectedWork}`] : []),
    "",
    "What happened:",
    i.whatHappened || "[describe what happened, when we were told, and who we told]",
    "",
    "Impact to date:",
    ...impact,
    "",
    `Schedule impact: erection could not proceed as planned on ${fmtLongDate(i.impactDate)}. Any resulting change to the erection sequence or durations will be identified as the impact becomes known.`,
    "",
    "We reserve our right to recover the costs and time associated with this delay and will submit a change order request with supporting documentation (daily reports, crew time and equipment records). Please advise direction and a revised date for the affected work.",
    "",
    "Sincerely,",
    senderName || "",
    orgName || "",
  ].join("\n").replace(/\n+$/, "\n");
}
