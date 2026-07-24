/**
 * submittalStageMapping.ts — Pure helpers for translating between
 * submittal workflow status (the post-Sprint-2 source of truth) and the
 * drawing "stage" enum that the Drawings page UI still uses to colour
 * chevrons, KPI tiles, and group-header badges.
 *
 * No React, no Supabase, no side effects. All inputs are plain objects,
 * all outputs are strings or numbers.
 *
 * ── Canonical 7-stage detailing/submittal flow (corrected May 2026) ──
 *
 *   Not Started → IFA → OFA → BFA → OFS → IFC → Released for Fab
 *                                    ↑
 *                                    └─ R&R (Revise & Resubmit) loops
 *                                       back to IFA. R&R is an OUTCOME
 *                                       status on a submittal, not a
 *                                       stage — it's surfaced via the
 *                                       UI as a "Restart cycle" badge
 *                                       and rolled up as IFA in counts.
 *
 * Stage glossary:
 *   IFA = In For Approval         (internal prep — detailer → S&H → GC,
 *                                  before going to EOR)
 *   OFA = Out For Approval        (submitted to EOR / AOR)
 *   BFA = Back From Approval      (returned with AAN / Approved / R&R)
 *   OFS = Out For Scrub           (post-approval cleanup; detailer
 *                                  addressing EOR's comments)
 *   IFC = Issued For Construction (S&H sends record copy to GC)
 *   Released                      (S&H internal release to fab shop)
 *
 * Mapping uses (status, ball_in_court) — no schema migration needed:
 *
 *   Status                          | BIC (Detailer-class)  → IFA / OFS
 *                                   | BIC (Approver-class)  → OFA / BFA
 *                                   | BIC (Downstream-class)→ OFA / IFC
 *
 *   Draft                           | (any)                  → IFA
 *   Submitted / Under Review        | Detailer / S&H / Contractor → IFA
 *                                   | EOR / Architect / AOR /
 *                                     GC / Owner            → OFA
 *   Approved / Approved as Noted    | EOR / Architect / AOR  → BFA
 *                                   | Detailer / S&H / Contractor → OFS
 *                                   | GC / Owner             → IFC
 *   Revise and Resubmit / Rejected  | (any)                  → IFA
 *                                                              (R&R loop)
 *   Released for Fabrication        | (any)                  → Released
 *   Void                            | (any)                  → null (skip)
 */

import { STAGE_ORDER } from "@/components/drawings/drawingsConfig";

/** drawingsConfig is still .js — treat STAGE_ORDER as a string list. */
const STAGE_KEYS = STAGE_ORDER as readonly string[];

/** Submittal-like row used by stage derivation helpers. */
export interface SubmittalLike {
  id?: string | null;
  status?: string | null;
  ball_in_court?: string | null;
  approved_date?: string | null;
  submitted_date?: string | null;
  updated_at?: string | null;
  round_number?: number | null;
  is_deleted?: boolean | null;
  assigned_to?: string | null;
  reviewer?: string | null;
  submittal_number?: string | null;
  drawing_set_ids?: string[] | null;
  /** Due-date fields used by hub triage / health scoring read paths. */
  due_date?: string | null;
  required_date?: string | null;
  date_required?: string | null;
  title?: string | null;
  name?: string | null;
}

/** Sheet/drawing-like row used as legacy stage fallback. */
export interface SheetLike {
  stage?: string | null;
}

export interface StageSubmittalPair {
  status: string;
  ball_in_court: string | null;
}

/** BIC discriminator classes — used to split status buckets by ownership. */
const DETAILER_CLASS_BIC: ReadonlySet<string> = new Set([
  "Detailer", "S&H", "Contractor", "Subcontractor",
]);
const APPROVER_CLASS_BIC: ReadonlySet<string> = new Set(["EOR", "Architect", "AOR"]);
const DOWNSTREAM_CLASS_BIC: ReadonlySet<string> = new Set(["GC", "Owner"]);

/** Match the .ts hook's terminal set so we never disagree on "open". */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

/** Statuses that represent an R&R (loop-back) outcome. */
const RR_STATUSES: ReadonlySet<string> = new Set(["Revise and Resubmit", "Rejected"]);

