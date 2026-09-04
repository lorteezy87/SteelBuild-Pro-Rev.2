/**
 * pagedSelect — exhaust a PostgREST select that would otherwise be silently
 * capped at the server's db-max-rows (1000 on this project).
 *
 * Several Piece Control readers (Overview snapshot, logistics board, shipping
 * import, the 3D viewer's canonical join) used a bare `.select()` and quietly
 * lost every lot past row 1000 on big jobs. This is the one paging loop they
 * all share. Callers pass a factory that builds the *ordered* query for a
 * page; a stable `.order()` is required because offset paging without one is
 * non-deterministic in Postgres (rows can repeat or vanish across pages).
 */

export const PAGED_SELECT_PAGE_SIZE = 1000;
/** Hard stop so a runaway loop on a broken filter can't hammer the API. */
export const PAGED_SELECT_SAFETY_MAX_ROWS = 200_000;

interface PageResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
}

export interface PagedSelectOptions {
  pageSize?: number;
  maxRows?: number;
  /** Called when the safety cap stops the loop early. */
  onTruncated?: (rows: number) => void;
}

/**
 * @param makeQuery Returns a thenable PostgREST builder for rows [from, to]
 *                  (inclusive). The builder must include `.order(...)` and
 *                  must NOT include `.range()` — the helper applies it.
 */
export async function fetchAllPages<T>(
  makeQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = PAGED_SELECT_PAGE_SIZE, maxRows = PAGED_SELECT_SAFETY_MAX_ROWS, onTruncated }: PagedSelectOptions = {},
): Promise<T[]> {
  const rows: T[] = [];
  const size = Math.max(1, Math.floor(pageSize));
  for (let from = 0; from < maxRows; from += size) {
    const { data, error } = await makeQuery(from, from + size - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < size) return rows;
  }
  onTruncated?.(rows.length);
  return rows;
}

/**
 * Convenience for the common "every row of `table` for a project" case.
 * `build` receives the base filtered query so callers add their own `.eq()`s;
 * the helper appends a stable `.order()` + `.range()`.
 */
export async function fetchAllProjectRowsPaged<T>(
  client: { from: (table: string) => any },
  table: string,
  projectId: string,
  {
    select = "*",
    orderBy = "id",
    build,
    ...options
  }: PagedSelectOptions & {
    select?: string;
    orderBy?: string | string[];
    build?: (query: any) => any;
  } = {},
): Promise<T[]> {
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return fetchAllPages<T>((from, to) => {
    let query = client.from(table).select(select).eq("project_id", projectId);
    if (build) query = build(query);
    for (const column of orders) query = query.order(column, { ascending: true });
    // Always tie-break on id so equal sort keys still page deterministically.
    if (!orders.includes("id")) query = query.order("id", { ascending: true });
    return query.range(from, to);
  }, options);
}
