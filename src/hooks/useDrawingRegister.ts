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
import { fetchAllRows } from "@/lib/pagedQuery";

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

/**
 * The register is READ TO COMPLETENESS, not capped.
 *
 * This used to be a single unbounded `.select()`, which PostgREST silently cut
 * off at its 1000-row `db-max-rows` ceiling: a project past 1000 sheets showed
 * a short register with no notice. Audit batch 1 (#435) flagged it as a real
 * finding — the most exposed of the seven — and allowlisted it in
 * eslint.config.js only so the no-unbounded-query rule could land green.
 *
 * `fetchAllRows`, not `fetchCapped`: a cap plus a truncation notice is the
 * right shape for a list where "the first N" is a legitimate answer, and this
 * is not one. Five panels derive CLAIMS from these rows — the Drawing Register
 * grid, the Holds picker ("Every sheet already has an active hold"), the
 * Transmittal log, the Impact board and the Review queue — so a short read does
 * not merely shorten a list, it makes those claims wrong. It also throws rather
 * than returning partial data, which is what a caller wanting completeness
 * needs.
 *
 * `sheet_number` is nullable and not unique, so it is not a total order on its
 * own; `drawing_id` is the stable unique tiebreaker `fetchAllRows` asks for, and
 * without it the `.range()` windows may skip or repeat rows between pages.
 */
function fetchRegisterRows(projectId: string) {
  return fetchAllRows<Omit<DrawingRegisterRow, "drawing_set_id">>(
    async (start, end) => {
      // The no-restricted-syntax rule matches any `supabase.from()`, including
      // the page callback it tells you to write, so fetchAllRows cannot be
      // adopted without an exemption. Disabled per call site rather than
      // allowlisting the file, which would also re-exempt anything added here
      // later. `.range()` is what bounds this read.
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await supabase
        .from("drawing_register_view")
        .select("*")
        .eq("project_id", projectId)
        .order("sheet_number", { ascending: true })
        .order("drawing_id", { ascending: true })
        .range(start, end);
      // The generated Database types do not describe this view's full row, and
      // DrawingRegisterRow above is its hand-maintained contract — the same cast
      // the unpaged version made.
      return { data: data as Omit<DrawingRegisterRow, "drawing_set_id">[] | null, error };
    },
    "drawing register",
  );
}

export function useDrawingRegister(projectId: string | null) {
  return useQuery({
    queryKey: ["drawing-register", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DrawingRegisterRow[]> => {
      const registerRows = await fetchRegisterRows(projectId as string);
      const setIdByDrawingId = new Map<string, string | null>();
      const drawingIdBatches: string[][] = [];
      for (let start = 0; start < registerRows.length; start += DRAWING_SET_LOOKUP_BATCH_SIZE) {
        drawingIdBatches.push(registerRows
          .slice(start, start + DRAWING_SET_LOOKUP_BATCH_SIZE)
          .map((row) => row.drawing_id));
      }
      // Each batch is already bounded — DRAWING_SET_LOOKUP_BATCH_SIZE ids
      // matched on the primary key, so at most that many rows, and the batching
      // exists to keep the `.in()` URL short rather than to cap the result.
      // Reading it through the same helper keeps the whole file under the
      // no-unbounded-query rule: a file-level allowlist entry for this call
      // would also re-exempt the register read above, which is the one that
      // actually truncated.
      const drawingBatches = await Promise.all(drawingIdBatches.map((drawingIds) =>
        fetchAllRows<{ id: string; drawing_set_id: string | null }>(
          async (start, end) => {
            // Same reason as the register read above: the rule fires inside the
            // page callback it recommends. Bounded twice over here, by `.in()`
            // and `.range()`.
            // eslint-disable-next-line no-restricted-syntax
            const { data, error } = await supabase
              .from("drawings")
              .select("id, drawing_set_id")
              .eq("project_id", projectId as string)
              .in("id", drawingIds)
              .range(start, end);
            return { data, error };
          },
          "drawing set lookup",
        )
      ));
      for (const drawings of drawingBatches) {
        for (const drawing of drawings) {
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
