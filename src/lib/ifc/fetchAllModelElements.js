/**
 * fetchAllModelElements.js — load the FULL model_elements roster for a project.
 *
 * Supabase caps a single request at 1000 rows server-side (db-max-rows), so a
 * plain `.limit(50000)` silently returns only the first 1000 rows. On big models
 * (a Capstone roster is ~16.8k pieces) the roster has to be paged.
 *
 * It used to page SERIALLY — fetch page 1, await, fetch page 2, await … — so a
 * 17-page roster meant ~17 back-to-back round-trips, which is what made fab
 * colors visibly "pop in" a few seconds after the model rendered. Now we take one
 * lightweight COUNT, then fetch every page CONCURRENTLY (Promise.all): ~2 round
 * trips instead of ~17. Same rows, same order, much faster first paint.
 */
import { supabase } from "@/lib/supabase";

const PAGE = 1000;

export async function fetchAllModelElements(projectId, { client = supabase, page = PAGE } = {}) {
  if (!projectId) return [];

  // One HEAD count so we know how many pages to fan out (no rows transferred).
  const { count, error: countError } = await client
    .from("model_elements")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_deleted", false);
  if (countError) throw countError;
  if (!count) return [];

  const fetchPage = async (i) => {
    const from = i * page;
    const { data, error } = await client
      .from("model_elements")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("id", { ascending: true }) // stable order so pages don't overlap/skip
      .range(from, from + page - 1);
    if (error) throw error;
    return data || [];
  };

  const pageCount = Math.ceil(count / page);
  const pages = await Promise.all(Array.from({ length: pageCount }, (_, i) => fetchPage(i)));
  return pages.flat();
}
