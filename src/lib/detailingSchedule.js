/**
 * detailingSchedule.js — sequence-driven BACKWARD scheduling for a Detailing
 * Package, plus a deterministic "Risk to Schedule" signal.
 *
 * Pure + deterministic. No React, no Supabase. The package's required-by dates
 * are derived by working BACKWARD from the linked erection sequence date
 * (work_packages.scheduled_start_date) minus configurable lead times — never
 * stored, so they can't drift when the sequence date or leads change (design
 * doc §5). Unknown sequence date → all-null (render "TBD", never invent dates;
 * §22).
 *
 * Lead-time config (decision §9.2): per-project defaults + per-package override.
 * Defaults live here; project overrides in projects.metadata.detailing_lead_days,
 * per-package overrides in drawing_sets.metadata.detailing_lead_days.
 */

import { toLocalMidnight, daysBetween, todayLocalISO } from "@/lib/dateMath";
import { DETAILING_STATE_ORDER } from "@/lib/detailingPackageState";

/**
 * Default phase lead times, in calendar days, as the gap between consecutive
 * milestones working FORWARD (DetailingStart → … → Erection). Tunable per
 * project / package. These are sensible structural-steel starting points.
 */
export const DEFAULT_LEAD_DAYS = {
  detailing: 10,      // Detailing Start → Internal Review Due (detailing work)
  internalReview: 3,  // Internal Review Due → Submit By (checker/PM review)
  approval: 10,       // Submit By → Approval Needed By (EOR approval cycle)
  fabRelease: 2,      // Approval Needed By → Fab Release Required By (release buffer)
  fab: 15,            // Fab Release Required By → Erection Release Required By (fab + ship + deliver)
  erectionPrep: 3,    // Erection Release Required By → Erection start (field prep)
};

const ORDER_INDEX = (state) => {
  const i = DETAILING_STATE_ORDER.indexOf(state);
  return i === -1 ? 0 : i;
};

/** Local YYYY-MM-DD `n` days before `dateStr` (null on invalid input). */
function minusDays(dateStr, n) {
  const base = toLocalMidnight(dateStr);
  if (!base) return null;
  const d = new Date(base.getTime());
  d.setDate(d.getDate() - Math.round(n || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Merge lead-time config: DEFAULT_LEAD_DAYS ← project override ← package override.
 * @param {{ metadata?: any }|null} project
 * @param {{ metadata?: any }|null} pkg — the drawing_set row
 * @returns {typeof DEFAULT_LEAD_DAYS}
 */
export function resolveLeadDays(project, pkg) {
  const proj = (project && project.metadata && project.metadata.detailing_lead_days) || {};
  const local = (pkg && pkg.metadata && pkg.metadata.detailing_lead_days) || {};
  return { ...DEFAULT_LEAD_DAYS, ...proj, ...local };
}

/**
 * Backward-scheduled required-by dates for a package, derived from the linked
 * erection start date. All null when `erectionStart` is missing/invalid.
 *
 * @param {string|null|undefined} erectionStart — YYYY-MM-DD (WP scheduled_start_date)
 * @param {Partial<typeof DEFAULT_LEAD_DAYS>} [leadDays]
 * @returns {{ detailingStart: string|null, internalReviewDue: string|null,
 *   submitBy: string|null, approvalNeededBy: string|null,
 *   fabReleaseRequiredBy: string|null, erectionReleaseRequiredBy: string|null }}
 */
export function computeBackwardDates(erectionStart, leadDays = DEFAULT_LEAD_DAYS) {
  const lead = { ...DEFAULT_LEAD_DAYS, ...(leadDays || {}) };
  const empty = {
    detailingStart: null, internalReviewDue: null, submitBy: null,
    approvalNeededBy: null, fabReleaseRequiredBy: null, erectionReleaseRequiredBy: null,
  };
  if (!toLocalMidnight(erectionStart)) return empty;

  const erectionReleaseRequiredBy = minusDays(erectionStart, lead.erectionPrep);
  const fabReleaseRequiredBy = minusDays(erectionReleaseRequiredBy, lead.fab);
  const approvalNeededBy = minusDays(fabReleaseRequiredBy, lead.fabRelease);
  const submitBy = minusDays(approvalNeededBy, lead.approval);
  const internalReviewDue = minusDays(submitBy, lead.internalReview);
  const detailingStart = minusDays(internalReviewDue, lead.detailing);

  return {
    detailingStart, internalReviewDue, submitBy,
    approvalNeededBy, fabReleaseRequiredBy, erectionReleaseRequiredBy,
  };
}

// Risk milestones: each required-by date and the minimum operational state that
// means the milestone is "met". (internalReviewDue is informational, not gated.)
const RISK_MILESTONES = [
  { key: "detailingStart",            label: "Detailing not started", requires: "In Detailing" },
  { key: "submitBy",                  label: "Not submitted",         requires: "IFA" },
  { key: "approvalNeededBy",          label: "Not approved",          requires: "BFA" },
  { key: "fabReleaseRequiredBy",      label: "Not released for fab",  requires: "Released" },
  { key: "erectionReleaseRequiredBy", label: "Not released to field", requires: "Released for Erection" },
];

/**
 * Deterministic "Risk to Schedule" for a package: a milestone is at risk when
 * its required-by date is in the PAST but the package hasn't reached the state
 * that milestone demands.
 *
 * @param {object} args
 * @param {ReturnType<typeof computeBackwardDates>} args.backwardDates
 * @param {string} args.effectiveState — from effectiveDetailingState()
 * @param {string} [args.today] — YYYY-MM-DD (defaults to local today; for tests)
 * @returns {{ atRisk: boolean, severity: "none"|"at_risk"|"critical",
 *   missed: string[], reasons: string[], daysLate: number }}
 */
export function computeScheduleRisk({ backwardDates, effectiveState, today } = {}) {
  const dates = backwardDates || {};
  const ref = today || todayLocalISO();
  const stateIdx = ORDER_INDEX(effectiveState);

  const missed = [];
  const reasons = [];
  let daysLate = 0;

  for (const m of RISK_MILESTONES) {
    const requiredBy = dates[m.key];
    if (!requiredBy) continue;                 // no sequence date → TBD, not a risk
    const late = daysBetween(requiredBy, ref); // > 0 when ref is past requiredBy
    if (late <= 0) continue;                   // not yet due
    if (stateIdx >= ORDER_INDEX(m.requires)) continue; // milestone already met
    missed.push(m.key);
    reasons.push(`${m.label} (${late}d past ${requiredBy})`);
    if (late > daysLate) daysLate = late;
  }

  const severity = missed.length === 0 ? "none" : missed.length >= 2 ? "critical" : "at_risk";
  return { atRisk: missed.length > 0, severity, missed, reasons, daysLate };
}
