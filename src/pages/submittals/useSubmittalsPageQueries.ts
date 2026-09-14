import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { groupSubmittalRounds } from "@/hooks/submittals/queries";
import type { DrawingSet, DrawingSetsById, Submittal, SubmittalRoundRecord } from "./types";

export interface SubmittalSheetResponseRecord {
  id?: string;
  submittal_round_id?: string;
  drawing_set_ids?: string[];
  [key: string]: unknown;
}

export interface SubmittalCommentDispositionRecord {
  id?: string;
  submittal_id?: string;
  status?: string;
  [key: string]: unknown;
}

export interface SubmittalDrawingRecord {
  id?: string;
  drawing_set_id?: string;
  [key: string]: unknown;
}

export interface SubmittalLinkedRecord {
  id?: string;
  [key: string]: unknown;
}

export function indexDrawingSets(drawingSets: DrawingSet[]): DrawingSetsById {
  const indexed = new Map<string, DrawingSet>();
  for (const drawingSet of drawingSets) {
    if (drawingSet.id) indexed.set(drawingSet.id, drawingSet);
  }
  return indexed;
}

export { groupSubmittalRounds };

export function useSubmittalsPageQueries(projectId: string | undefined) {
  const rowsQuery = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: async () => projectId
      ? await entities.Submittal.filter({ project_id: projectId }, "-submitted_date") as Submittal[]
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const drawingSetsQuery = useQuery({
    queryKey: ["drawing_sets", projectId],
    queryFn: async () => projectId
      ? await entities.DrawingSet.filter({ project_id: projectId }) as DrawingSet[]
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const allRoundsQuery = useQuery({
    queryKey: ["submittal-rounds", projectId],
    queryFn: async () => projectId
      ? await entities.SubmittalRound.filter(
          { project_id: projectId },
          "round_number",
        ) as SubmittalRoundRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const allRfisQuery = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: async () => projectId
      ? await entities.RFI.filter({ project_id: projectId }) as SubmittalLinkedRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const allTasksQuery = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: async () => projectId
      ? await entities.ScheduleTask.filter({ project_id: projectId }) as SubmittalLinkedRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const allDrawingsQuery = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: async () => projectId
      ? await entities.Drawing.filter({ project_id: projectId }) as SubmittalDrawingRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const allSheetResponsesQuery = useQuery({
    queryKey: ["sheet-responses", projectId],
    queryFn: async () => projectId
      ? await entities.SubmittalSheetResponse.filter({
          project_id: projectId,
        }) as SubmittalSheetResponseRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const allCommentDispositionsQuery = useQuery({
    queryKey: ["comment-dispositions", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      return await entities.SubmittalCommentDisposition.filter({
        project_id: projectId,
      }) as SubmittalCommentDispositionRecord[];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const rows = rowsQuery.data ?? [];
  const drawingSets = drawingSetsQuery.data ?? [];
  const allRounds = allRoundsQuery.data ?? [];
  const allRfis = allRfisQuery.data ?? [];
  const allTasks = allTasksQuery.data ?? [];
  const allDrawings = allDrawingsQuery.data ?? [];
  const allSheetResponses = allSheetResponsesQuery.data ?? [];
  const allCommentDispositions = allCommentDispositionsQuery.data ?? [];
  const queries = [rowsQuery, drawingSetsQuery, allRoundsQuery, allRfisQuery, allTasksQuery, allDrawingsQuery, allSheetResponsesQuery, allCommentDispositionsQuery];
  const isLoading = !!projectId && queries.some(query => query.isPending);
  const queryError = queries.find(query => query.isError)?.error ?? null;
  const refetch = () => Promise.all(queries.map(query => query.refetch()));

  const drawingSetsById = useMemo(() => indexDrawingSets(drawingSets), [drawingSets]);
  const roundsBySubmittal = useMemo(() => groupSubmittalRounds(allRounds), [allRounds]);

  return {
    rows,
    isLoading,
    queryError,
    refetch,
    drawingSets,
    drawingSetsById,
    allRounds,
    roundsBySubmittal,
    allRfis,
    allTasks,
    allDrawings,
    allSheetResponses,
    allCommentDispositions,
  };
}
