/**
 * submittalStageMapping.js — Pure helpers for translating between
 * submittal workflow status (the post-Sprint-2 source of truth) and the
 * drawing "stage" enum that the Drawings page UI still uses to colour
 * chevrons, KPI tiles, and group-header badges.
 *
 * No React, no Supabase, no side effects. All inputs are plain JS
 * objects, all outputs are strings or numbers.
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

/** BIC discriminator classes — used to split status buckets by ownership. */
const DETAILER_CLASS_BIC = new Set([
  "Detailer", "S&H", "Contractor", "Subcontractor",
]);
const APPROVER_CLASS_BIC = new Set(["EOR", "Architect", "AOR"]);
const DOWNSTREAM_CLASS_BIC = new Set(["GC", "Owner"]);

/** Match the .ts hook's terminal set so we never disagree on "open". */
const TERMINAL_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

/** Statuses that represent an R&R (loop-back) outcome. */
const RR_STATUSES = new Set(["Revise and Resubmit", "Rejected"]);

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
 * @param {string|null|undefined} status
 * @param {string|null|undefined} ball_in_court
 * @param {string|null|undefined} approved_date — ISO date or null (unused
 *   today; reserved for future OFS/IFC distinction by date-stamped events)
 * @returns {string|null}
 */
 
export function submittalStatusToStage(status, ball_in_court, approved_date) {
  if (!status) return null;
  if (status === "Void") return null;
  if (status === "Released for Fabrication") return "Released";

  // R&R loops back to IFA. Surface separately via isRRStatus() if you
  // want a dedicated badge.
  if (RR_STATUSES.has(status)) return "IFA";

  if (status === "Approved" || status === "Approved as Noted") {
    if (APPROVER_CLASS_BIC.has(ball_in_court)) return "BFA";
    if (DETAILER_CLASS_BIC.has(ball_in_court)) return "OFS";
    if (DOWNSTREAM_CLASS_BIC.has(ball_in_court)) return "IFC";
    // BIC missing/unknown — default to BFA (just-returned, not yet
    // routed onward). Better than guessing OFS or IFC and being wrong.
    return "BFA";
  }

  if (status === "Submitted" || status === "Under Review") {
    if (DETAILER_CLASS_BIC.has(ball_in_court)) return "IFA";
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
 *
 * @param {string} stage
 * @returns {{ status: string, ball_in_court: string|null }|null}
 */
export function stageToSubmittalStatus(stage) {
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
export function isRRStatus(status) {
  return RR_STATUSES.has(status);
}

/**
 * Pick the most-recently-touched submittal from an array. Sort key:
 *   1. submitted_date (desc, ISO sort)
 *   2. updated_at (desc)
 *   3. round_number (desc)
 *
 * Returns null on empty / null input.
 */
export function pickMostRecentSubmittal(submittals) {
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
 *
 * @param {Array} submittalsForSet — submittals whose drawing_set_ids
 *                                   includes the set id
 * @param {Array} [sheetsForSet]   — drawings belonging to the set
 * @returns {string} one of STAGE_ORDER
 */
export function derivedSetStage(submittalsForSet, sheetsForSet = []) {
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
 * Convenience: returns true when a stage is in the "active workflow"
 * range (anything that has left Not Started but isn't terminal).
 * Single source of truth shared with IN_REVIEW_STAGES in drawingsConfig.
 */
export function isStageInReview(stage) {
  return stage === "IFA" || stage === "OFA" || stage === "BFA" ||
         stage === "OFS" || stage === "IFC";
}

/** Re-export for tests / consumers that want the open/closed split. */
export { TERMINAL_STATUSES };
