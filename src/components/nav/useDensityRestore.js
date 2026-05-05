import { useEffect } from "react";

/**
 * useDensityRestore — on mount, reads the saved density preference from
 * localStorage (`sbp-density`) and applies it to <html data-density="...">.
 *
 * Silently ignores localStorage failures (private mode, blocked storage,
 * SSR with no window) so the layout still renders.
 *
 * Extracted from Layout.jsx (see git history) so the chrome JSX is
 * separable from its preference-restore plumbing.
 */
export function useDensityRestore() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sbp-density");
      if (saved) document.documentElement.setAttribute("data-density", saved);
    } catch { /* ignore */ }
  }, []);
}
