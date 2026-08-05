import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { pieceControlKeys } from "@/lib/pieceControl/queryKeys";

export const CANONICAL_REPORTING_REALTIME_TABLES = [
  "pieces",
  "piece_events",
  "piece_drawings",
  "material_requirements",
  "fab_releases",
  // Mark / piece_id mirrors live on model_elements; without this the 3D viewer
  // keeps a stale link map until a hard refresh or manual "Link marks".
  "model_elements",
] as const;

export function canonicalReportingQueryKeys(projectId: string) {
  return [
    pieceControlKeys.canonicalReporting(projectId),
    pieceControlKeys.canonicalPieces3d(projectId),
    pieceControlKeys.register(projectId),
    // Canonical station board inside Piece Register (not the legacy EPM table).
    pieceControlKeys.productionBoard(projectId),
    // Legacy Production Status / EPM table — still used by shipping + Production Status page.
    pieceControlKeys.legacyProduction(projectId),
    pieceControlKeys.logistics(projectId),
    // Shared with Model3DTab / IFC import — must refresh when links change.
    pieceControlKeys.modelElements(projectId),
  ];
}


/**
 * Invalidate piece-lifecycle caches so the 3D Fab color mode (and boards)
 * refetch after Production / Logistics / release mutations. Critical because
 * the app uses a 30s staleTime and disables refetchOnWindowFocus — without
 * this, Model3DTab keeps painting the previous lifecycle_status.
 *
 * Prefer `invalidatePieceControlQueries` for write handlers (broader scopes).
 * This helper covers the realtime / reporting key set used by the 3D tab.
 */
export function invalidateCanonicalPieceCaches(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown },
  projectId: string,
) {
  return Promise.all(
    canonicalReportingQueryKeys(projectId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

export function useCanonicalReportingRealtime(projectId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;
    const invalidate = () => {
      void invalidateCanonicalPieceCaches(queryClient, projectId);
    };
    let channel = supabase.channel(`canonical-reporting:${projectId}`);
    for (const table of CANONICAL_REPORTING_REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `project_id=eq.${projectId}`,
        },
        invalidate,
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, queryClient]);
}
