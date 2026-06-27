/**
 * useRealtimeInvalidation — Supabase realtime subscription that invalidates
 * TanStack Query caches when rows in a given table are inserted/updated/deleted.
 *
 * Stub implementation: subscribes to the table channel and invalidates the
 * provided query keys on any postgres change event. Falls back to a no-op
 * if projectId is missing (global pages that don't have a project context).
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useRealtimeInvalidation(tableName, projectId, queryKeys = []) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!tableName || !projectId) return;

    const channel = supabase
      .channel(`realtime-${tableName}-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName,
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          // Invalidate all provided query keys on any change
          queryKeys.forEach((key) => {
            qc.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, projectId]);
}
