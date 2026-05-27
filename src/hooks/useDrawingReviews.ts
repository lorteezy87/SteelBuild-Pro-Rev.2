/**
 * useDrawingReviews — role-based review gates for a project's drawing revisions.
 * Joins drawing_reviews to drawing_revisions so each queue row carries its sheet
 * number / title / revision code for a readable Review Queue.
 */
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export interface DrawingReviewRow {
  id: string;
  project_id: string;
  drawing_revision_id: string;
  review_role: string;
  reviewer_id: string | null;
  decision: "pending" | "approved" | "approved_with_notes" | "rejected" | "not_required";
  comments: string | null;
  reviewed_at: string | null;
  created_at: string;
  // joined revision context
  sheet_number: string | null;
  sheet_title: string | null;
  revision_code: string | null;
}

export function useDrawingReviews(projectId: string | null) {
  return useQuery({
    queryKey: ["drawing-reviews", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DrawingReviewRow[]> => {
      const [rawReviews, rawRevisions] = await Promise.all([
        base44.entities.DrawingReview.filter({ project_id: projectId }),
        base44.entities.DrawingRevision.filter({ project_id: projectId }),
      ]);
      const revById = new Map<string, any>();
      for (const r of (rawRevisions as any[]) ?? []) {
        if (r?.id) revById.set(String(r.id), r);
      }
      return ((rawReviews as any[]) ?? [])
        .map((rv) => {
          const rev = revById.get(String(rv.drawing_revision_id));
          return {
            ...rv,
            sheet_number: rev?.sheet_number ?? null,
            sheet_title: rev?.sheet_title ?? null,
            revision_code: rev?.revision_code ?? null,
          } as DrawingReviewRow;
        })
        .sort((a, b) => {
          // pending first, then most-recent
          const ap = a.decision === "pending" ? 0 : 1;
          const bp = b.decision === "pending" ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        });
    },
  });
}
