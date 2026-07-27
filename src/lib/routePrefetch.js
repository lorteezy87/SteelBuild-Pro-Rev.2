/**
 * Route-level code prefetching.
 *
 * `src/config/routes.js` lazy-loads pages via `lazyWithRetry`; importing the
 * same module twice is de-duped by the browser, so calling
 * `prefetchRoute(name)` on hover/focus costs nothing after the first warm-up.
 *
 * Pages that want to participate register an importer at module init:
 *
 *   registerRoutePrefetcher("ModelViewer", () => import("@/pages/ModelViewer"));
 *
 * The consumer (sidebar link, Cmd-K result, etc.) then calls
 * `prefetchRoute("ModelViewer")` on hover. Failures are swallowed — a
 * missing registration or a network error never throws.
 */

const prefetchers = new Map();
const warmed = new Set();

export function registerRoutePrefetcher(pageName, importFn) {
  if (!pageName || typeof importFn !== "function") return;
  prefetchers.set(pageName, importFn);
}

export function prefetchRoute(pageName) {
  if (!pageName || warmed.has(pageName)) return;
  const fn = prefetchers.get(pageName);
  if (!fn) return;
  warmed.add(pageName);
  try {
    const p = fn();
    if (p && typeof p.catch === "function") p.catch(() => warmed.delete(pageName));
  } catch {
    warmed.delete(pageName);
  }
}

/**
 * Warm a batch of routes on the next idle callback — intended for the
 * "likely next navigation" routes right after the app finishes booting.
 */
export function prefetchRoutesOnIdle(pageNames) {
  if (typeof window === "undefined" || !Array.isArray(pageNames)) return;
  const run = () => pageNames.forEach(prefetchRoute);
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 2000);
  }
}

/** Test helper — clears state between runs. */
export function _resetRoutePrefetch() {
  prefetchers.clear();
  warmed.clear();
}
