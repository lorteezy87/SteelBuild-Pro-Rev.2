/**
 * detailingPackageState.js — the coalesced OPERATIONAL state of a Detailing
 * Package (a drawing_set), spanning the three phases the vision needs:
 *
 *   DRAFTING (manual, pre-submittal)   SUBMITTAL (derived — the §20 authority)   RELEASE (manual, post-fab)
 *   Not Started → In Detailing →       IFA → OFA → BFA → OFS → IFC → Released     Partially Released →
 *   Internal Review → Ready to Submit                                            Released for Erection
 *
 * Pure + deterministic. No React, no Supabase. Reuses submittalStageMapping so
 * the submittal phase stays the single source of truth — this module only ADDS
 * the upstream drafting states and the downstream release states, which live in
 * the manual `drawing_sets.detailing_state` column (migration 20260526220000).
 *
 * Precedence (see docs/detailing-control-center-design.md §3):
 *   1. a RELEASE state (furthest along) always wins;
 *   2. else if a submittal governs the package → the derived submittal stage;
 *   3. else a DRAFTING state, if one is set;
 *   4. else the legacy sheet-derived stage / "Not Started".
 *
 * 'Superseded' is ORTHOGONAL (derived from revisions), exposed separately via
 * isPackageSuperseded() — it is not part of the linear effective-state pipeline.
 */

import { STAGE_ORDER } from "@/components/drawings/drawingsConfig";
import { derivedSetStage, submittalStatusToStage, isRRStatus, pickMostRecentSubmittal } from "@/lib/submittalStageMapping";

/** Manual upstream (pre-submittal) drafting states. */
export const DRAFTING_STATES = ["In Detailing", "Internal Review", "Ready to Submit"];

/** Manual downstream (post-fab) release states. */
export const RELEASE_STATES = ["Partially Released", "Released for Erection"];

/**
 * Full operational pipeline order (left = earliest). Splices the manual
 * drafting states before the canonical submittal STAGE_ORDER and the release
 * states after it. 'Superseded' is intentionally excluded (orthogonal).
 *   ["Not Started","In Detailing","Internal Review","Ready to Submit",
 *    "IFA","OFA","BFA","OFS","IFC","Released",
 *    "Partially Released","Released for Erection"]
 */
export const DETAILING_STATE_ORDER = [
  "Not Started",
  ...DRAFTING_STATES,
  ...STAGE_ORDER.filter((s) => s !== "Not Started"),
  ...RELEASE_STATES,
];

const DRAFTING_SET = new Set(DRAFTING_STATES);
const RELEASE_SET = new Set(RELEASE_STATES);

/** True if `state` is one of the manual drafting states. */
export function isDraftingState(state) {
  return DRAFTING_SET.has(state);
}

/** True if `state` is one of the manual release states. */
export function isReleaseState(state) {
  return RELEASE_SET.has(state);
}

/**
 * Does at least one non-deleted submittal carry a usable workflow signal?
 * Mirrors the `usable` filter inside derivedSetStage so "a submittal governs"
 * and "the derived stage" stay perfectly in sync.
 *
 * @param {Array} submittalsForSet
 * @returns {boolean}
 */
export function hasGoverningSubmittal(submittalsForSet) {
  return (Array.isArray(submittalsForSet) ? submittalsForSet : []).some(
    (s) => s && !s.is_deleted &&
      submittalStatusToStage(s.status, s.ball_in_court, s.approved_date) !== null,
  );
}

/**
 * The package's effective operational state.
 *
 * @param {{ detailing_state?: string|null }|null|undefined} pkg — the drawing_set row (null when the package has no parent set)
 * @param {Array} submittalsForSet — submittals whose drawing_set_ids includes the set
 * @param {Array} [sheetsForSet]   — drawings belonging to the set (legacy fallback)
 * @returns {string} a value in DETAILING_STATE_ORDER
 */
export function effectiveDetailingState(pkg, submittalsForSet, sheetsForSet = []) {
  const ds = pkg?.detailing_state || null;

  // 1. Release states are downstream of "Released for Fab" — they win outright.
  if (isReleaseState(ds)) return ds;

  // 2. If a submittal governs, it is the authority for the middle of the flow.
  if (hasGoverningSubmittal(submittalsForSet)) {
    return derivedSetStage(submittalsForSet, sheetsForSet);
  }

  // 3. No submittal yet — a manual drafting state takes over if set.
  if (isDraftingState(ds)) return ds;

  // 4. Fall back to the legacy sheet-derived stage (or "Not Started").
  return derivedSetStage(submittalsForSet, sheetsForSet);
}

/**
 * Orthogonal "Superseded" signal: true when the package has sheets and ALL of
 * them are superseded (a newer revision replaced the whole package). Surfaced
 * as a badge alongside the effective state, never folded into it.
 *
 * @param {Array} sheetsForSet — drawings belonging to the set
 * @returns {boolean}
 */
export function isPackageSuperseded(sheetsForSet) {
  const sheets = (Array.isArray(sheetsForSet) ? sheetsForSet : []).filter(
    (s) => s && !s.is_deleted,
  );
  return sheets.length > 0 && sheets.every((s) => s.is_superseded === true);
}

/**
 * Orthogonal "R&R" signal: true when the package's GOVERNING submittal (the
 * most-recent active one — the same submittal `derivedSetStage` maps) carries a
 * Revise-and-Resubmit / Rejected outcome.
 *
 * R&R deliberately rolls up to the IFA stage for counting (see
 * submittalStatusToStage), so without this flag an R&R loop-back is
 * indistinguishable from a fresh IFA on the board. Surfaced as a separate badge
 * alongside the effective state (like isPackageSuperseded), never folded into
 * it. Returns false once the governing submittal advances past R&R (e.g. it's
 * resubmitted, approved, or released).
 *
 * @param {Array} submittalsForSet
 * @returns {boolean}
 */
export function isPackageRR(submittalsForSet) {
  const usable = (Array.isArray(submittalsForSet) ? submittalsForSet : []).filter(
    (s) => s && !s.is_deleted &&
      submittalStatusToStage(s.status, s.ball_in_court, s.approved_date) !== null,
  );
  const governing = pickMostRecentSubmittal(usable);
  return !!governing && isRRStatus(governing.status);
}

/**
 * Sort comparator over DETAILING_STATE_ORDER (unknown states sort last).
 * @param {string} a
 * @param {string} b
 */
export function compareDetailingStates(a, b) {
  const ia = DETAILING_STATE_ORDER.indexOf(a);
  const ib = DETAILING_STATE_ORDER.indexOf(b);
  return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
}
