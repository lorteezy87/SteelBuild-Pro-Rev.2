/**
 * fetchAllModelElements.js — load the FULL model_elements roster for a project.
 *
 * Supabase caps a single request at 1000 rows server-side (db-max-rows), so a
 * plain `.limit(50000)` silently returns only the first 1000 rows. On big models
 * (a Capstone roster ran ~16.8k pieces, the largest live one ~28k) the roster
 * has to be paged.
 *
 * It used to page with `.range(from, to)` — LIMIT/OFFSET. That is quadratic
 * here, and RLS is why. The SELECT policy on model_elements is
 *
 *     using (user_has_project_access(project_id))
 *
 * and `user_has_project_access` is SECURITY DEFINER, so Postgres can neither
 * inline it nor fold it to a constant: it shows up as a per-ROW `Filter:` and
 * runs once for every row the scan touches. OFFSET does not reduce the rows a
 * scan touches — page N still filters and then SORTS the whole project before
 * discarding the first N×1000 rows. So a 28-page roster paid the RLS filter
 * ~784k times, four pages at a time, and tripped `authenticated`'s 8s
 * statement_timeout (57014 — Sentry JAVASCRIPT-REACT-2H, /DrawingSubmittalHub).
 *
 * Measured on the live DB (project 9a79f6e2…, 4,825 rows, same role, same RLS):
 *
 *   .range(4000, 4999)        Bitmap Heap Scan + Sort all 4,825   20,249 buffers  203 ms
 *   .gt("id", cursor).limit() Index Scan, stops at 1,000            5,735 buffers   44 ms
 *
 * So we page by KEYSET instead: order by the primary key and ask for rows after
 * the last id we saw. `model_elements_pkey` is UNIQUE on `id`, so the cursor is
 * strictly increasing — no row is skipped or returned twice — and
 * `model_elements_project_id_active_id_idx ON (project_id, id) WHERE
 * is_deleted = false` serves it as a plain index scan that stops after `page`
 * rows. Cost per page is now flat instead of proportional to the whole project,
 * and the RLS filter runs once per row returned rather than once per row
 * scanned per page.
 *
 * Keyset paging is inherently sequential (each page needs the previous page's
 * last id), so this trades the old bounded fan-out for N round-trips. That is a
 * good trade: the fan-out only ever existed to hide how slow each offset page
 * was, and it was itself what turned a slow page into a timeout storm. At the
 * largest roster size the sequential keyset walk does roughly 1.2s of database
 * work where the concurrent offset walk did ~33s.
 */
import { supabase } from "@/lib/supabase";

const PAGE = 1000;
/**
 * Safety stop for the keyset walk. `id` is UNIQUE and we always ask for
 * `id > cursor`, so the loop must terminate; this only bounds the damage if a
 * client mock or a future schema change ever breaks that invariant.
 */
const MAX_PAGES = 1000;

/**
 * How many live model members this project has — ONE HEAD request, zero rows
 * transferred.
 *
 * Callers that only need to know whether a roster EXISTS (and how big it is)
 * must use this instead of loading the roster. Live rosters run to ~28k rows, so
 * the full read stays lazy; a UI that infers "no members imported" from an
 * unloaded roster tells the user something false.
 *
 * @returns {Promise<number>} live element count (0 when none)
 */
export async function countModelElements(projectId, { client = supabase } = {}) {
  if (!projectId) return 0;
  const { count, error } = await client
    .from("model_elements")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_deleted", false);
  if (error) throw error;
  return count || 0;
}

/** The keyset cursor rides `id`, so a projection that drops it cannot page. */
function assertCursorColumn(columns) {
  if (columns === "*") return;
  const has = String(columns)
    .split(",")
    .some((c) => c.trim() === "id");
  if (!has) {
    throw new Error(
      `fetchAllModelElements: columns must include "id" (keyset cursor); got "${columns}"`,
    );
  }
}

/**
 * @returns {Promise<Record<string, unknown>[]>} every live element, id-ascending
 */
export async function fetchAllModelElements(
  projectId,
  { client = supabase, page = PAGE, columns = "*" } = {},
) {
  if (!projectId) return [];
  assertCursorColumn(columns);

  /**
   * Rows are shaped by the caller's `columns` projection, so this module cannot
   * know their type; consumers narrow at their own boundary.
   * @type {Record<string, unknown>[]}
   */
  const out = [];
  /** @type {string | null} */
  let cursor = null;

  for (let i = 0; i < MAX_PAGES; i += 1) {
    let q = client
      .from("model_elements")
      .select(columns)
      .eq("project_id", projectId)
      .eq("is_deleted", false);
    // First page starts at the beginning; every later page resumes strictly
    // after the last id we saw.
    if (cursor !== null) q = q.gt("id", cursor);
    const { data, error } = await q.order("id", { ascending: true }).limit(page);
    if (error) throw error;

    const rows = /** @type {Record<string, unknown>[]} */ (data || []);
    out.push(...rows);
    // A short page is the last page — no extra probe request.
    if (rows.length < page) return out;

    const last = rows[rows.length - 1];
    const nextCursor = /** @type {string | null} */ (last?.id ?? null);
    // Defensive: without a usable, advancing cursor we would re-request the
    // same page forever. Stop with what we have rather than spin.
    if (nextCursor === null || nextCursor === cursor) return out;
    cursor = nextCursor;
  }

  return out;
}

/** Slim projection for Production Status piece↔drawing lookup (avoids SELECT *). */
export const MODEL_ELEMENT_DRAWING_LINK_COLUMNS = "id,piece_mark,drawing_no,drawing_id";
