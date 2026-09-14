import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import type { Drawing } from "@/hooks/useDrawings";
import { TERMINAL_APPROVED_STATUSES } from "@/hooks/useSubmittals";
import { DISCIPLINES } from "@/components/drawings/drawingsConfig";
import type { DrawingSetRow } from "@/components/drawings/drawingsTableDerive";
import {
  deriveDrawingsPageModel,
  type DrawingsPageFilters,
  type Rfi,
  type Submittal,
} from "./drawingsPageDerive";

export function useDrawingsPageData({
  projectId,
  filters,
  selected,
  workdayDues,
}: {
  projectId: string | null | undefined;
  filters: DrawingsPageFilters;
  selected: ReadonlySet<string>;
  workdayDues: boolean;
}) {
  const drawingsQuery = useQuery<Drawing[]>({
    queryKey: ["drawings", projectId],
    queryFn: () => projectId
      ? entities.Drawing.filter({ project_id: projectId })
      : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const rfisQuery = useQuery<Rfi[]>({
    queryKey: ["rfis", projectId],
    queryFn: () => projectId
      ? entities.RFI.filter({ project_id: projectId })
      : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const submittalsQuery = useQuery<Submittal[]>({
    queryKey: ["submittals", projectId],
    queryFn: () => projectId
      ? entities.Submittal.filter({ project_id: projectId })
      : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const drawingSetsQuery = useQuery<DrawingSetRow[]>({
    queryKey: ["drawing_sets", projectId],
    queryFn: () => projectId
      ? entities.DrawingSet.filter({ project_id: projectId })
      : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const drawings = drawingsQuery.data ?? [];
  const rfis = rfisQuery.data ?? [];
  const submittals = submittalsQuery.data ?? [];
  const drawingSetRecords = drawingSetsQuery.data ?? [];
  const model = useMemo(
    () => deriveDrawingsPageModel({
      drawings,
      rfis,
      submittals,
      drawingSetRecords,
      filters,
      selected,
      disciplines: DISCIPLINES,
      terminalApprovedStatuses: TERMINAL_APPROVED_STATUSES,
      workdayDues,
    }),
    [
      drawingSetRecords,
      drawings,
      filters,
      rfis,
      selected,
      submittals,
      workdayDues,
    ],
  );

  return {
    drawings,
    rfis,
    submittals,
    drawingSetRecords,
    refetch: () => Promise.all([drawingsQuery.refetch(), rfisQuery.refetch(), submittalsQuery.refetch(), drawingSetsQuery.refetch()]),
    isLoading: !!projectId && (
      drawingsQuery.isPending ||
      rfisQuery.isPending ||
      submittalsQuery.isPending ||
      drawingSetsQuery.isPending),
    queryError:
      drawingsQuery.error ??
      rfisQuery.error ??
      submittalsQuery.error ??
      drawingSetsQuery.error ??
      null,
    ...model,
  };
}

export type DrawingsPageData = ReturnType<typeof useDrawingsPageData>;
