import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * useRealtimeInvalidation — subscribe to Postgres changes on a table and
 * invalidate the relevant React Query caches automatically.
 *
 * This gives multi-user visibility without rewriting every data hook.
 * When another user creates/updates/deletes a row, the local cache is
 * invalidated and React Query refetches in the background.
 *
 * Usage:
 *   useRealtimeInvalidation("rfis", projectId, [["rfis", projectId], ["rfis"]]);
 *
 * The hook subscribes to INSERT/UPDATE/DELETE on the given table,
 * optionally scoped to a project_id filter. When any event fires, it
 * invalidates all provided query keys.
 */
export function useRealtimeInvalidation(
  table: string,
  projectId: string | null | undefined,
  queryKeys: unknown[][],
) {
  const qc = useQueryClient();

  // Callers almost always pass an inline queryKeys array (new identity every
  // render). Keep it in a ref so the subscription callback always reads the
  // latest keys WITHOUT putting queryKeys in the effect deps — adding it there
  // would tear down and re-subscribe the Supabase channel on every render
  // (a real-world perf/connection-churn bug), while omitting it (the previous
  // code) captured the mount-time keys and could invalidate stale ones.
  const queryKeysRef = useRef(queryKeys);
  queryKeysRef.current = queryKeys;

  useEffect(() => {
    if (!table) return;

    const channelName = projectId
      ? `rt:${table}:${projectId}`
      : `rt:${table}:global`;

    const filter = projectId ? `project_id=eq.${projectId}` : undefined;

    // Coalesce a burst of row events (e.g. a bulk update that fires N
    // postgres_changes callbacks) into ONE invalidation cycle via a ~300ms
    // trailing debounce. Without this, a bulk op invalidated the query keys
    // N times, each triggering a refetch. The keys are read from the ref at
    // FLUSH time so a key change mid-debounce still invalidates the latest set.
    const DEBOUNCE_MS = 300;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = null;
        for (const key of queryKeysRef.current) {
          qc.invalidateQueries({ queryKey: key });
        }
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        scheduleInvalidate,
      )
      .subscribe();

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      supabase.removeChannel(channel);
    };
  }, [table, projectId, qc]);
}
