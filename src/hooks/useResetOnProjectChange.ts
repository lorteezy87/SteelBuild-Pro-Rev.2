import { useEffect, useRef } from "react";

/**
 * useResetOnProjectChange — close modals / clear edit state when the
 * active project switches so drawers don't keep showing the previous
 * project's record.
 *
 * Fires `onReset` only when `projectId` actually changes (not on mount).
 *
 * Usage:
 *   useResetOnProjectChange(projectId, () => {
 *     setShowForm(false);
 *     setEditing(null);
 *   });
 */
export function useResetOnProjectChange(
  projectId: string | null | undefined,
  onReset: () => void,
): void {
  const prevRef = useRef(projectId);
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    if (prevRef.current === projectId) return;
    prevRef.current = projectId;
    onResetRef.current();
  }, [projectId]);
}
