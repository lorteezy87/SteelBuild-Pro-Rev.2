import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@/services/cacheRegistry";
import {
  fetchSubmittalRounds,
  fetchSubmittals,
  groupSubmittalRounds,
  groupSubmittalsByStatus,
  selectOverdueSubmittals,
  SUBMITTAL_QUERY_STALE_TIME,
  summarizeDrawingSets,
  summarizeSubmittalKpis,
} from "./queries";
import type { Submittal, SubmittalRound } from "./types";

export function useSubmittalQueries(
  projectId: string | null | undefined,
) {
  const queryKey = getQueryKey("submittal", projectId);
  const roundsQueryKey = getQueryKey("submittal_round", projectId);

  const {
    data: submittals = [],
    isPending,
    error,
    refetch,
  } = useQuery<Submittal[]>({
    queryKey,
    queryFn: () => fetchSubmittals(projectId),
    enabled: !!projectId,
    staleTime: SUBMITTAL_QUERY_STALE_TIME,
  });

  const { data: rounds = [], isPending: roundsPending, error: roundsError, refetch: refetchRounds } = useQuery<
    SubmittalRound[]
  >({
    queryKey: roundsQueryKey,
    queryFn: () => fetchSubmittalRounds(projectId),
    enabled: !!projectId,
    staleTime: SUBMITTAL_QUERY_STALE_TIME,
  });

  const byStatus = useMemo(
    () => groupSubmittalsByStatus(submittals),
    [submittals],
  );
  const byDrawingSet = useMemo(
    () => summarizeDrawingSets(submittals),
    [submittals],
  );
  const roundsBySubmittal = useMemo(
    () => groupSubmittalRounds(rounds),
    [rounds],
  );
  const overdue = useMemo(
    () => selectOverdueSubmittals(submittals),
    [submittals],
  );
  const kpis = useMemo(
    () => summarizeSubmittalKpis(submittals, overdue.length),
    [submittals, overdue],
  );

  return {
    queryKey,
    submittals,
    rounds,
    roundsBySubmittal,
    isLoading: !!projectId && (isPending || roundsPending),
    error: error ?? roundsError,
    refetch: async () => { await refetchRounds(); return refetch(); },
    byStatus,
    byDrawingSet,
    overdue,
    kpis,
  };
}
