import { entities } from "@/api/supabaseClient";
import { applySubmittalWorkflow, getSubmittalRevisionCoverage } from "@/api/client/submittalWorkflow";
import {
  evaluateCommentDispositionGate,
  type CommentDispositionLike,
} from "@/lib/commentDispositionGate";
import {
  FabReleaseBlockedError,
  isFabReleaseBlocked,
  parseBlockedRfiNumbers,
} from "@/lib/fabRelease/releaseStatus";
import {
  evaluateOfsIfcGate,
  evaluateOfsToOfaGate,
  evaluateSkipOfsReleaseGate,
} from "@/lib/ofsCompletionGate";
import { evaluateRrResubmitGate } from "@/lib/rrResubmitGate";
import { bumpRevision as nextRevision } from "@/lib/submittalRevision";
import { runSubmittalStatusTriggers } from "@/lib/submittalSmartTriggers";
import {
  CLOSED_SUBMITTAL_STATUSES,
  submittalStatusToStage,
} from "@/lib/submittalStageMapping";
import { validateSubmittalTransition } from "@/lib/submittalTransitions";
import { supabase } from "@/lib/supabase";
import { logTransition } from "@/services/auditLogger";
import { SENT_STATUSES } from "./constants";
import type {
  AddRoundInput,
  CurrentRoundLite,
  RoundWritePlan,
  Submittal,
} from "./types";

const runStatusTriggers = runSubmittalStatusTriggers as unknown as (args: {
  submittal: Partial<Submittal> | null | undefined;
  prevStatus?: string | null;
  nextStatus?: string | null;
}) => Promise<unknown>;

export function planRoundWrite(
  currentRound: CurrentRoundLite | null | undefined,
  status: string,
): RoundWritePlan {
  const current = currentRound || null;
  const isOpen = !!current && !current.returned_date;
  const currentNumber = Number(current?.round_number) || 0;

  if (SENT_STATUSES.has(status)) {
    if (isOpen) {
      return {
        action: "update",
        roundId: current!.id,
        roundNumber: currentNumber,
        setSubmitted: !current!.submitted_date,
        setReturned: false,
      };
    }
    return {
      action: "insert",
      roundId: null,
      roundNumber: currentNumber + 1,
      setSubmitted: true,
      setReturned: false,
    };
  }
  if (isOpen) {
    return {
      action: "update",
      roundId: current!.id,
      roundNumber: currentNumber,
      setSubmitted: false,
      setReturned: true,
    };
  }
  return {
    action: "insert",
    roundId: null,
    roundNumber: currentNumber + 1,
    setSubmitted: true,
    setReturned: true,
  };
}

