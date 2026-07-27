import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * useAutoOpenCreate — when a caller navigates to a page with `?new=1`,
 * fire the page's create-modal opener once on mount and strip the param
 * from the URL so a refresh doesn't re-open the modal.
 *
 * Usage:
 *
 *   useAutoOpenCreate(() => {
 *     setEditing(null);
 *     setShowForm(true);
 *   });
 *
 * Optionally gate on a precondition (e.g. project must be selected):
 *
 *   useAutoOpenCreate(() => setShowForm(true), { enabled: !!projectId });
 *
 * Notes:
 *   - The opener fires only on the first render where `?new=1` is present
 *     AND `enabled` is true. After that, the param is stripped and
 *     subsequent renders are no-ops.
 *   - URL replacement uses `replace: true` so the back button doesn't take
 *     the user to the same URL with `?new=1` and re-trigger the open.
 */
export function useAutoOpenCreate(
  openCreate: () => void,
  options: { enabled?: boolean } = {},
): void {
  const { enabled = true } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!enabled) return;
    if (searchParams.get("new") !== "1") return;

    openCreate();

    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
    // The opener and setSearchParams are intentionally not in the deps:
    // we want this to fire exactly once when ?new=1 is detected with
    // enabled=true. Re-firing when the page re-renders would re-open the
    // modal after the user dismissed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
