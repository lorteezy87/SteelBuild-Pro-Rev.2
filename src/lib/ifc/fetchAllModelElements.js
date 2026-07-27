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
 * lightweight COUNT, then fetch pages in bounded concurrent batches: enough
 * parallelism for first paint, without opening ~28 SELECT * queries at once
 * (which timed out under statement_timeout on ~27k-row projects —
 * Sentry JAVASCRIPT-REACT-X / production-model-elements).
 */
import { supabase } from "@/lib/supabase";

const PAGE = 1000;
/** Cap concurrent page fetches to avoid statement-timeout storms. */
const DEFAULT_CONCURRENCY = 4;

async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchAllModelElements(
  projectId,
  { client = supabase, page = PAGE, concurrency = DEFAULT_CONCURRENCY, columns = "*" } = {},
) {
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
      .select(columns)
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("id", { ascending: true }) // stable order so pages don't overlap/skip
      .range(from, from + page - 1);
    if (error) throw error;
    return data || [];
  };

  const pageCount = Math.ceil(count / page);
  const pageIndexes = Array.from({ length: pageCount }, (_, i) => i);
  const pages = await mapPool(pageIndexes, Math.max(1, concurrency), fetchPage);
  return pages.flat();
}

/** Slim projection for Production Status piece↔drawing lookup (avoids SELECT *). */
export const MODEL_ELEMENT_DRAWING_LINK_COLUMNS = "id,piece_mark,drawing_no,drawing_id";
