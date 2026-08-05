/**
 * Pure builders for Submittals page status/advance writes and New Round seeding.
 * Keep React Query / toast / entities out of this module.
 */

import type { AddRoundInput } from "@/hooks/useSubmittals";
import { CLOSED_SUBMITTAL_STATUSES, submittalStatusToStage } from "@/lib/submittalStageMapping";
import { shouldBumpRevisionOnResubmit } from "@/lib/submittalRevision";
import { decideWorkdayDue } from "@/lib/submittalWorkdayDue";
import {
  collectOpenItems,
  pickCarryForwardResponses,
  formatCarryForwardNotes,
  mergeCarryForwardNotes,
  type OpenItem,
  type RoundLike,
  type SheetResponse,
} from "@/lib/submittalResubmittal";
import {
  collectUnresolvedRequiredComments,
  formatUnresolvedCommentNotes,
  type CommentDispositionLike,
} from "@/lib/commentDispositionGate";

/** Disposition row as stored on the page (includes submittal scope). */
export type ScopedCommentDisposition = CommentDispositionLike & {
  submittal_id?: string | null;
};

/** Verdict statuses that close a submit→return cycle via the audited round path. */
export const STATUS_CHANGE_VERDICTS = [
  "Approved",
  "Approved as Noted",
  "Revise and Resubmit",
  "Rejected",
  "Released for Fabrication",
] as const;

export type SubmittalAdvanceSubject = AddRoundInput["submittal"] & {
  status?: string | null;
  ball_in_court?: string | null;
  approved_date?: string | null;
  submitted_date?: string | null;
  required_date?: string | null;
  revision?: string | null;
};

export type StatusChangeWrite =
  | { kind: "noop" }
  | { kind: "advance"; input: AddRoundInput }
  | { kind: "update"; patch: { id: string; [key: string]: unknown } };

/**
 * Decide how an inline status change should write — audited advance for
 * send/verdict moves, plain update for Draft/Void-style edits, noop on no-op.
 */
export function buildStatusChangeWrite(args: {
  selected: SubmittalAdvanceSubject;
  status: string;
  today: string;
  revisionAutoBump: boolean;
  workdayDuesEnabled: boolean;
  projectMeta: unknown;
}): StatusChangeWrite {
  const { selected, status, today, revisionAutoBump, workdayDuesEnabled, projectMeta } = args;
  if (!selected || status === selected.status) return { kind: "noop" };

  const isVerdict = (STATUS_CHANGE_VERDICTS as readonly string[]).includes(status);
  const isSent = status === "Submitted" || status === "Under Review";

  if (isVerdict || isSent) {
    const bumpTextRevision =
      isSent && shouldBumpRevisionOnResubmit(selected.status, revisionAutoBump);
    const nextStage = submittalStatusToStage(
      status,
      selected.ball_in_court ?? null,
      selected.approved_date ?? null,
    );
    const workdayDue = decideWorkdayDue({
      stage: nextStage,
      currentRequiredDate: selected.required_date ?? null,
      today,
      flagEnabled: workdayDuesEnabled,
      projectMeta: projectMeta as Record<string, unknown> | null,
    });
    return {
      kind: "advance",
      input: {
        submittal: selected,
        status,
        ball_in_court: selected.ball_in_court ?? null,
        submitted_date: isSent ? today : (selected.submitted_date ?? undefined),
        returned_date: isVerdict ? today : undefined,
        bumpTextRevision,
        currentRevision: selected.revision ?? null,
        extraPatch: workdayDue.requiredDate
          ? { required_date: workdayDue.requiredDate }
          : undefined,
      },
    };
  }

  const patch: { id: string; [key: string]: unknown } = { id: selected.id, status };
  if (CLOSED_SUBMITTAL_STATUSES.has(status)) patch.ball_in_court = null;
  return { kind: "update", patch };
}

