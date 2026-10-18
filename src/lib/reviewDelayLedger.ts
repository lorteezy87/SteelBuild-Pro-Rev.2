/**
 * reviewDelayLedger.ts — Contract review-period delay ledger for submittals.
 *
 * Answers the questions a steel PM has to answer in writing when approvals run
 * long: "which review rounds went past the contract review period, by how many
 * days, who was holding them, and how much total delay does each reviewer own?"
 * It is the contemporaneous record behind a delay notice or time-impact claim.
 *
 * How it differs from the existing approval analytics:
 *   - submittalForecast.ts predicts when an open review will come back.
 *   - submittalAnalytics.ts (CycleTimeCard) reports how long cycles took.
 *   - submittalRiskAging.ts tiers a package by how long it has sat in a stage.
 *   This module measures each review ROUND against the project's contract
 *   review allowance and records the days over, open or closed.
 *
 * Allowance source: the same `detailing_lead_days.approval` key that
 * submittalWorkdayDue.ts reads (per-package override → project → default),
 * via resolveWorkdayLead("OFA", …). The caller picks the day basis to match
 * the hub's `useWorkdays` setting so the two never disagree.
 *
 * Evidence rules ("absence is not evidence"):
 *   - A round with no submitted date is UNKNOWN, not on time. It is listed with
 *     reason "no-sent-date" and excluded from every total.
 *   - A round that is no longer with the reviewer (a disposition, or the
 *     submittal has closed) but carries no returned date is UNKNOWN. We never
 *     invent a return date from "today".
 *   - Void and deleted submittals and deleted rounds are excluded entirely.
 *   - Submittal-level dates are used only for a submittal with no live rounds,
 *     so a cycle is never counted twice (same rule as submittalForecast.ts).
 *
 * Pure: no React, no Supabase, `today` is injected as 'YYYY-MM-DD'.
 */

import { addWorkingDays, diffCalendarDays, formatISO, parseLocalDate, workingDaysBetween } from "@/lib/workingDays";
import { resolveWorkdayLead } from "@/lib/submittalWorkdayDue";

export type DayBasis = "working" | "calendar";

/** Escalation step by CALENDAR days past the allowance (7 / 14 / 21). */
export type DelayTier = "on_time" | "follow_up" | "reviewer_escalation" | "executive_escalation" | "delay_notice";

export const DELAY_TIER_LABEL: Record<DelayTier, string> = {
  on_time: "Within review period",
  follow_up: "Follow up with ball in court",
  reviewer_escalation: "Escalate: reviewer + GC PM",
  executive_escalation: "Escalate: GC PM + project executive",
  delay_notice: "Issue written delay notice",
};

export const DELAY_TIER_THRESHOLDS = { reviewer: 7, executive: 14, notice: 21 } as const;

export function delayTier(calendarDaysOver: number): DelayTier {
  if (calendarDaysOver <= 0) return "on_time";
  if (calendarDaysOver >= DELAY_TIER_THRESHOLDS.notice) return "delay_notice";
  if (calendarDaysOver >= DELAY_TIER_THRESHOLDS.executive) return "executive_escalation";
  if (calendarDaysOver >= DELAY_TIER_THRESHOLDS.reviewer) return "reviewer_escalation";
  return "follow_up";
}

/** Round statuses that mean the reviewer still holds the round. */
const WITH_REVIEWER = new Set(["Submitted", "Under Review"]);

export interface LedgerSubmittal {
  id: string;
  submittal_number?: string | null;
  title?: string | null;
  status?: string | null;
  reviewer?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  is_deleted?: boolean | null;
  drawing_set_ids?: string[] | null;
}

export interface LedgerRound {
  id?: string | null;
  submittal_id?: string | null;
  round_number?: number | null;
  status?: string | null;
  reviewer?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  is_deleted?: boolean | null;
}

type LeadBag = { detailing_lead_days?: Record<string, unknown> } | null | undefined;

