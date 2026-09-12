import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { isMissingSchemaObjectError } from "@/lib/postgrestErrors";
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

export function groupSubmittalRounds(
  rounds: SubmittalRoundRecord[],
): Record<string, SubmittalRoundRecord[]> {
  const grouped: Record<string, SubmittalRoundRecord[]> = {};
  for (const round of rounds) {
    if (!round.submittal_id) continue;
    if (!grouped[round.submittal_id]) grouped[round.submittal_id] = [];
    grouped[round.submittal_id].push(round);
  }
  for (const submittalRounds of Object.values(grouped)) {
    submittalRounds.sort(
      (left, right) => (left.round_number || 1) - (right.round_number || 1),
    );
  }
  return grouped;
}

export function useSubmittalsPageQueries(projectId: string | undefined) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: async () => projectId
      ? await entities.Submittal.filter({ project_id: projectId }, "-submitted_date") as Submittal[]
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const { data: drawingSets = [] } = useQuery({
    queryKey: ["drawing_sets", projectId],
    queryFn: async () => projectId
      ? await entities.DrawingSet.filter({ project_id: projectId }) as DrawingSet[]
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { data: allRounds = [] } = useQuery({
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

  const { data: allRfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: async () => projectId
      ? await entities.RFI.filter({ project_id: projectId }) as SubmittalLinkedRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ["schedule-tasks", projectId],
    queryFn: async () => projectId
      ? await entities.ScheduleTask.filter({ project_id: projectId }) as SubmittalLinkedRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { data: allDrawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: async () => projectId
      ? await entities.Drawing.filter({ project_id: projectId }) as SubmittalDrawingRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { data: allSheetResponses = [] } = useQuery({
    queryKey: ["sheet-responses", projectId],
    queryFn: async () => projectId
      ? await entities.SubmittalSheetResponse.filter({
          project_id: projectId,
        }) as SubmittalSheetResponseRecord[]
      : [],
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const { data: allCommentDispositions = [] } = useQuery({
    queryKey: ["comment-dispositions", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      try {
        return await entities.SubmittalCommentDisposition.filter({
          project_id: projectId,
        }) as SubmittalCommentDispositionRecord[];
      } catch (error) {
        if (isMissingSchemaObjectError(error)) {
          console.warn(
            "[submittals] comment dispositions unavailable — apply pending migration",
            error,
          );
          return [];
        }
        throw error;
      }
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const drawingSetsById = useMemo(() => indexDrawingSets(drawingSets), [drawingSets]);
  const roundsBySubmittal = useMemo(() => groupSubmittalRounds(allRounds), [allRounds]);

  return {
    rows,
    isLoading,
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
