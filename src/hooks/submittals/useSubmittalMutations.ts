import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { Update } from "@/api/supabaseClient";
import {
  applyOptimisticRowPatch,
  shouldRollbackOptimistic,
} from "@/lib/mutations/optimisticCache";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { runSubmittalStatusTriggers } from "@/lib/submittalSmartTriggers";
import { buildCreateSubmittalPayload } from "./payloads";
import type {
  CreateInput,
  Submittal,
  SubmittalMutationContext,
  UpdateInput,
} from "./types";

const runStatusTriggers = runSubmittalStatusTriggers as unknown as (args: {
  submittal: Partial<Submittal> | null | undefined;
  prevStatus?: string | null;
  nextStatus?: string | null;
}) => Promise<unknown>;

export function useSubmittalMutations({
  projectId,
  submittals,
  queryKey,
  invalidateAll,
}: SubmittalMutationContext) {
  const queryClient = useQueryClient();

  const createSubmittal = useMutation<Submittal, Error, CreateInput>({
    mutationFn: (data) =>
      entities.Submittal.create(
        buildCreateSubmittalPayload(data, projectId),
      ),
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Submittal created");
    },
    onError: (error) => {
      toast.error(
        `Failed to create submittal: ${toUserErrorMessage(error)}`,
      );
    },
  });

  const updateSubmittal = useMutation<
    Submittal,
    Error,
    UpdateInput,
    { previous: Submittal[] | undefined }
  >({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      const previousStatus =
        submittals.find((submittal) => submittal.id === id)?.status ?? null;
      const updated = await entities.Submittal.update(
        id,
        data as Update<"submittals">,
      );
      if (typeof data.status === "string") {
        await runStatusTriggers({
          submittal: updated,
          prevStatus: previousStatus,
          nextStatus: data.status,
        });
      }
      return updated;
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Submittal[]>(queryKey);
      queryClient.setQueryData<Submittal[]>(queryKey, (current) =>
        applyOptimisticRowPatch(
          current,
          variables.id,
          variables as Partial<Submittal>,
        ),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (shouldRollbackOptimistic(context?.previous)) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error(
        `Failed to update submittal: ${toUserErrorMessage(error)}`,
      );
    },
    onSettled: async () => {
      await invalidateAll();
    },
    onSuccess: () => {
      toast.success("Submittal updated");
    },
  });

  const deleteSubmittal = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await entities.Submittal.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Submittal deleted");
    },
    onError: (error) => {
      toast.error(
        `Failed to delete submittal: ${toUserErrorMessage(error)}`,
      );
    },
  });

  return {
    createSubmittal,
    updateSubmittal,
    deleteSubmittal,
  };
}
