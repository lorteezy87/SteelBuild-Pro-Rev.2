/**
 * useGcDocumentsPageData — the GC Documents page's reads, and the derived
 * model. Queries only; all shaping lives in gcDocumentsPageDerive.ts.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { getQueryKey } from "@/services/cacheRegistry";
import {
  deriveGcDocumentsPageModel,
  type GcDocumentsPageFilters,
  type GcDrawingRow,
  type GcDrawingSetRow,
} from "./gcDocumentsPageDerive";

export function useGcDocumentsPageData({
  projectId,
  filters,
}: {
  projectId: string | null | undefined;
  filters: GcDocumentsPageFilters;
}) {
  const setsKey = getQueryKey("gcDrawingSet", projectId);
  const sheetsKey = getQueryKey("gcDrawing", projectId);

  const setsQuery = useQuery<GcDrawingSetRow[]>({
    queryKey: setsKey,
    queryFn: () =>
      projectId
        ? entities.GcDrawingSet.filter({ project_id: projectId })
        : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // filterAll, not filter: sheet counts drive printed claims here — "3
  // superseded", "no open ASIs against S-301" — and a project past the
  // 1000-row server cap would answer those from a truncated list with nothing
  // on screen saying so. Same reasoning as the drawing_revisions read.
  const sheetsQuery = useQuery<GcDrawingRow[]>({
    queryKey: sheetsKey,
    queryFn: () =>
      projectId
        ? entities.GcDrawing.filterAll({ project_id: projectId })
        : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const sets = useMemo(() => setsQuery.data ?? [], [setsQuery.data]);
  const sheets = useMemo(() => sheetsQuery.data ?? [], [sheetsQuery.data]);

  const model = useMemo(
    () => deriveGcDocumentsPageModel({ sets, sheets, filters }),
    [sets, sheets, filters],
  );

  const refetch = async () => {
    await Promise.all([setsQuery.refetch(), sheetsQuery.refetch()]);
  };

  return {
    sets,
    sheets,
    isLoading: !!projectId && (setsQuery.isPending || sheetsQuery.isPending),
    queryError: setsQuery.error || sheetsQuery.error,
    refetch,
    ...model,
  };
}

export type GcDocumentsPageData = ReturnType<typeof useGcDocumentsPageData>;
