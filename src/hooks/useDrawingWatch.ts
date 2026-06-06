/**
 * useDrawingWatch — per-user drawing subscriptions (drawing_watchers). A member
 * can watch/unwatch a sheet; RLS lets them write only their own rows. Uses the
 * raw client because drawing_watchers has a composite PK (drawing_id, user_id)
 * with no single `id`, so the entity client's id-based delete doesn't apply.
 *
 * (Notifications on watched sheets are wired separately, DB-side.)
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/services/permissions";

/** Set of drawing ids the current user watches in this project. */
export function useMyDrawingWatches(projectId: string | null) {
  const { userId } = usePermissions();
  return useQuery({
    queryKey: ["my-drawing-watches", projectId, userId],
    enabled: !!projectId && !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("drawing_watchers")
        .select("drawing_id")
        .eq("project_id", projectId as string)
        .eq("user_id", userId as string);
      if (error) throw error;
      return new Set((data ?? []).map((r: { drawing_id: string }) => r.drawing_id));
    },
  });
}

export function useToggleDrawingWatch(projectId: string | null) {
  const { userId } = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ drawingId, watched }: { drawingId: string; watched: boolean }) => {
      if (!userId) throw new Error("Not signed in");
      if (watched) {
        const { error } = await supabase
          .from("drawing_watchers")
          .delete()
          .eq("drawing_id", drawingId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("drawing_watchers").insert({
          project_id: projectId as string,
          drawing_id: drawingId,
          user_id: userId,
          watch_type: "all_updates",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-drawing-watches", projectId, userId] }),
  });
}
