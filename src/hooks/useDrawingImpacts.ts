/**
 * useDrawingImpacts — stored, assignable downstream impacts of drawing revisions
 * (fabrication / erection / embed / anchor / connection / rework / etc.). Joins
 * drawing_impacts to drawing_revisions for sheet context. Complements the live
 * DERIVED read-model in src/lib/detailingReadiness.js: this hook is the
 * owned/trackable action items a human commits to, not the always-on signals.
 */
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";

export interface DrawingImpactRow {
  id: string;
  project_id: string;
  drawing_revision_id: string;
  impact_type: string;
  status: "open" | "in_review" | "ready" | "blocked" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  notes: string | null;
  assigned_to: string | null;
  due_date: string | null;
  resolved_at: string | null;
  created_at: string;
  // joined revision context
  sheet_number: string | null;
  sheet_title: string | null;
  revision_code: string | null;
}

export function useDrawingImpacts(projectId: string | null) {
  return useQuery({
    queryKey: ["drawing-impacts", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DrawingImpactRow[]> => {
      const [rawImpacts, rawRevisions] = await Promise.all([
        entities.DrawingImpact.filter({ project_id: projectId }),
        entities.DrawingRevision.filter({ project_id: projectId }),
      ]);
      const revById = new Map<string, any>();
      for (const r of (rawRevisions as any[]) ?? []) {
        if (r?.id) revById.set(String(r.id), r);
      }
      return ((rawImpacts as any[]) ?? [])
        .map((im) => {
          const rev = revById.get(String(im.drawing_revision_id));
          return {
            ...im,
            sheet_number: rev?.sheet_number ?? null,
            sheet_title: rev?.sheet_title ?? null,
            revision_code: rev?.revision_code ?? null,
          } as DrawingImpactRow;
        })
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    },
  });
}
