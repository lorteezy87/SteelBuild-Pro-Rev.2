/**
 * useDrawingRegister — reads the document-control register for a project from
 * the `drawing_register_view` (one row per active drawing: its current revision,
 * release status, and open-impact / pending-review / RFI / work-package counts).
 *
 * The view is `security_invoker`, so the caller's RLS on the underlying tables
 * applies — no separate access check needed here.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface DrawingRegisterRow {
  drawing_id: string;
  project_id: string | null;
  sheet_number: string | null;
  sheet_title: string | null;
  discipline: string | null;
  drawing_set_name: string | null;
  stage: string | null;
  current_revision_id: string | null;
  current_revision: string | null;
  current_status: string | null;
  current_issued_at: string | null;
  open_impact_count: number | null;
  pending_review_count: number | null;
  rfi_count: number | null;
  work_package_count: number | null;
  last_activity: string | null;
}

export function useDrawingRegister(projectId: string | null) {
  return useQuery({
    queryKey: ["drawing-register", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DrawingRegisterRow[]> => {
      const { data, error } = await supabase
        .from("drawing_register_view")
        .select("*")
        .eq("project_id", projectId as string)
        .order("sheet_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DrawingRegisterRow[];
    },
  });
}