/**
 * COMPLETED ("closed") submittal statuses — the NARROW set where the workflow
 * is truly done and the ball-in-court should be cleared (→ shown as "Closed").
 *
 * Deliberately NARROWER than the terminal/approved set: "Approved" and
 * "Approved as Noted" are MID-FLOW outcomes (the package still routes onward
 * to OFS/IFC/fab), so they KEEP their reviewer. Only a final fab release or a
 * void closes the cycle.
 *
 * Canonical source for the page; drawingSubmittalHub/format.ts keeps its own
 * register-display copy intentionally.
 */
export const CLOSED_SUBMITTAL_STATUSES: ReadonlySet<string> = new Set([
  "Released for Fabrication",
  "Void",
]);

function bicIn(set: ReadonlySet<string>, ball_in_court: string | null | undefined): boolean {
  return typeof ball_in_court === "string" && set.has(ball_in_court);
}

/**
 * Map a single submittal's (status, ball_in_court, approved_date) to a
 * canonical drawing stage. Returns one of STAGE_ORDER, or null when the
 * submittal carries no usable signal (e.g. status === "Void" or an
 * unrecognised status string).
 *
 * R&R outcomes (Revise and Resubmit / Rejected) are mapped to IFA — the
 * cycle restarts back at internal prep. Callers that care about
 * surfacing R&R as its own UI badge should use `isRRStatus(status)`
 * alongside this function.
 *
 * @param approved_date — ISO date or null (unused today; reserved for
 *   future OFS/IFC distinction by date-stamped events)
 */
export function submittalStatusToStage(
  status: string | null | undefined,
  ball_in_court: string | null | undefined,
  // Reserved for future OFS/IFC date-stamped distinction — keep the arity.
  approved_date?: string | null,
): string | null {
  void approved_date;
  if (!status) return null;
  if (status === "Void") return null;
  if (status === "Released for Fabrication") return "Released";

  // R&R loops back to IFA. Surface separately via isRRStatus() if you
  // want a dedicated badge.
  if (RR_STATUSES.has(status)) return "IFA";

  if (status === "Approved" || status === "Approved as Noted") {
    if (bicIn(APPROVER_CLASS_BIC, ball_in_court)) return "BFA";
    if (bicIn(DETAILER_CLASS_BIC, ball_in_court)) return "OFS";
    if (bicIn(DOWNSTREAM_CLASS_BIC, ball_in_court)) return "IFC";
    // BIC missing/unknown — default to BFA (just-returned, not yet
    // routed onward). Better than guessing OFS or IFC and being wrong.
    return "BFA";
  }

  if (status === "Submitted" || status === "Under Review") {
    if (bicIn(DETAILER_CLASS_BIC, ball_in_court)) return "IFA";
    // EOR / Architect / AOR / GC / Owner / unknown → OFA (default
    // outbound; matches the flow where Detailer→S&H→GC→EOR all happen
    // while the submittal is "Submitted").
    return "OFA";
  }

  if (status === "Draft") return "IFA";
  return null;
}

/**
 * Inverse: given a drawing stage, propose the (status, ball_in_court)
 * pair that would put a NEW submittal at that stage. Used when the
 * Drawings page rewires "Advance Stage" / "Bulk Stage Apply" to create
 * or update a submittal instead of mutating drawings.stage directly.
 *
 * Returns null for "Not Started" (no submittal needed) and for unknown
 * stages.
 */
export function stageToSubmittalStatus(stage: string): StageSubmittalPair | null {
  switch (stage) {
    case "Not Started":
      return null; // no submittal yet
    case "IFA":
      return { status: "Draft",                     ball_in_court: "Detailer" };
    case "OFA":
      return { status: "Submitted",                 ball_in_court: "EOR" };
    case "BFA":
      return { status: "Approved as Noted",         ball_in_court: "EOR" };
    case "OFS":
      return { status: "Approved as Noted",         ball_in_court: "Detailer" };
    case "IFC":
      return { status: "Approved",                  ball_in_court: "GC" };
    case "Released":
      return { status: "Released for Fabrication",  ball_in_court: null };
    default:
      return null;
  }
}

