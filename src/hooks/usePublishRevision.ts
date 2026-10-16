/**
 * usePublishRevision — release a drawing revision via the
 * publish_drawing_revision RPC. The compatible server command binds the
 * existing current source and enforces the governing release gates; publishing
 * is not a source replacement or current-pointer operation.
 *
 * Invalidates the drawing-register family so the grid reflects the new status.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { publishRevisionArgsSchema } from "@/lib/securitySchemas";
import { invalidateEntity } from "@/services/cacheRegistry";

export type ReleaseStatus =
  | "reviewed"
  | "released_for_estimate"
  | "released_for_shop"
  | "released_for_field";

export function usePublishRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      revisionId,
      releaseStatus,
    }: {
      revisionId: string;
      releaseStatus: ReleaseStatus;
    }) => {
      const parsed = publishRevisionArgsSchema.parse({
        revisionId,
        releaseStatus,
      });
      const { data, error } = await supabase.rpc("publish_drawing_revision", {
        p_revision_id: parsed.revisionId,
        p_release_status: parsed.releaseStatus,
      });
      if (error) throw error;
      return data as { project_id?: string | null } | null;
    },
    onSuccess: (data) => {
      // Refresh the register (+ drawing families) for the affected project;
      // fall back to a prefix invalidation when the project id isn't returned.
      const pid = data?.project_id ?? undefined;
      if (pid) {
        invalidateEntity(qc, "drawing", pid);
        // The current revision's release status changed: invalidate the revision
        // family (["drawing-revisions"] powers the hub "Rev" column, which the
        // "drawing" family alone does not cover).
        invalidateEntity(qc, "drawing_revision", pid);
      }
      qc.invalidateQueries({ queryKey: ["drawing-register"] });
    },
  });
}