export type UnknownReason = "no-sent-date" | "no-return-date" | "return-before-sent";

export interface LedgerEntry {
  submittalId: string;
  submittalNumber: string;
  title: string;
  roundNumber: number;
  /** "round" when read from submittal_rounds, "submittal" for the legacy single cycle. */
  source: "round" | "submittal";
  reviewer: string;
  status: string;
  sentDate: string | null;
  /** Date the review period ran out (sent + allowance in the chosen basis). */
  dueDate: string | null;
  returnedDate: string | null;
  open: boolean;
  allowanceDays: number;
  /** Days the reviewer has held / held the round, in the chosen basis. */
  daysHeld: number | null;
  /** Days past the allowance in the chosen basis (0 when within it). */
  daysOver: number | null;
  /** Calendar days past the due date (drives the escalation tier). */
  calendarDaysOver: number | null;
  tier: DelayTier | null;
  /** Present when the round cannot be measured; it is excluded from totals. */
  unknown?: UnknownReason;
}

export interface ReviewerDelayRow {
  reviewer: string;
  rounds: number;
  closed: number;
  open: number;
  onTime: number;
  late: number;
  openLate: number;
  /** Sum of days over, in the chosen basis, across measurable rounds. */
  totalDaysOver: number;
  /** Mean days held on closed rounds, null when none closed. */
  avgDaysHeldClosed: number | null;
  /** Largest single overrun. */
  worstDaysOver: number;
}

export interface DelayLedger {
  basis: DayBasis;
  allowanceDays: number;
  entries: LedgerEntry[];
  reviewers: ReviewerDelayRow[];
  summary: {
    measured: number;
    unknown: number;
    late: number;
    openLate: number;
    totalDaysOver: number;
    noticeDue: number;
  };
}

const UNASSIGNED = "Unassigned";

function clean(s: string | null | undefined): string {
  return String(s ?? "").trim();
}

function isoDay(s: string | null | undefined): string | null {
  const d = parseLocalDate(s);
  return d ? formatISO(d) : null;
}

