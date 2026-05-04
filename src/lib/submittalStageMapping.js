/**
 * submittalStageMapping.js — Pure helpers for translating between
 * submittal workflow status (the post-Sprint-2 source of truth) and the
 * drawing "stage" enum that the Drawings page UI still uses to colour
 * chevrons, KPI tiles, and group-header badges.
 *
 * No React, no Supabase, no side effects. All inputs are plain JS
 * objects, all outputs are strings or numbers. Lives next to
 * submittalAnalytics.js so the Drawings page can read display-only
 * workflow state without touching the .ts hook.
 *
 * Canonical mapping (kept in sync with
 * `submittalPipelineRollupFromSubmittals` in projectMetrics.js):
 *
 *   Not Started  → no submittal exists yet (or status === "Draft" with
 *                  no other signal)
 *   OFA          → Submitted / Under Review · BIC = EOR
 *   BFA          → Revise and Resubmit / Rejected
 *   OFS          → Submitted / Under Review · BIC = anyone other than
 *                  EOR (typically GC / Owner during in-house QA)
 *   BFS          → Approved as Noted
 *   FFF (IFC)    → Approved · no approved_date yet
 *   Released     → Released for Fabrication, OR Approved with an
 *                  approved_date set
 *
 * Void submittals are explicitly NOT mapped — they're terminal-dead
 * and shouldn't drive stage display.
 */

import { STAGE_ORDER } from "@/components/drawings/drawingsConfig";

/** Match the .ts hook's terminal set so we never disagree on "open". */
const TERMINAL_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

/**
 * Map a single submittal's (status, ball_in_court, approved_date) to a
 * canonical drawing stage. Returns one of STAGE_ORDER, or null when the
 * submittal carries no usable signal (e.g. status === "Void", or an
 * unrecognised status string).
 *
 * @param {string|null|undefined} status
 * @param {string|null|undefined} ball_in_court
 * @param {string|null|undefined} approved_date — ISO date or null
 * @returns {string|null}
 */
export function submittalStatusToStage(status, ball_in_court, approved_date) {
  if (!status) return null;
  if (status === "Void") return null;
  if (status === "Released for Fabrication") return "Released";
  if (status === "Approved") return approved_date ? "Released" : "FFF";
  if (status === "Approved as Noted") return "BFS";
  if (status === "Revise and Resubmit" || status === "Rejected") return "BFA";
  if (status === "Submitted" || status === "Under Review") {
    return ball_in_court === "EOR" ? "OFA" : "OFS";
  }
  if (status === "Draft") return "Not Started";
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
 *
 * @param {string} stage
 * @returns {{ status: string, ball_in_court: string|null, approved_date_required: boolean }|null}
 */
export function stageToSubmittalStatus(stage) {
  switch (stage) {
    case "Not Started":
      // Caller decides: leave the set without a submittal, or create a
      // Draft. We return Draft so callers that want a row get one.
      return { status: "Draft", ball_in_court: "EOR", approved_date_required: false };
    case "OFA":
      return { status: "Submitted",          ball_in_court: "EOR",      approved_date_required: false };
    case "BFA":
      return { status: "Revise and Resubmit", ball_in_court: "Detailer", approved_date_required: false };
    case "OFS":
      return { status: "Submitted",          ball_in_court: "GC",       approved_date_required: false };
    case "BFS":
      return { status: "Approved as Noted",  ball_in_court: "Detailer", approved_date_required: false };
    case "FFF":
      return { status: "Approved",           ball_in_court: null,       approved_date_required: false };
    case "Released":
      return { status: "Released for Fabrication", ball_in_court: null, approved_date_required: false };
    default:
      return null;
  }
}

/**
 * Pick the most-recently-touched submittal from an array. Sort key:
 *   1. submitted_date (desc, ISO sort)
 *   2. updated_at (desc)
 *   3. round_number (desc)
 *
 * `null` returns the same sentinel as an empty list.
 */
export function pickMostRecentSubmittal(submittals) {
  if (!Array.isArray(submittals) || submittals.length === 0) return null;
  // Filter soft-deletes before sorting.
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
 *
 * @param {Array} submittalsForSet — submittals whose drawing_set_ids
 *                                   includes the set id
 * @param {Array} [sheetsForSet]   — drawings belonging to the set
 * @returns {string} one of STAGE_ORDER
 */
export function derivedSetStage(submittalsForSet, sheetsForSet = []) {
  // Filter out Voided/unmapped submittals before picking the most-recent
  // one — otherwise a stray Void at the top of the sort hides the
  // active workflow status.
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
  // Fallback — dominant stage across the set's sheets.
  if (Array.isArray(sheetsForSet) && sheetsForSet.length > 0) {
    return dominantStage(sheetsForSet.map((s) => s?.stage));
  }
  return "Not Started";
}

/**
 * Pick the dominant (most-common, ties → earliest in canonical order)
 * stage from a list of stage strings. Unknown / falsy entries are
 * dropped. Returns "Not Started" when the list is empty.
 *
 * Mirrors the `pickDominantStage` helper in projectMetrics.js but
 * exported so the new mapping module is self-contained.
 *
 * @param {Array<string|null|undefined>} stages
 */
export function dominantStage(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return "Not Started";
  const counts = new Map();
  for (const s of stages) {
    if (!s || !STAGE_ORDER.includes(s)) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  if (counts.size === 0) return "Not Started";
  let bestKey = null;
  let bestCount = -1;
  for (const key of STAGE_ORDER) {
    const c = counts.get(key) || 0;
    if (c > bestCount) {
      bestKey = key;
      bestCount = c;
    }
  }
  return bestKey || "Not Started";
}

/**
 * Convenience: return whether a set's submittal-derived stage is in the
 * "active workflow" range (anything between OFA and BFS inclusive).
 * Used by the IN REVIEW KPI tile when the page wants to count packages
 * by submittal status rather than sheet.stage.
 */
export function isStageInReview(stage) {
  return stage === "OFA" || stage === "BFA" || stage === "OFS" || stage === "BFS" || stage === "FFF";
}

/** Re-export for tests / consumers that want the open/closed split. */
export { TERMINAL_STATUSES };
