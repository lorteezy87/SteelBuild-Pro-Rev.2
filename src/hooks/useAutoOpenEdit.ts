import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * useAutoOpenEdit — the read side of the `?id=<uuid>` deep-link.
 *
 * Aggregation surfaces (Field Hub, dashboards) route the user to a register
 * page with `?id=<record id>` when a row is clicked. Without this hook the
 * param is silently discarded: the tab switches but no editor opens, so
 * previously-created items look un-openable.
 *
 * Companion to `useAutoOpenCreate`, which handles `?new=1`.
 *
 * Usage:
 *
 *   const { data: items = [], isLoading } = useQuery(...);
 *   useAutoOpenEdit(items, (item) => {
 *     setEditing(item);
 *     setShowForm(true);
 *   }, { enabled: !isLoading });
 *
 * Semantics:
 *   - Waits until `enabled` (i.e. the list has settled) before acting, so a
 *     first render with an empty list can't consume the param.
 *   - Once settled: opens the matching record, or gives up if the id isn't in
 *     the list (deleted, wrong project, stale link). Either way the param is
 *     stripped, so switching tabs can't re-trigger it and a refresh can't
 *     re-open a dismissed modal.
 *   - Fires at most once per distinct id.
 */
export function useAutoOpenEdit<T extends { id?: string | null }>(
  records: T[],
  openEdit: (record: T) => void,
  options: { enabled?: boolean; param?: string } = {},
): void {
  const { enabled = true, param = "id" } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  // Keep the latest opener without making it an effect dependency — pages pass
  // an inline arrow, which would otherwise re-run this every render.
  const openRef = useRef(openEdit);
  openRef.current = openEdit;

  // The id we have already acted on. Reset when the param clears, so
  // navigating away and back to the same record re-opens it.
  const handledRef = useRef<string | null>(null);

  const id = searchParams.get(param);

  useEffect(() => {
    if (!id) {
      handledRef.current = null;
      return;
    }
    if (!enabled) return;
    if (handledRef.current === id) return;

    handledRef.current = id;

    const record = records.find((r) => r.id === id);
    if (record) openRef.current(record);

    // Strip the param either way: a miss means the link is stale, and leaving
    // `?id=` behind would make the next tab try to open it too.
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    setSearchParams(next, { replace: true });
    // `openEdit` is read through openRef; `searchParams`/`setSearchParams` are
    // stable enough that including them would only cause redundant runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled, records]);
}
