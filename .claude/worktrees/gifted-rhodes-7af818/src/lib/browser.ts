/**
 * SSR / test-safe accessors for browser globals.
 *
 * Use these instead of touching `window`, `document`, or `navigator`
 * directly at module load, in `useState` initial values, or in render.
 * Those code paths can run under vitest's node environment or any future
 * SSR pre-render and will throw with a "window is not defined" before the
 * component even mounts.
 *
 * Inside `useEffect`, event handlers, and async callbacks, direct global
 * access is fine — those code paths only run in the browser. This module
 * exists for the render-time and module-init paths that don't have that
 * guarantee.
 */

export const isBrowser: boolean = typeof window !== "undefined";

/**
 * Read viewport width with a safe fallback (default 0). Use as a lazy
 * initial-state value: `useState(() => viewportWidth() < 900)`.
 *
 * The fallback only matters for the first render under a non-browser
 * environment. The first useEffect on the client immediately overwrites
 * the value with the real measurement.
 */
export function viewportWidth(fallback = 0): number {
  return isBrowser ? window.innerWidth : fallback;
}

/**
 * True when the user is on a Mac/iOS platform — used to choose between
 * "⌘K" and "Ctrl+K" labels in keyboard-shortcut tooltips.
 *
 * `navigator.platform` is deprecated but is still the most reliable
 * Cmd-vs-Ctrl signal across Firefox and Safari (userAgentData.platform
 * isn't shipped there yet). We fall back to `userAgent` to catch the
 * same platforms when `platform` is absent.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  return /Mac|iPhone|iPad/.test(platform) || /Mac|iPhone|iPad/.test(ua);
}

/**
 * Format a keyboard-shortcut label using the platform's modifier key.
 * Example: shortcutKeyLabel("K") → "⌘K" on Mac, "Ctrl+K" elsewhere.
 */
export function shortcutKeyLabel(suffix: string): string {
  return isMacPlatform() ? `⌘${suffix}` : `Ctrl+${suffix}`;
}