export type VerbCtaAction = {
  nextStatus?: string | null;
  nextBallInCourt?: string | null;
  nextStage?: string | null;
  chainStepIndex?: number | null;
  ofsChecklist?: AddRoundInput["ofsChecklist"];
  ofsOverrideReason?: string | null;
  commentOverrideReason?: string | null;
};

/**
 * Build the audited advance input for a verb CTA (stage-chip) advance.
 * Returns null when the action has no nextStatus (caller should no-op).
 */
export function buildVerbCtaAdvanceInput(args: {
  selected: SubmittalAdvanceSubject;
  action: VerbCtaAction;
  today: string;
  revisionAutoBump: boolean;
  workdayDuesEnabled: boolean;
  projectMeta: unknown;
  commentDispositions: ScopedCommentDisposition[];
}): AddRoundInput | null {
  const {
    selected,
    action,
    today,
    revisionAutoBump,
    workdayDuesEnabled,
    projectMeta,
    commentDispositions,
  } = args;
  if (!selected || !action.nextStatus) return null;

  const isResubmit = ["Revise and Resubmit", "Rejected"].includes(String(selected.status));
  const stampSubmitted =
    action.nextStage === "OFA" && (isResubmit || !selected.submitted_date);
  const bumpTextRevision =
    action.nextStage === "OFA" &&
    shouldBumpRevisionOnResubmit(selected.status, revisionAutoBump);
  const workdayDue = decideWorkdayDue({
    stage: action.nextStage,
    currentRequiredDate: selected.required_date ?? null,
    today,
    flagEnabled: workdayDuesEnabled,
    projectMeta: projectMeta as Record<string, unknown> | null,
  });
  const extraPatch: Record<string, unknown> = {};
  if (action.chainStepIndex != null) extraPatch.approval_chain_step = action.chainStepIndex;
  if (workdayDue.requiredDate) extraPatch.required_date = workdayDue.requiredDate;

  return {
    submittal: selected,
    status: action.nextStatus,
    ball_in_court: action.nextBallInCourt,
    submitted_date: stampSubmitted ? today : undefined,
    returned_date: action.nextStage === "BFA" ? today : undefined,
    bumpTextRevision,
    currentRevision: selected.revision ?? null,
    nextStage: action.nextStage ?? undefined,
    ofsChecklist: action.ofsChecklist ?? undefined,
    ofsOverrideReason: action.ofsOverrideReason ?? undefined,
    commentOverrideReason: action.commentOverrideReason ?? undefined,
    commentDispositions,
    extraPatch: Object.keys(extraPatch).length ? extraPatch : undefined,
  };
}

export type NewRoundCarrySeed = {
  previousRound: RoundLike | null;
  carryItems: OpenItem[];
  carryFromRound: number | null;
  seededNotes: string;
};

/** Seed New Round modal from prior sheet responses + unresolved required comments. */
export function buildNewRoundCarrySeed(args: {
  submittalId: string;
  submittalRounds: RoundLike[];
  allSheetResponses: SheetResponse[];
  allCommentDispositions: ScopedCommentDisposition[];
}): NewRoundCarrySeed {
  const { submittalId, submittalRounds, allSheetResponses, allCommentDispositions } = args;
  const previousRound = submittalRounds.length > 0 ? (submittalRounds.at(-1) ?? null) : null;
  const carry = pickCarryForwardResponses(submittalRounds, allSheetResponses);
  const carryItems = collectOpenItems(carry.responses);
  const carryFromRound = carry.round?.round_number ?? null;
  const sheetNotes = formatCarryForwardNotes(carryFromRound, carryItems);
  const openDispositions = collectUnresolvedRequiredComments(
    allCommentDispositions.filter((d) => d.submittal_id === submittalId),
  );
  const seededNotes = mergeCarryForwardNotes(
    sheetNotes,
    formatUnresolvedCommentNotes(openDispositions),
  );
  return { previousRound, carryItems, carryFromRound, seededNotes };
}
