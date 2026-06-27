import { useEffect } from "react";

/**
 * useGlobalSearchShortcut — listens for Cmd/Ctrl+K and calls
 * `setOpen(true)` when pressed. Used to open the global search modal.
 *
 * `setOpen` should be a stable setter (e.g. the second value from
 * `useState`) so the listener is attached once on mount.
 *
 * Extracted from Layout.jsx (see git history) so the chrome JSX is
 * separable from its keyboard-shortcut plumbing.
 */
export function useGlobalSearchShortcut(setOpen) {
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);
}
