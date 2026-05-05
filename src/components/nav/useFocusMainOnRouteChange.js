import React, { useEffect } from "react";

/**
 * useFocusMainOnRouteChange — moves keyboard focus back to <main
 * id="main-content"> on every route change so screen readers and tab
 * users land on the new page's content.
 *
 * Skips the very first render (otherwise the initial mount would steal
 * focus from whatever was naturally focused) and skips any change where
 * the active element is a form input on the new page (otherwise typing
 * gets yanked away mid-keystroke).
 *
 * Extracted from Layout.jsx (see git history) so the chrome JSX is
 * separable from its accessibility plumbing.
 */
export function useFocusMainOnRouteChange(currentPageName) {
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const el = typeof document !== "undefined" ? document.getElementById("main-content") : null;
    if (!el) return;
    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
  }, [currentPageName]);
}
