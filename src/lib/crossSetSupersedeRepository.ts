import { supabase } from "@/lib/supabase";
import type { CrossSetSource, CrossSetSourceDrawing, CrossSetSourceSet } from "@/lib/crossSetSupersede";

// Narrow, paged reads (the allRows pattern from detailingValidation/repository.ts).
// entities.Drawing.filter would return full rows — extracted_text included — and
// caps at 2,000; a project's drawings can exceed PostgREST's page size.
const PAGE = 500;

async function allRows<T>(page: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE - 1);
    if (error) throw error;
    if (!data) throw new Error("Drawings were not returned. Retry the check.");
    if (!data.length) return rows;
    rows.push(...data);
  }
}

/**
 * Every non-deleted drawing and drawing set in the project — the evidence the
 * cross-set supersede plans (and re-checks at commit) against. Reads with the
 * user's JWT, so RLS applies; no writes.
 */
export async function fetchCrossSetSource(projectId: string): Promise<CrossSetSource> {
  if (!projectId) throw new Error("Select a project before checking other sets.");
  const [drawings, sets] = await Promise.all([
    allRows<CrossSetSourceDrawing>((start, end) => supabase.from("drawings")
      .select("id, sheet_number, title, revision_number, drawing_set_id, drawing_set_name, is_superseded, is_deleted, metadata")
      .eq("project_id", projectId).eq("is_deleted", false).order("id").range(start, end)),
    allRows<CrossSetSourceSet>((start, end) => supabase.from("drawing_sets")
      .select("id, set_name, is_locked, is_deleted")
      .eq("project_id", projectId).eq("is_deleted", false).order("id").range(start, end)),
  ]);
  return { drawings, sets };
}
