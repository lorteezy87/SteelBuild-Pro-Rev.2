import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const CANONICAL_REPORTING_REALTIME_TABLES = [
  "pieces",
  "piece_events",
  "piece_drawings",
  "material_requirements",
  "fab_releases",
] as const;

export function canonicalReportingQueryKeys(projectId: string) {
  return [
    ["canonical-reporting", projectId],
    ["canonical-pieces-3d", projectId],
    ["piece-production", projectId],
    ["piece-logistics", projectId],
  ];
}

export function useCanonicalReportingRealtime(projectId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) return;
    const invalidate = () => {
      for (const queryKey of canonicalReportingQueryKeys(projectId)) {
        queryClient.invalidateQueries({ queryKey });
      }
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

