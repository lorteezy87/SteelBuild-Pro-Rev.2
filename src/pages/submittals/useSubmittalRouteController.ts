import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { addSubmittalRound } from "@/hooks/useSubmittals";
import type { CommentDispositionStatus } from "@/lib/commentDispositionGate";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { localToday } from "@/utils/dates";
import { toast } from "sonner";
import {
  buildStatusChangeWrite,
  buildVerbCtaAdvanceInput,
  type SubmittalAdvanceSubject,
} from "./submittalAdvanceHelpers";
import type { SubmittalDetailProps } from "./SubmittalDetail";
import type { SubmittalCommentDispositionRecord } from "./useSubmittalsPageQueries";
import type { PendingStatusSuggest } from "./useSubmittalsPageState";
import type { Submittal, SubmittalRoundRecord } from "./types";

type AdvanceAction = Parameters<NonNullable<SubmittalDetailProps["onAdvance"]>>[0];

interface CommentDraft {
  comment_number: string;
  source: string;
  location: string;
  comment_text: string;
  is_required: boolean;
}

function errorMessage(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "message" in error
    && typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

export function useSubmittalRouteController(args: {
  projectId: string | undefined;
  selected: Submittal | null;
  rounds: SubmittalRoundRecord[];
  commentDispositions: SubmittalCommentDispositionRecord[];
  revisionAutoBump: boolean;
  workdayDuesEnabled: boolean;
  projectMeta: unknown;
  pendingSuggestRef: React.MutableRefObject<PendingStatusSuggest | null>;
  update: (patch: { id: string; [key: string]: unknown }) => void;
  runAdvance: (input: Parameters<typeof addSubmittalRound>[0]) => void;
}) {
  const {
    projectId,
    selected,
    rounds,
    commentDispositions,
    revisionAutoBump,
    workdayDuesEnabled,
    projectMeta,
    pendingSuggestRef,
    update,
    runAdvance,
  } = args;
  const queryClient = useQueryClient();

  const invalidateCommentDispositions = useCallback(
    () => queryClient.invalidateQueries({
      queryKey: ["comment-dispositions", projectId],
    }),
    [projectId, queryClient],
  );

  const onStatusChange = useCallback((status: string) => {
    if (!selected?.id) return;
    const subject = selected as SubmittalAdvanceSubject;
    pendingSuggestRef.current = {
      id: selected.id,
      before: selected,
      nextStatus: status,
    };
    const write = buildStatusChangeWrite({
      selected: subject,
      status,
      today: localToday(),
      revisionAutoBump,
      workdayDuesEnabled,
      projectMeta,
    });
    if (write.kind === "advance") runAdvance(write.input);
    else if (write.kind === "update") update(write.patch);
  }, [
    pendingSuggestRef,
    projectMeta,
    revisionAutoBump,
    runAdvance,
    selected,
    update,
    workdayDuesEnabled,
  ]);

  const onAdvance = useCallback((action: AdvanceAction) => {
    if (!selected?.id) return;
    const subject = selected as SubmittalAdvanceSubject;
    pendingSuggestRef.current = action.nextStatus
      ? { id: selected.id, before: selected, nextStatus: action.nextStatus }
      : null;
    const input = buildVerbCtaAdvanceInput({
      selected: subject,
      action,
      today: localToday(),
      revisionAutoBump,
      workdayDuesEnabled,
      projectMeta,
      commentDispositions,
    });
    if (input) runAdvance(input);
  }, [
    commentDispositions,
    pendingSuggestRef,
    projectMeta,
    revisionAutoBump,
    runAdvance,
    selected,
    workdayDuesEnabled,
  ]);

  const onCommentDispositionAdd = useCallback(async (draft: CommentDraft) => {
    if (!selected?.id || !selected.project_id) return;
    const roundId = rounds.at(-1)?.id;
    if (!roundId) {
      toast.error("Add an approval cycle before tracking returned comments.");
      return;
    }
    try {
      await entities.SubmittalCommentDisposition.create(
        withProjectId({
          submittal_id: selected.id,
          submittal_round_id: roundId,
          comment_number: draft.comment_number,
          source: draft.source,
          location: draft.location || null,
          comment_text: draft.comment_text,
          is_required: draft.is_required,
          status: "Unreviewed",
        }, selected.project_id || projectId),
      );
      await invalidateCommentDispositions();
      toast.success("Returned comment added");
    } catch (error) {
      toast.error(`Could not add comment: ${toUserErrorMessage(error)}`);
    }
  }, [invalidateCommentDispositions, projectId, rounds, selected]);

  const onCommentDispositionStatus = useCallback(async (
    id: string,
    status: CommentDispositionStatus,
  ) => {
    try {
      const patch: Record<string, unknown> = { status };
      if (
        status === "Complete"
        || status === "Incorporated"
        || status === "Not Applicable"
      ) {
        patch.completed_at = new Date().toISOString();
      }
      await entities.SubmittalCommentDisposition.update(id, patch);
      await invalidateCommentDispositions();
    } catch (error) {
      toast.error(`Could not update disposition: ${errorMessage(error)}`);
    }
  }, [invalidateCommentDispositions]);

  const onCommentDispositionResolution = useCallback(async (
    id: string,
    resolution: string,
  ) => {
    try {
      await entities.SubmittalCommentDisposition.update(id, { resolution });
      await invalidateCommentDispositions();
    } catch (error) {
      toast.error(`Could not save resolution: ${errorMessage(error)}`);
    }
  }, [invalidateCommentDispositions]);

  return {
    onStatusChange,
    onAdvance,
    onCommentDispositionAdd,
    onCommentDispositionStatus,
    onCommentDispositionResolution,
  };
}
