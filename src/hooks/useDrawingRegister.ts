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
  drawing_set_id?: string | null;
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
  // Always present from the live view (migration 20260908045525); optional
  // here only so existing fixtures that spread a partial row keep compiling.
  active_hold_id?: string | null;
  active_hold_reason?: string | null;
  active_hold_placed_at?: string | null;
}

const DRAWING_SET_LOOKUP_BATCH_SIZE = 100;

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
      const registerRows = (data ?? []) as Omit<DrawingRegisterRow, "drawing_set_id">[];
      const setIdByDrawingId = new Map<string, string | null>();
      const drawingIdBatches: string[][] = [];
      for (let start = 0; start < registerRows.length; start += DRAWING_SET_LOOKUP_BATCH_SIZE) {
        drawingIdBatches.push(registerRows
          .slice(start, start + DRAWING_SET_LOOKUP_BATCH_SIZE)
          .map((row) => row.drawing_id));
      }
      const drawingBatches = await Promise.all(drawingIdBatches.map((drawingIds) =>
        supabase
          .from("drawings")
          .select("id, drawing_set_id")
          .eq("project_id", projectId as string)
          .in("id", drawingIds)
      ));
      for (const { data: drawings, error: drawingError } of drawingBatches) {
        if (drawingError) throw drawingError;
        for (const drawing of drawings ?? []) {
          setIdByDrawingId.set(drawing.id, drawing.drawing_set_id);
        }
      }
      return registerRows.map((row) => ({
        ...row,
        drawing_set_id: setIdByDrawingId.get(row.drawing_id) ?? null,
      }));
    },
  });
}
