import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import type { GcChainSet } from "@/lib/gcDocuments/gcRevisionChain";

/**
 * The project's GC issuances, for naming and ordering a sheet's versions.
 *
 * Separate from `useGcDrawingsList` because the viewer itself does not need
 * sets — only compare does, to answer "which issuance was this, and when did it
 * reach us". Loading them alongside every sheet list would put a second request
 * on the critical path of simply opening a document.
 *
 * There are a handful of sets per project (5 in production across 2 projects),
 * so this is one small unpaged read; the sheet list is the one that needs care.
 */
export function useGcDrawingSets(projectId: string | null): {
  sets: GcChainSet[];
  isLoading: boolean;
} {
  const { data: sets = [], isLoading } = useQuery({
    queryKey: ["gc-drawing-sets", "viewer", projectId],
    queryFn: () =>
      projectId
        ? (entities.GcDrawingSet.filter({ project_id: projectId }) as Promise<GcChainSet[]>)
        : Promise.resolve([] as GcChainSet[]),
    enabled: !!projectId,
    staleTime: 30000,
  });

  return { sets, isLoading };
}
