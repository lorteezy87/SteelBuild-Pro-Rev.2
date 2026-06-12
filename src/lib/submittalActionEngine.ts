/**
 * submittalActionEngine.ts — the "what's the next move?" verb engine for a
 * submittal. Ported from the standalone Submittals app's stages.ts
 * (nextSubmittalAction) but expressed over SteelBuild Pro's canonical model:
 * Pro derives the workflow STAGE from (status, ball_in_court) rather than
 * storing an explicit stage/approval pair, so this delegates all stage logic
 * to submittalStageMapping.js (no duplication — CLAUDE.md §29 / §20).
 *
 * Canonical flow:  Not Started → IFA → OFA → BFA → OFS → IFC → Released
 * (R&R / Rejected loop back to IFA.)
 *
 * Pure: no React, no network, no clock.
 */
import {
  submittalStatusToStage,
  stageToSubmittalStatus,
  isRRStatus,
} from "@/lib/submittalStageMapping";
import {
  chainState,
  firstExternalStepIndex,
  ROUTING_STATUSES,
} from "@/lib/approvalChains";

export interface SubmittalLike {
  status?: string | null;
  ball_in_court?: string | null;
  approved_date?: string | null;
  /** Custom routing chain (approvalChains.js) — jsonb array of { party }. */
  approval_chain?: unknown;
  /** 0-based index of the chain step currently holding the ball. */
  approval_chain_step?: number | null;
}

export interface SubmittalAction {
  /** Button label, e.g. "Send for Approval (OFA)". */
  label: string;
  /** Status to set on the submittal (null when there's no forward move). */
  nextStatus: string | null;
  /** Ball-in-court to set (may be null). */
  nextBallInCourt: string | null;
  /** Stage the submittal moves INTO. */
  nextStage: string | null;
  /** Current derived stage. */
  currentStage: string;
  /** No forward action available (already released / void). */
  disabled: boolean;
  /** Current status is a done-terminal (Released for Fab / Void). */
  isTerminal: boolean;
  /** When the move follows a custom approval chain, the chain step index to
   * persist alongside the status/BIC patch. Absent for default-flow moves. */
  chainStepIndex?: number;
}

// "Done" terminals — nothing to advance to. (Approved/AAN are terminal for the
// approval *status* but still have forward workflow moves: scrub → IFC → release.)
const DONE_TERMINALS = new Set<string>(["Released for Fabrication", "Void"]);

/**
 * Compute the suggested next workflow move for a submittal.
 * Derives the current stage from (status, ball_in_court), picks the next stage
 * per the canonical flow + disposition, and maps that back to the
 * (status, ball_in_court) pair the caller should persist.
 */
export function nextSubmittalAction(submittal: SubmittalLike | null | undefined): SubmittalAction {
  const status = submittal?.status || "Draft";
  const bic = submittal?.ball_in_court ?? null;
  const currentStage = submittalStatusToStage(status, bic, submittal?.approved_date) || "Not Started";

  if (DONE_TERMINALS.has(status)) {
    return {
      label: status === "Void" ? "Voided" : "Released for Fab",
      nextStatus: null,
      nextBallInCourt: null,
      nextStage: currentStage,
      currentStage,
      disabled: true,
      isTerminal: true,
    };
  }

  // ── Custom approval chain (approvalChains.js) ─────────────────────────
  // While the submittal is routing for approval and a chain with remaining
  // steps exists, the next move hands the ball to the next party in the
  // chain instead of the single default OFA hop. Decisions (Approved / AAN /
  // R&R / Rejected) and the post-return flow (BFA → OFS → IFC → Released)
  // stay on the default path below.
  const chain = chainState(submittal);
  if (chain.steps) {
    if (ROUTING_STATUSES.has(status) && chain.stepIndex != null && !chain.atFinalStep) {
      const nextParty = chain.steps[chain.stepIndex + 1].party;
      const routedStage = submittalStatusToStage("Submitted", nextParty, null) || "OFA";
      return {
        label: `Route to ${nextParty} (${chain.stepIndex + 2}/${chain.steps.length})`,
        nextStatus: "Submitted",
        nextBallInCourt: nextParty,
        nextStage: routedStage,
        currentStage,
        disabled: false,
        isTerminal: false,
        chainStepIndex: chain.stepIndex + 1,
      };
    }
    // R&R / Rejected with a chain: the resubmit restarts at the first
    // outbound (non-detailing) hop of the route.
    if (isRRStatus(status)) {
      const restartIndex = firstExternalStepIndex(chain.steps);
      const restartParty = chain.steps[restartIndex].party;
      const restartStage = submittalStatusToStage("Submitted", restartParty, null) || "OFA";
      return {
        label: `Resubmit & route to ${restartParty}`,
        nextStatus: "Submitted",
        nextBallInCourt: restartParty,
        nextStage: restartStage,
        currentStage,
        disabled: false,
        isTerminal: false,
        chainStepIndex: restartIndex,
      };
    }
  }

  let nextStage: string;
  let label: string;
  switch (currentStage) {
    case "Not Started":
    case "IFA":
      // R&R/Rejected derive to IFA too — frame the move as a resubmit.
      nextStage = "OFA";
      label = isRRStatus(status) ? "Resubmit for Approval (OFA)" : "Send for Approval (OFA)";
      break;
    case "OFA":
      nextStage = "BFA";
      label = "Log Return (BFA)";
      break;
    case "BFA":
      if (status === "Approved") {
        nextStage = "IFC";
        label = "Issue for Construction (IFC)";
      } else {
        // Approved as Noted (or unknown disposition) → detailer scrub.
        nextStage = "OFS";
        label = "Send for Scrub (OFS)";
      }
      break;
    case "OFS":
      nextStage = "IFC";
      label = "Issue for Construction (IFC)";
      break;
    case "IFC":
      nextStage = "Released";
      label = "Release for Fabrication";
      break;
    default:
      nextStage = "OFA";
      label = "Send for Approval (OFA)";
  }

  const next = stageToSubmittalStatus(nextStage) || { status: null, ball_in_court: null };
  return {
    label,
    nextStatus: next.status,
    nextBallInCourt: next.ball_in_court,
    nextStage,
    currentStage,
    disabled: false,
    isTerminal: false,
  };
}