function addCalendarDays(iso: string, n: number): string | null {
  const d = parseLocalDate(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return formatISO(d);
}

function span(a: string, b: string, basis: DayBasis): number | null {
  return basis === "working" ? workingDaysBetween(a, b) : diffCalendarDays(a, b);
}

function measure(args: {
  base: Omit<LedgerEntry, "dueDate" | "daysHeld" | "daysOver" | "calendarDaysOver" | "tier" | "unknown" | "open" | "allowanceDays">;
  withReviewer: boolean;
  allowance: number;
  basis: DayBasis;
  today: string;
}): LedgerEntry {
  const { base, withReviewer, allowance, basis, today } = args;
  const entry: LedgerEntry = {
    ...base,
    open: false,
    allowanceDays: allowance,
    dueDate: null,
    daysHeld: null,
    daysOver: null,
    calendarDaysOver: null,
    tier: null,
  };
  if (!base.sentDate) return { ...entry, unknown: "no-sent-date" };

  const due = basis === "working" ? addWorkingDays(base.sentDate, allowance) : addCalendarDays(base.sentDate, allowance);
  entry.dueDate = due;

  let end: string;
  if (base.returnedDate) {
    end = base.returnedDate;
  } else if (withReviewer) {
    end = today;
    entry.open = true;
  } else {
    return { ...entry, unknown: "no-return-date" };
  }

  const held = span(base.sentDate, end, basis);
  if (held == null || held < 0) return { ...entry, unknown: "return-before-sent" };
  entry.daysHeld = held;

  const overRaw = due ? span(due, end, basis) : null;
  const calRaw = due ? diffCalendarDays(due, end) : null;
  entry.daysOver = overRaw == null ? null : Math.max(0, overRaw);
  entry.calendarDaysOver = calRaw == null ? null : Math.max(0, calRaw);
  entry.tier = entry.calendarDaysOver == null ? null : delayTier(entry.calendarDaysOver);
  return entry;
}

/**
 * Build the delay ledger for one project's submittals.
 *
 * @param packageMetaBySetId optional drawing_sets.metadata by set id; the first
 *   linked set carrying an approval override sets that submittal's allowance.
 */
export function buildReviewDelayLedger(args: {
  submittals: readonly LedgerSubmittal[] | null | undefined;
  rounds: readonly LedgerRound[] | null | undefined;
  today: string;
  projectMeta?: LeadBag;
  packageMetaBySetId?: ReadonlyMap<string, LeadBag> | null;
  basis?: DayBasis;
}): DelayLedger {
  const basis: DayBasis = args.basis ?? "working";
  const today = isoDay(args.today) ?? args.today;
  const projectAllowance = resolveWorkdayLead("OFA", args.projectMeta);

  const roundsBySub = new Map<string, LedgerRound[]>();
  for (const r of args.rounds ?? []) {
    if (!r?.submittal_id || r.is_deleted) continue;
    const list = roundsBySub.get(r.submittal_id) ?? [];
    list.push(r);
    roundsBySub.set(r.submittal_id, list);
  }

  const entries: LedgerEntry[] = [];
  for (const sub of args.submittals ?? []) {
    if (!sub?.id || sub.is_deleted || clean(sub.status) === "Void") continue;

    let allowance = projectAllowance;
    if (args.packageMetaBySetId && Array.isArray(sub.drawing_set_ids)) {
      for (const setId of sub.drawing_set_ids) {
        const meta = args.packageMetaBySetId.get(setId);
        const raw = Number(meta?.detailing_lead_days?.approval);
        if (meta && Number.isFinite(raw) && raw >= 0) {
          allowance = resolveWorkdayLead("OFA", args.projectMeta, meta);
          break;
        }
      }
    }

    const subStatus = clean(sub.status);
    const subNumber = clean(sub.submittal_number) || "—";
    const title = clean(sub.title);
    const rounds = (roundsBySub.get(sub.id) ?? []).slice().sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0));

    if (rounds.length > 0) {
      for (const r of rounds) {
        const status = clean(r.status) || "Submitted";
        // A round only stays with the reviewer while its own status says so AND
        // the submittal itself has not moved on to a terminal state.
        const withReviewer = WITH_REVIEWER.has(status) && (subStatus === "" || WITH_REVIEWER.has(subStatus) || subStatus === "Draft");
        entries.push(
          measure({
            base: {
              submittalId: sub.id,
              submittalNumber: subNumber,
              title,
              roundNumber: r.round_number ?? 1,
              source: "round",
              reviewer: clean(r.reviewer) || clean(sub.reviewer) || clean(r.ball_in_court) || UNASSIGNED,
              status,
              sentDate: isoDay(r.submitted_date),
              returnedDate: isoDay(r.returned_date),
            },
            withReviewer,
            allowance,
            basis,
            today,
          }),
        );
      }
      continue;
    }

    // Legacy single cycle from the submittal row. Draft submittals were never sent.
    if (subStatus === "Draft" || (!sub.submitted_date && !sub.returned_date && !WITH_REVIEWER.has(subStatus))) continue;
    entries.push(
      measure({
        base: {
          submittalId: sub.id,
          submittalNumber: subNumber,
          title,
          roundNumber: 1,
          source: "submittal",
          reviewer: clean(sub.reviewer) || clean(sub.ball_in_court) || UNASSIGNED,
          status: subStatus || "Submitted",
          sentDate: isoDay(sub.submitted_date),
          returnedDate: isoDay(sub.returned_date),
        },
        withReviewer: WITH_REVIEWER.has(subStatus),
        allowance,
        basis,
        today,
      }),
    );
  }

  entries.sort(
    (a, b) =>
      Number(b.open) - Number(a.open) ||
      (b.daysOver ?? -1) - (a.daysOver ?? -1) ||
      a.submittalNumber.localeCompare(b.submittalNumber, undefined, { numeric: true }) ||
      a.roundNumber - b.roundNumber,
  );

  const byReviewer = new Map<string, ReviewerDelayRow & { heldSum: number }>();
  let measured = 0;
  let unknown = 0;
  let late = 0;
  let openLate = 0;
  let totalDaysOver = 0;
  let noticeDue = 0;
  for (const e of entries) {
    if (e.unknown || e.daysOver == null) {
      unknown += 1;
      continue;
    }
    measured += 1;
    const row =
      byReviewer.get(e.reviewer) ??
      { reviewer: e.reviewer, rounds: 0, closed: 0, open: 0, onTime: 0, late: 0, openLate: 0, totalDaysOver: 0, avgDaysHeldClosed: null, worstDaysOver: 0, heldSum: 0 };
    row.rounds += 1;
    if (e.open) row.open += 1;
    else {
      row.closed += 1;
      row.heldSum += e.daysHeld ?? 0;
    }
    if (e.daysOver > 0) {
      row.late += 1;
      late += 1;
      if (e.open) {
        row.openLate += 1;
        openLate += 1;
      }
    } else row.onTime += 1;
    row.totalDaysOver += e.daysOver;
    row.worstDaysOver = Math.max(row.worstDaysOver, e.daysOver);
    totalDaysOver += e.daysOver;
    if (e.tier === "delay_notice") noticeDue += 1;
    byReviewer.set(e.reviewer, row);
  }

  const reviewers: ReviewerDelayRow[] = [...byReviewer.values()]
    .map(({ heldSum, ...r }) => ({ ...r, avgDaysHeldClosed: r.closed > 0 ? Math.round((heldSum / r.closed) * 10) / 10 : null }))
    .sort((a, b) => b.totalDaysOver - a.totalDaysOver || b.openLate - a.openLate || a.reviewer.localeCompare(b.reviewer));

  return {
    basis,
    allowanceDays: projectAllowance,
    entries,
    reviewers,
    summary: { measured, unknown, late, openLate, totalDaysOver, noticeDue },
  };
}

