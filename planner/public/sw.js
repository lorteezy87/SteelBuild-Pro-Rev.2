const CACHE_NAME = "sbp-planner-shell-v2";
const SHELL = ["/index.html", "/manifest.webmanifest", "/planner-icon.svg", "/planner-icon-maskable.svg"];
const HASHED_ASSET_PATH = /^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(?:css|js|mjs|woff2?|svg|png|webp)$/;

const isCacheableStaticAsset = (request, url) => url.origin === self.location.origin
  && HASHED_ASSET_PATH.test(url.pathname)
  && !request.headers.has("authorization");
const isSensitiveRequest = (request, url) => url.origin !== self.location.origin
  || url.pathname.startsWith("/api/")
  || url.pathname.startsWith("/auth/")
  || request.headers.has("authorization");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isSensitiveRequest(request, url)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/index.html")) || Response.error()));
    return;
  }
  if (isCacheableStaticAsset(request, url)) {
    event.respondWith(caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }));
  }
});
