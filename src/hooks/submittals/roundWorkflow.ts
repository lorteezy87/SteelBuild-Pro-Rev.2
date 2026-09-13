import { entities } from "@/api/supabaseClient";
import type { Insert, Update } from "@/api/supabaseClient";
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
import { roundRevision } from "@/lib/submittalCycles";
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

  const existing = (await entities.SubmittalRound.filter(
    { submittal_id: submittal.id },
    "-round_number",
    1,
  )) as unknown as CurrentRoundLite[] | null;
  const currentRound =
    (Array.isArray(existing) ? existing[0] : null) || null;
  const plan = planRoundWrite(currentRound, input.status);

  const cycleRevision: string | null = input.bumpTextRevision
    ? nextRevision(
        input.currentRevision ?? submittal.revision ?? null,
      )
    : typeof submittal.revision === "string" &&
        submittal.revision.trim()
      ? submittal.revision.trim()
      : null;

  const rrGate = evaluateRrResubmitGate({
    priorStatus: submittal.status,
    nextStatus: input.status,
    submittedDate: input.submitted_date ?? null,
    recipient: input.ball_in_court ?? null,
    revision: cycleRevision,
    priorCycleRevision: roundRevision(currentRound),
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

  let round: { id?: string } | null;
  if (plan.action === "update" && plan.roundId) {
    const update: Record<string, unknown> = {
      status: input.status,
      ball_in_court: input.ball_in_court ?? null,
    };
    if (plan.setSubmitted && input.submitted_date) {
      update.submitted_date = input.submitted_date;
    }
    if (plan.setReturned) {
      update.returned_date = input.returned_date ?? null;
    }
    if (input.notes) update.response_notes = input.notes;
    round = await entities.SubmittalRound.update(
      plan.roundId,
      update as Update<"submittal_rounds">,
    );
  } else {
    round = await entities.SubmittalRound.create({
      project_id: submittal.project_id,
      submittal_id: submittal.id,
      round_number: plan.roundNumber,
      status: input.status,
      ball_in_court: input.ball_in_court ?? null,
      submitted_date: plan.setSubmitted
        ? input.submitted_date ?? submittal.submitted_date ?? null
        : null,
      returned_date: plan.setReturned
        ? input.returned_date ?? null
        : null,
      response_notes: input.notes ?? null,
      drawing_set_ids: Array.isArray(submittal.drawing_set_ids)
        ? submittal.drawing_set_ids
        : [],
      metadata: cycleRevision ? { revision: cycleRevision } : {},
    } as Insert<"submittal_rounds">);
  }

  const patch: Record<string, unknown> = {
    status: input.status,
    ball_in_court: CLOSED_SUBMITTAL_STATUSES.has(input.status)
      ? null
      : input.ball_in_court ?? null,
    current_round_id: round?.id,
    total_rounds: plan.roundNumber,
    ...(input.extraPatch || {}),
  };
  if (input.submitted_date && plan.setSubmitted) {
    patch.submitted_date = input.submitted_date;
  }
  if (input.returned_date && plan.setReturned) {
    patch.returned_date = input.returned_date;
  }
  if (input.bumpRevision) {
    patch.round_number =
      (Number(submittal.round_number) || 1) + 1;
  }
  if (input.bumpTextRevision) {
    patch.revision = cycleRevision;
  }
  if (isFabRelease) {
    patch.fab_release_override_reason = fabOverride;
  }
  if (
    derivedNextStage === "IFC" &&
    (input.ofsChecklist || ofsOverride)
  ) {
    const priorMetadata =
      submittal.metadata &&
      typeof submittal.metadata === "object" &&
      !Array.isArray(submittal.metadata)
        ? { ...submittal.metadata }
        : {};
    patch.metadata = {
      ...priorMetadata,
      ofs_checklist:
        input.ofsChecklist ??
        priorMetadata.ofs_checklist ??
        null,
      workflow_substatus: "ifc_issued",
      ...(ofsOverride
        ? { ofs_override_reason: ofsOverride }
        : {}),
    };
  }

  let updated: unknown;
  try {
    updated = await entities.Submittal.update(
      submittal.id,
      patch as Update<"submittals">,
    );
  } catch (error) {
    try {
      if (plan.action === "insert" && round?.id) {
        await entities.SubmittalRound.delete(round.id);
      } else if (
        plan.action === "update" &&
        currentRound?.id
      ) {
        await entities.SubmittalRound.update(
          currentRound.id,
          {
            status: currentRound.status ?? null,
            ball_in_court:
              currentRound.ball_in_court ?? null,
            returned_date:
              currentRound.returned_date ?? null,
          } as Update<"submittal_rounds">,
        );
      }
    } catch {
      // Preserve the original write failure.
    }
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
