/**
 * pagedQuery.ts — one paged-read helper for raw `supabase.from()` call sites.
 *
 * WHY THIS EXISTS
 * PostgREST enforces a server-side `db-max-rows` ceiling (SERVER_MAX_ROWS = 1000
 * in supabase/config.toml). A read that exceeds it comes back **200 OK with
 * 1000 rows** — no error, no flag. The entity client
 * (src/api/client/entityClient.ts) handles this with an explicit cap plus
 * Sentry truncation telemetry, but call sites that reach for the raw client
 * bypass all of that and silently ship short data.
 *
 * That already caused a shipped defect: the claims package in
 * ExportFabReleaseModal fetched RFIs / change orders / photos with no bound, so
 * a large job produced an export that looked complete and wasn't — on a
 * document that goes to a GC.
 *
 * Two shapes, pick by consequence:
 *   • fetchAllRows  — pages until exhausted. Use when short data is WRONG
 *                     (exports, dedup scans, validation evidence).
 *   • fetchCapped   — one bounded read that REPORTS truncation. Use for UI
 *                     lists where showing the first N is acceptable as long as
 *                     the user is told.
 *
 * Both take a `page(start, end)` callback so they stay client-agnostic and
 * unit-testable with a plain fake.
 */

/** PostgREST rows per request. Kept under the 1000 server ceiling. */
export const PAGE_SIZE = 500;

/**
 * Hard stop. Without it a backend that keeps returning a full page (a broken
 * `range`, an unstable sort) loops forever and hangs the tab. 200k rows is far
 * beyond any real project and still terminates.
 */
export const MAX_ROWS = 200_000;

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

export type PageFn<T> = (start: number, end: number) => PromiseLike<PageResult<T>>;

export class PagedQueryError extends Error {
  cause: unknown;
  constructor(label: string, cause: unknown) {
    const detail =
      cause instanceof Error
        ? cause.message
        : typeof cause === "object" && cause && "message" in cause
          ? String((cause as { message: unknown }).message)
          : String(cause);
    super(`${label}: ${detail}`);
    this.name = "PagedQueryError";
    this.cause = cause;
  }
}

/**
 * Read EVERY row, paging until a short page ends it.
 *
 * Throws on the first page error rather than returning partial data — a caller
 * that wanted completeness must not be handed a silent subset. Order the query
 * by a stable unique column (`id`) so pages don't overlap or skip.
 */
export async function fetchAllRows<T>(page: PageFn<T>, label = "paged read"): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new PagedQueryError(label, error);
    if (!data) throw new PagedQueryError(label, "no rows returned");
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
    if (rows.length >= MAX_ROWS) {
      throw new PagedQueryError(
        label,
        `exceeded ${MAX_ROWS} rows — refusing to keep paging. Filter server-side.`,
      );
    }
  }
}

export interface CappedResult<T> {
  rows: T[];
  /** True when more rows exist beyond `cap` — surface this to the user. */
  truncated: boolean;
}

/**
 * One bounded read that can TELL you it was cut off: asks for `cap + 1` and
 * reports `truncated` if the extra row came back. Use where "first N" is a
 * legitimate answer, never where completeness is the point.
 */
export async function fetchCapped<T>(
  page: PageFn<T>,
  cap: number,
  label = "capped read",
): Promise<CappedResult<T>> {
  const { data, error } = await page(0, cap);
  if (error) throw new PagedQueryError(label, error);
  const rows = data ?? [];
  return rows.length > cap
    ? { rows: rows.slice(0, cap), truncated: true }
    : { rows, truncated: false };
}