export async function addSubmittalRound(
  input: AddRoundInput,
): Promise<Submittal> {
  const submittal = input.submittal;
  const fabOverride =
    (input.fabReleaseOverrideReason || "").trim() || null;
  const isFabRelease = input.status === "Released for Fabrication";

  const transition = validateSubmittalTransition(
    submittal.status,
    input.status,
  );
  if (transition.ok === false) {
    throw new Error(transition.reason);
  }

  if (isFabRelease && !fabOverride) {
    const callRpc = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: Array<{ rfi_number?: string }> | null;
      error: { message?: string } | null;
    }>;
    const { data: blocking, error: gateError } = await callRpc(
      "submittal_blocking_rfis",
      { p_submittal_id: submittal.id },
    );
    if (!gateError && Array.isArray(blocking) && blocking.length > 0) {
      const numbers = blocking
        .map((row) => row?.rfi_number)
        .filter(Boolean) as string[];
      throw new FabReleaseBlockedError(
        `FAB_RELEASE_BLOCKED: ${numbers.length} open RFI(s) reference sheets in this submittal's package (${numbers.join(", ")}). Resolve them or release with an override reason.`,
        numbers,
      );
    }
  }

  const cycleRevision: string | null = input.revision?.trim() || (input.bumpTextRevision
    ? nextRevision(
        input.currentRevision ?? submittal.revision ?? null,
      )
    : typeof submittal.revision === "string" &&
        submittal.revision.trim()
      ? submittal.revision.trim()
      : null);

  const rrGate = evaluateRrResubmitGate({
    priorStatus: submittal.status,
    nextStatus: input.status,
    submittedDate: input.submitted_date ?? null,
    recipient: input.ball_in_court ?? null,
    revision: cycleRevision,
    priorCycleRevision: input.currentRevision ?? submittal.revision ?? null,
  });
  if (rrGate.ok === false) {
    throw new Error(rrGate.reason);
  }

  const ofsOverride =
    (
      input.ofsOverrideReason ||
      input.fabReleaseOverrideReason ||
      ""
    ).trim() || null;
  const derivedNextStage =
    input.nextStage ??
    submittalStatusToStage(
      input.status,
      input.ball_in_court ?? null,
      null,
    );
  const ofsToOfa = evaluateOfsToOfaGate({
    priorStatus: submittal.status,
    priorBallInCourt: submittal.ball_in_court,
    nextStatus: input.status,
    overrideReason: ofsOverride,
  });
  if (ofsToOfa.ok === false) {
    throw new Error(ofsToOfa.reason);
  }
  const ofsIfc = evaluateOfsIfcGate({
    priorStatus: submittal.status,
    priorBallInCourt: submittal.ball_in_court,
    nextStage: derivedNextStage,
    checklist: input.ofsChecklist,
    overrideReason: ofsOverride,
  });
  if (ofsIfc.ok === false) {
    throw new Error(ofsIfc.reason);
  }
  const skipOfs = evaluateSkipOfsReleaseGate({
    priorStatus: submittal.status,
    priorBallInCourt: submittal.ball_in_court,
    nextStatus: input.status,
    overrideReason: ofsOverride,
  });
  if (skipOfs.ok === false) {
    throw new Error(skipOfs.reason);
  }

  const priorStageForComments = submittalStatusToStage(
    submittal.status,
    submittal.ball_in_court,
    null,
  );
  let dispositions = input.commentDispositions ?? null;
  const needsCommentGate =
    (derivedNextStage === "IFC" &&
      priorStageForComments === "OFS") ||
    (["Revise and Resubmit", "Rejected"].includes(
      String(submittal.status ?? ""),
    ) &&
      ["Submitted", "Under Review"].includes(input.status));
  if (needsCommentGate && dispositions == null) {
    try {
      dispositions =
        (await entities.SubmittalCommentDisposition.filter({
          submittal_id: submittal.id,
        })) as CommentDispositionLike[];
    } catch {
      dispositions = [];
    }
  }
  if (needsCommentGate) {
    const commentOverride =
      (
        input.commentOverrideReason ||
        ofsOverride ||
        ""
      ).trim() || null;
    const ofsCommentGate = evaluateCommentDispositionGate({
      kind: "ofs_to_ifc",
      dispositions,
      nextStage: derivedNextStage,
      priorStage: priorStageForComments,
      overrideReason: commentOverride,
    });
    if (ofsCommentGate.ok === false) {
      throw new Error(ofsCommentGate.reason);
    }
    const rrCommentGate = evaluateCommentDispositionGate({
      kind: "rr_to_ofa",
      dispositions,
      nextStatus: input.status,
      priorStatus: submittal.status,
      overrideReason: commentOverride,
    });
    if (rrCommentGate.ok === false) {
      throw new Error(rrCommentGate.reason);
    }
  }

  const patch: Record<string, unknown> = {
    status: input.status,
    ball_in_court: CLOSED_SUBMITTAL_STATUSES.has(input.status)
      ? null
      : input.ball_in_court ?? null,
    response_notes: input.notes ?? null,
    ...(input.extraPatch || {}),
  };
  if (input.commentOverrideReason?.trim()) patch.gate_override_reason = input.commentOverrideReason.trim();
  // Preserve the user's reviewed payload on a lost-response retry. Reading the
  // latest round here would change these fields after the first commit, making
  // the retry a different request instead of replaying the atomic receipt.
  if (input.submitted_date) {
    patch.submitted_date = input.submitted_date;
  }
  if (input.returned_date) {
    patch.returned_date = input.returned_date;
  }
  if (input.bumpTextRevision || input.revision?.trim()) {
    patch.revision = cycleRevision;
  }
  if (isFabRelease) {
    patch.fab_release_override_reason = fabOverride;
  }
  if (
    derivedNextStage === "IFC" &&
    (input.ofsChecklist || ofsOverride)
  ) {
    patch.metadata = {
      ofs_checklist: input.ofsChecklist ?? null,
      workflow_substatus: "ifc_issued",
      ...(ofsOverride
        ? { ofs_override_reason: ofsOverride }
        : {}),
    };
  }

  let updated: unknown;
  try {
    const shopDrawing = (submittal.submittal_type ?? 'Shop Drawing') === 'Shop Drawing';
    const coverage = !shopDrawing || input.revisionIds ? null : submittal.revision_coverage ?? await getSubmittalRevisionCoverage(submittal.id);
    const result = await applySubmittalWorkflow({
      review: submittal,
      revisionIds: shopDrawing ? input.revisionIds ?? coverage?.current_revision_ids ?? [] : [],
      patch,
      newRound: input.newRound ?? false,
      requestId: input.requestId,
    });
    updated = result.submittal;
  } catch (error) {
    if (isFabReleaseBlocked(error)) {
      const message =
        (error as { message?: string })?.message ||
        "Fab release blocked by open RFIs";
      throw new FabReleaseBlockedError(
        message,
        parseBlockedRfiNumbers(message),
      );
    }
    throw error;
  }

  await runStatusTriggers({
    submittal:
      (updated as Partial<Submittal>) ||
      (submittal as Partial<Submittal>),
    prevStatus: submittal.status ?? null,
    nextStatus: input.status,
  });
  await logTransition(
    "submittal",
    (updated as Submittal) || submittal,
    submittal.status ?? "—",
    input.status,
    { projectId: submittal.project_id },
  );
  return updated as Submittal;
}
