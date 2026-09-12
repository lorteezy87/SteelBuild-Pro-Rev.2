import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { Update } from "@/api/supabaseClient";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import {
  buildCreateRoundPayload,
  buildRoundParentPatch,
} from "./payloads";
import type {
  CreateRoundInput,
  SubmittalMutationContext,
  SubmittalRound,
  UpdateRoundInput,
} from "./types";

type RoundMutationContext = Pick<
  SubmittalMutationContext,
  "projectId" | "invalidateAll"
>;

export function useSubmittalRoundMutations({
  projectId,
  invalidateAll,
}: RoundMutationContext) {
  const createRound = useMutation<
    SubmittalRound,
    Error,
    CreateRoundInput
  >({
    mutationFn: async (data) => {
      const round = await entities.SubmittalRound.create(
        buildCreateRoundPayload(data, projectId),
      );
      if (round?.id && data.submittal_id) {
        await entities.Submittal.update(
          data.submittal_id as string,
          buildRoundParentPatch(data, round.id),
        );
      }
      return round;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Round created");
    },
    onError: (error) => {
      toast.error(`Failed to create round: ${toUserErrorMessage(error)}`);
    },
  });

  const updateRound = useMutation<
    SubmittalRound,
    Error,
    UpdateRoundInput
  >({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      return entities.SubmittalRound.update(
        id,
        data as Update<"submittal_rounds">,
      );
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Round updated");
    },
    onError: (error) => {
      toast.error(`Failed to update round: ${toUserErrorMessage(error)}`);
    },
  });

  return { createRound, updateRound };
}
