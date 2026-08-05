/**
 * submittalWorkdayDue.ts — Phase 5 (flag-gated) WORKING-DAY due-date stamping.
 *
 * When a submittal goes OUT to someone with a clock — into OFA (Out For
 * Approval; ball → GC/EOR/AOR) or OFS (Out For Scrub; ball → detailer) — this
 * module decides the DUE DATE, computed in working days (Mon–Fri) from the
 * project's turnaround lead-times. All deterministic + pure: no React, no
 * Supabase, `today` injected as 'YYYY-MM-DD'.
 *
 * Wiring: the caller (Submittals.tsx onAdvance / onStatusChange → the same
 * addSubmittalRound path Phase 2's revision bump uses) gates on the
 * `submittal_workday_dues` flag and passes the result through advanceMut's
 * extraPatch. The learned forecast (submittalForecast.ts) is untouched — this
 * is a deterministic deadline layer ALONGSIDE it, not a replacement.
 *
 * Lead-time source: projects.metadata.detailing_lead_days (per-project) with an
 * optional per-package override in drawing_sets.metadata.detailing_lead_days —
 * the SAME bag resolveLeadDays() reads for the backward schedule. We reuse its
 * `approval` key for the OFA (approval) turnaround. OFS (scrub) has no existing
 * key, so we read an OPTIONAL additive `scrub` key from the same bag and fall
 * back to a sensible default when absent. Values are interpreted as WORKING
 * days here (the existing backward schedule reads them as calendar days; that
 * calendar-day behavior is unchanged — only this new, flag-gated layer treats
 * them as working days).
 */

import { DEFAULT_LEAD_DAYS } from "@/lib/detailingSchedule";
import { addWorkingDays } from "@/lib/workingDays";

/** The two outbound stages that start someone else's review clock. */
export type OutboundStage = "OFA" | "OFS";

/**
 * Default WORKING-day turnaround when the project has no lead-time config.
 * OFA reuses the schedule's `approval` default (10). OFS (post-approval scrub)
 * has no dedicated schedule key; 10 working days is a sensible structural-steel
 * default that a project can override with a `scrub` key.
 */
export const DEFAULT_WORKDAY_LEADS: Record<OutboundStage, number> = {
  OFA: DEFAULT_LEAD_DAYS.approval, // 10
  OFS: 10,
};

/** True for the two outbound stages that get a working-day due date. */
export function isOutboundStage(
  stage: string | null | undefined,
): stage is OutboundStage {
  return stage === "OFA" || stage === "OFS";
}

type LeadBag = { detailing_lead_days?: Record<string, unknown> } | null | undefined;

function readLead(bag: LeadBag, key: string): number | null {
  const raw = bag?.detailing_lead_days?.[key];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Resolve the WORKING-day lead for one outbound stage, in this precedence:
 *   package override (drawing_sets.metadata) → project (projects.metadata) →
 *   DEFAULT_WORKDAY_LEADS.
 *
 * OFA reads `approval`, OFS reads `scrub`. A per-package override wins so a
 * fast-track set can shorten its own clock without touching the project
 * defaults — mirrors resolveLeadDays()'s project←package layering.
 *
 * @param stage         "OFA" | "OFS"
 * @param projectMeta   projects.metadata (may be null)
 * @param packageMeta   drawing_sets.metadata for the governing set (optional)
 */
export function resolveWorkdayLead(
  stage: OutboundStage,
  projectMeta: LeadBag,
  packageMeta?: LeadBag,
): number {
  const key = stage === "OFA" ? "approval" : "scrub";
  const fromPackage = readLead(packageMeta, key);
  if (fromPackage != null) return fromPackage;
  const fromProject = readLead(projectMeta, key);
  if (fromProject != null) return fromProject;
  return DEFAULT_WORKDAY_LEADS[stage];
}

export interface WorkdayDueDecision {
  /** The due date to WRITE to submittals.required_date, or null to leave it. */
  requiredDate: string | null;
  /** Why we didn't stamp (for logging/tests). undefined when we did. */
  skipReason?: "flag-off" | "not-outbound" | "already-set" | "no-today";
  /** The working-day lead that was applied (present only when stamped). */
  leadDays?: number;
}

/**
 * Decide whether — and to what — to stamp a submittal's working-day due date on
 * a move into an outbound stage. Stamps ONLY when ALL hold:
 *   1. the flag is on (`flagEnabled`),
 *   2. the move lands in an outbound stage (OFA/OFS),
 *   3. no due date is already set (`currentRequiredDate` is empty),
 *   4. `today` is a usable date.
 *
 * When it stamps, requiredDate = addWorkingDays(today, lead). Otherwise
 * requiredDate is null and skipReason explains why — so the caller never
 * overwrites an operator-set date or changes required_date's meaning when the
 * flag is off.
 */
export function decideWorkdayDue(args: {
  stage: string | null | undefined;
  currentRequiredDate: string | null | undefined;
  today: string | null | undefined;
  flagEnabled: boolean;
  projectMeta?: LeadBag;
  packageMeta?: LeadBag;
}): WorkdayDueDecision {
  const { stage, currentRequiredDate, today, flagEnabled, projectMeta, packageMeta } = args;

  if (!flagEnabled) return { requiredDate: null, skipReason: "flag-off" };
  if (!isOutboundStage(stage)) return { requiredDate: null, skipReason: "not-outbound" };
  if (String(currentRequiredDate ?? "").trim()) {
    return { requiredDate: null, skipReason: "already-set" };
  }
  if (!String(today ?? "").trim()) return { requiredDate: null, skipReason: "no-today" };

  const leadDays = resolveWorkdayLead(stage, projectMeta, packageMeta);
  const requiredDate = addWorkingDays(today, leadDays);
  if (!requiredDate) return { requiredDate: null, skipReason: "no-today" };
  return { requiredDate, leadDays };
}