/** True if a status represents an R&R (revise & resubmit) outcome. */
export function isRRStatus(status: string | null | undefined): boolean {
  return status != null && RR_STATUSES.has(status);
}

/**
 * Pick the most-recently-touched submittal from an array. Sort key:
 *   1. submitted_date (desc, ISO sort)
 *   2. updated_at (desc)
 *   3. round_number (desc)
 *
 * Returns null on empty / null input.
 */
export function pickMostRecentSubmittal<T extends SubmittalLike>(
  submittals: T[] | null | undefined,
): T | null {
  if (!Array.isArray(submittals) || submittals.length === 0) return null;
  const active = submittals.filter((s) => s && !s.is_deleted);
  if (active.length === 0) return null;
  const sorted = active.slice().sort((a, b) => {
    const aD = a.submitted_date || "";
    const bD = b.submitted_date || "";
    if (aD !== bD) return bD.localeCompare(aD);
    const aU = a.updated_at || "";
    const bU = b.updated_at || "";
    if (aU !== bU) return bU.localeCompare(aU);
    return (b.round_number || 1) - (a.round_number || 1);
  });
  return sorted[0];
}

/**
 * Derive the canonical stage for a drawing SET, given:
 *   - submittals linked to that set (via drawing_set_ids[])
 *   - sheets that belong to the set (legacy fallback when no submittal
 *     exists yet)
 *
 * Strategy:
 *   1. If the set has at least one ACTIVE submittal (non-Void,
 *      non-deleted, recognised status), pick the most-recent one and
 *      map its status to a stage.
 *   2. Otherwise (no submittal yet), fall back to the dominant stage
 *      among the linked sheets — preserving today's display for the
 *      legacy data that hasn't moved into submittals yet.
 *   3. If neither submittals nor sheets give us a signal, return
 *      "Not Started".
 */
export function derivedSetStage(
  submittalsForSet: SubmittalLike[] | null | undefined,
  sheetsForSet: SheetLike[] = [],
): string {
  const usable = (Array.isArray(submittalsForSet) ? submittalsForSet : []).filter((s) => {
    if (!s || s.is_deleted) return false;
    return submittalStatusToStage(s.status, s.ball_in_court, s.approved_date) !== null;
  });
  const mostRecent = pickMostRecentSubmittal(usable);
  if (mostRecent) {
    const stage = submittalStatusToStage(
      mostRecent.status,
      mostRecent.ball_in_court,
      mostRecent.approved_date,
    );
    if (stage) return stage;
  }
  if (Array.isArray(sheetsForSet) && sheetsForSet.length > 0) {
    return dominantStage(sheetsForSet.map((s) => s?.stage));
  }
  return "Not Started";
}

/**
 * Pick the dominant (most-common, ties → earliest in canonical order)
 * stage from a list of stage strings. Unknown / falsy entries are
 * dropped. Returns "Not Started" when the list is empty.
 */
export function dominantStage(
  stages: Array<string | null | undefined> | null | undefined,
): string {
  if (!Array.isArray(stages) || stages.length === 0) return "Not Started";
  const counts = new Map<string, number>();
  for (const s of stages) {
    if (!s || !STAGE_KEYS.includes(s)) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  if (counts.size === 0) return "Not Started";
  let bestKey: string | null = null;
  let bestCount = -1;
  for (const key of STAGE_KEYS) {
    const c = counts.get(key) || 0;
    if (c > bestCount) {
      bestKey = key;
      bestCount = c;
    }
  }
  return bestKey || "Not Started";
}

/**
 * Convenience: returns true when a stage is in the "active workflow"
 * range (anything that has left Not Started but isn't terminal).
 * Single source of truth shared with IN_REVIEW_STAGES in drawingsConfig.
 */
export function isStageInReview(stage: string | null | undefined): boolean {
  return stage === "IFA" || stage === "OFA" || stage === "BFA" ||
         stage === "OFS" || stage === "IFC";
}

/** Re-export for tests / consumers that want the open/closed split. */
export { TERMINAL_STATUSES };