const UNKNOWN_LABEL: Record<UnknownReason, string> = {
  "no-sent-date": "No sent date recorded",
  "no-return-date": "Returned, but no return date recorded",
  "return-before-sent": "Return date is before sent date",
};

export function unknownReasonLabel(reason: UnknownReason): string {
  return UNKNOWN_LABEL[reason];
}

/** Quote a CSV cell and neutralise spreadsheet formula injection (=, +, -, @). */
function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** The delay log as CSV — one row per review round, measured or not. */
export function buildDelayLedgerCsv(ledger: DelayLedger, projectLabel = ""): string {
  const unit = ledger.basis === "working" ? "working days" : "calendar days";
  const headers = [
    "Project",
    "Submittal",
    "Title",
    "Round",
    "Reviewer",
    "Status",
    "Sent",
    `Review period (${unit})`,
    "Review due",
    "Returned",
    "Open",
    `Days held (${unit})`,
    `Days over (${unit})`,
    "Calendar days over",
    "Escalation",
    "Note",
  ];
  const rows = ledger.entries.map((e) => [
    projectLabel,
    e.submittalNumber,
    e.title,
    e.roundNumber,
    e.reviewer,
    e.status,
    e.sentDate ?? "",
    e.allowanceDays,
    e.dueDate ?? "",
    e.returnedDate ?? "",
    e.open ? "Yes" : "No",
    e.daysHeld ?? "",
    e.daysOver ?? "",
    e.calendarDaysOver ?? "",
    e.tier ? DELAY_TIER_LABEL[e.tier] : "",
    e.unknown ? `${UNKNOWN_LABEL[e.unknown]}; excluded from totals` : e.source === "submittal" ? "From submittal dates (no round log)" : "",
  ]);
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
