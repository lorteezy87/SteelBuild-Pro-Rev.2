/**
 * Idle-time preloader for heavy viewer assets.
 *
 * Pages.config.js eagerly imports every page component, so JS prefetching
 * is unnecessary. What IS expensive is the runtime worker + wasm payload
 * for the 3D and PDF viewers — these aren't fetched until the user navigates
 * to a page that uses them, which adds 2-3s of latency the first time.
 *
 * We warm them on the next requestIdleCallback so the second navigation
 * to ModelViewer / DrawingViewer is instant. All fetches are passive
 * (`as=fetch`, no-cache OK), so failures here never block the app.
 */

const HEAVY_ASSETS = [
  // PDF viewer (DrawingViewer)
  { href: "/thatopen/fragments-worker.mjs", as: "fetch" },
  // 3D viewer (ModelViewer) — IFC parser & worker
  { href: "/wasm/web-ifc.wasm",            as: "fetch" },
  { href: "/wasm/web-ifc-mt.wasm",         as: "fetch" },
  { href: "/wasm/web-ifc-mt.worker.js",    as: "fetch" },
];

let preloaded = false;

function injectLink({ href, as }) {
  try {
    if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    link.as = as;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  } catch { /* never throw from preload */ }
}

/**
 * Schedule preloads after the app has settled. Safe to call multiple
 * times — only runs once per page load.
 */
export function preloadHeavyAssets() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;
  const run = () => HEAVY_ASSETS.forEach(injectLink);
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 2000);
  }
}
