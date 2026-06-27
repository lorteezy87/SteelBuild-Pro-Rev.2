import { useState, useEffect } from "react";
import { viewportWidth } from "@/lib/browser";

/**
 * useResponsiveBreakpoint — returns `isMobile` boolean (true when the
 * viewport width is below 900px). Subscribes to window `resize` events.
 *
 * Lazy initial state — viewportWidth() falls back to 0 when window is not
 * defined (vitest node env, SSR), so the first render is "not mobile" and
 * the effect below corrects it on the first client tick.
 *
 * Extracted from Layout.jsx (see git history) so the chrome JSX is
 * separable from its responsive-breakpoint plumbing.
 */
export function useResponsiveBreakpoint() {
  const [isMobile, setIsMobile] = useState(() => viewportWidth() < 900);

  useEffect(() => {
    const handler = () => setIsMobile(viewportWidth() < 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return isMobile;
}
