/**
 * Compatibility facade for Submittal + Round CRUD.
 *
 * Consumers keep one public hook while query, mutation, payload, and audited
 * workflow responsibilities live in focused typed modules.
 */

import { useQueryClient } from "@tanstack/react-query";
import { invalidateEntities } from "@/services/cacheRegistry";
import { useSubmittalBulkMutations } from "./submittals/useSubmittalBulkMutations";
import { useSubmittalMutations } from "./submittals/useSubmittalMutations";
import { useSubmittalQueries } from "./submittals/useSubmittalQueries";
import { useSubmittalRoundMutations } from "./submittals/useSubmittalRoundMutations";

export {
  OPEN_STATUSES,
  SENT_STATUSES,
  SUBMITTAL_STATUSES,
  TERMINAL_APPROVED_STATUSES,
  TERMINAL_STATUSES,
} from "./submittals/constants";
export {
  addSubmittalRound,
  planRoundWrite,
} from "./submittals/roundWorkflow";
export type {
  AddRoundInput,
  CurrentRoundLite,
  RoundWritePlan,
  Submittal,
  SubmittalRound,
} from "./submittals/types";

export function useSubmittals(
  projectId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const queryState = useSubmittalQueries(projectId);

  const invalidateAll = async () => {
    await invalidateEntities(
      queryClient,
      [
        "submittal",
        "submittal_round",
        "submittal_activity",
        "drawing",
        "action_item",
      ],
      projectId,
    );
  };

  const singleMutations = useSubmittalMutations({
    projectId,
    submittals: queryState.submittals,
    queryKey: queryState.queryKey,
    invalidateAll,
  });
  const roundMutations = useSubmittalRoundMutations({
    projectId,
    invalidateAll,
  });
  const bulkMutations = useSubmittalBulkMutations({
    invalidateAll,
  });

  return {
    submittals: queryState.submittals,
    rounds: queryState.rounds,
    roundsBySubmittal: queryState.roundsBySubmittal,
    isLoading: queryState.isLoading,
    error: queryState.error,
    refetch: queryState.refetch,
    byStatus: queryState.byStatus,
    byDrawingSet: queryState.byDrawingSet,
    overdue: queryState.overdue,
    kpis: queryState.kpis,
    createSubmittal: singleMutations.createSubmittal,
    updateSubmittal: singleMutations.updateSubmittal,
    deleteSubmittal: singleMutations.deleteSubmittal,
    createRound: roundMutations.createRound,
    updateRound: roundMutations.updateRound,
    bulkUpdate: bulkMutations.bulkUpdate,
    bulkDelete: bulkMutations.bulkDelete,
    invalidateAll,
  };
}
