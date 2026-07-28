import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const CANONICAL_REPORTING_REALTIME_TABLES = [
  "pieces",
  "piece_events",
  "piece_drawings",
  "material_requirements",
  "fab_releases",
] as const;

/** Caches that must refresh when piece lifecycle / release state changes. */
export function canonicalReportingQueryKeys(projectId: string) {
  return [
    ["canonical-reporting", projectId],
    ["canonical-pieces-3d", projectId],
    ["piece-production", projectId],
    ["piece-logistics", projectId],
    ["piece-register", projectId],
    ["canonical-release-gate"],
  ];
}

/**
 * Invalidate piece-lifecycle caches so the 3D Fab color mode (and boards)
 * refetch after Production / Logistics / release mutations. Critical because
 * the app uses a 30s staleTime and disables refetchOnWindowFocus — without
 * this, Model3DTab keeps painting the previous lifecycle_status.
 */
export function invalidateCanonicalPieceCaches(
  queryClient: QueryClient,
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

