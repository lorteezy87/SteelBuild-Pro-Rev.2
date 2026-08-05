/*
 * SteelBuild Pro service worker — offline app-shell for the field.
 *
 * Goal: a foreman who has opened the app online can still COLD-LOAD it in a
 * dead zone (no signal) and reach the offline-capable field surfaces; the
 * existing outbox (src/lib/field/offlineQueue.js) then carries any captures
 * made while offline. This SW caches ONLY the static app shell + hashed build
 * assets — never Supabase API/auth/storage responses, never dynamic data.
 *
 * Anti-stale contract (the team fingerprints every build and is strict about
 * never serving a stale deploy — see src/main.jsx `__SBP_BUILD__` and the
 * `immutable` Cache-Control on /assets/ in vercel.json):
 *   • Navigations (HTML) are NETWORK-FIRST — a fresh deploy is always fetched
 *     when online; the cached shell is only a no-signal fallback. The SW can
 *     never pin users to an old index.html.
 *   • Hashed build assets (/assets/*.[hash].js|css) are immutable by
 *     construction, so they are served CACHE-FIRST (instant, offline-safe) and
 *     revalidated in the background. A new deploy ships new filenames → cache
 *     miss → fetched fresh. Stale entries are swept on the next cache bump.
 *   • Registration is gated to real deploys (not localhost, not protected
 *     Vercel previews) in main.jsx, so dev/HMR never runs a SW.
 *
 * Bump CACHE_VERSION whenever the caching STRATEGY changes (not per app
 * release — releases are handled by the network-first + hashed-asset rules).
 */
const CACHE_VERSION = "sbp-shell-v1";
const SHELL_URL = "/index.html";
// Best-effort precache so the very first offline boot has a shell even if the
// user never triggered a same-origin navigation while online.
const PRECACHE_URLS = [SHELL_URL, "/", "/manifest.json", "/favicon.svg", "/icon-maskable.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // allSettled: a single 404 (e.g. an icon renamed later) must not abort
      // the whole install and leave users with no SW at all.
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Static, cacheable-forever asset? Hashed build output under /assets/ plus the
// handful of static files by extension (fonts, icons, wasm live same-origin).
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|gif|ico|wasm)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only. Supabase (REST/auth/storage/realtime) and the font CDNs
  // are cross-origin and pass straight through to the network, never cached.
  if (url.origin !== self.location.origin) return;
  // Never intercept same-origin dynamic endpoints.
  if (url.pathname.startsWith("/api/")) return;

  // App-shell navigations: network-first, fall back to the cached shell so any
  // deep route (/FieldToday, …) boots offline and then client-routes.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Stash the freshest shell HTML under a stable key for offline boot.
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(SHELL_URL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  // Immutable hashed assets + static files: cache-first, revalidate in the
  // background (stale-while-revalidate) so an update lands without blocking.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            // Only cache clean, same-origin 200s (res.type "basic").
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
