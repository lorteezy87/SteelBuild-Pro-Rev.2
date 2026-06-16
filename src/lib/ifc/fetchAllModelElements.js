/**
 * fetchAllModelElements.js — load the FULL model_elements roster for a project.
 *
 * Supabase caps a single request at 1000 rows server-side (db-max-rows), so a
 * plain `.limit(50000)` silently returns only the first 1000 rows. On big models
 * (3k–12k+ pieces) that left most pieces with no color/click data and made
 * fab-status colors "not stick" (the assigned pieces simply weren't in the
 * loaded 1000). This pages through with `.range()` — each page is still ≤1000 —
 * until the roster is exhausted, so the viewer sees every GUID.
 */
import { supabase } from "@/lib/supabase";

const PAGE = 1000;

export async function fetchAllModelElements(projectId, { client = supabase, page = PAGE } = {}) {
  if (!projectId) return [];
  const all = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await client
      .from("model_elements")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("id", { ascending: true }) // stable order so pages don't overlap/skip
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < page) break; // a short (or empty) page = end of the roster
  }
  return all;
}
