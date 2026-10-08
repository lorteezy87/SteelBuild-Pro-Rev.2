/**
 * useGcDocumentsPageData — the GC Documents page's reads, and the derived
 * model. Queries only; all shaping lives in gcDocumentsPageDerive.ts.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { getQueryKey } from "@/services/cacheRegistry";
import { fetchGcShopImpactLinks, type GcShopImpactLink } from "@/lib/gcDocuments/gcShopImpactLinks";
import type { RowWithAliases } from "@/api/supabaseClient";
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
  const shopSetsKey = getQueryKey("drawingSet", projectId);
  const impactLinksKey = ["gc-issuance-shop-set-links", projectId] as const;

  const setsQuery = useQuery<GcDrawingSetRow[]>({
    queryKey: setsKey,
    queryFn: () =>
      projectId
        ? entities.GcDrawingSet.filterAll({ project_id: projectId })
        : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Complete project reads for both issuances and sheets: a capped issuance
  // list would omit GC change documents and understate executive counts.
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

  const impactLinksQuery = useQuery<GcShopImpactLink[]>({
    queryKey: impactLinksKey,
    queryFn: () => projectId ? fetchGcShopImpactLinks(projectId) : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 30_000,
    retry: false, // A missing candidate migration is unavailable, not transient.
  });

  const shopSetsQuery = useQuery<RowWithAliases<"drawing_sets">[]>({
    queryKey: shopSetsKey,
    queryFn: () => projectId
      ? entities.DrawingSet.filterAll({ project_id: projectId })
      : Promise.resolve([]),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const sets = useMemo(() => setsQuery.data ?? [], [setsQuery.data]);
  const sheets = useMemo(() => sheetsQuery.data ?? [], [sheetsQuery.data]);
  const impactLinks = useMemo(() => impactLinksQuery.data ?? [], [impactLinksQuery.data]);
  const shopSets = useMemo(() => (shopSetsQuery.data ?? []).filter((set) =>
    set.project_id === projectId && !set.is_deleted && !set.deleted_at,
  ), [shopSetsQuery.data, projectId]);
  const linksByIssuance = useMemo(() => {
    const mapped = new Map<string, GcShopImpactLink[]>();
    for (const link of impactLinks) {
      if (link.project_id !== projectId) continue;
      const current = mapped.get(link.gc_drawing_set_id) ?? [];
      current.push(link);
      mapped.set(link.gc_drawing_set_id, current);
    }
    return mapped;
  }, [impactLinks, projectId]);

  const model = useMemo(
    () => deriveGcDocumentsPageModel({ sets, sheets, filters }),
    [sets, sheets, filters],
  );

  const refetch = async () => {
    await Promise.all([
      setsQuery.refetch(), sheetsQuery.refetch(),
      impactLinksQuery.refetch(), shopSetsQuery.refetch(),
    ]);
  };

  return {
    sets,
    sheets,
    shopSets,
    linksByIssuance,
    impactLinksStatus: impactLinksQuery.isPending ? "loading" as const
      : impactLinksQuery.isError ? "unavailable" as const : "available" as const,
    shopSetsStatus: shopSetsQuery.isPending ? "loading" as const
      : shopSetsQuery.isError ? "unavailable" as const : "available" as const,
    isLoading: !!projectId && (setsQuery.isPending || sheetsQuery.isPending),
    queryError: setsQuery.error || sheetsQuery.error,
    refetch,
    ...model,
  };
}

export type GcDocumentsPageData = ReturnType<typeof useGcDocumentsPageData>;
