import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..", "..");
const origin = "https://www.steelbuild-pro.com";

type RequestLike = { url: string; method: string; mode: string };

class CachedResponse {
  status = 200;
  type = "basic";

  constructor(readonly body: string) {}

  clone() {
    return new CachedResponse(this.body);
  }
}

function builtShell() {
  const dist = resolve(root, "dist");
  const htmlPath = resolve(dist, "index.html");
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, "utf8");
    const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map((match) => match[1]);
    const assets = [...new Set(urls)].map((url) => [url, readFileSync(resolve(dist, url.slice(1)), "utf8")] as const);
    if (assets.some(([url]) => url.endsWith(".js")) && assets.some(([url]) => url.endsWith(".css"))) {
      return { html, assets };
    }
  }

  // CI runs Vitest before the Vite build. Keep the same hashed-entry shape in
  // that order, then exercise this test against real dist output after build.
  return {
    html: '<script src="/assets/index-abc123.js"></script><link rel="stylesheet" href="/assets/index-def456.css">',
    assets: [["/assets/index-abc123.js", "built JavaScript"], ["/assets/index-def456.css", "built CSS"]] as const,
  };
}

describe("service-worker cache continuity", () => {
  it("keeps a previously loaded build usable after install, activation, and an offline reload", async () => {
    const { html, assets } = builtShell();
    const stores = new Map<string, Map<string, CachedResponse>>();
    const key = (request: string | RequestLike) => {
      const url = typeof request === "string" ? request : request.url;
      const parsed = new URL(url, origin);
      return `${parsed.pathname}${parsed.search}`;
    };
    const existing = new Map<string, CachedResponse>([
      ["/index.html", new CachedResponse(html)],
      ...assets.map(([url, body]) => [url, new CachedResponse(body)] as const),
    ]);
    stores.set("sbp-shell-v1", existing);

    let offline = false;
    const networkFetch = async (request: string | RequestLike) => {
      if (offline) throw new Error("Network unavailable");
      const path = key(request);
      return new CachedResponse(path === "/index.html" || path === "/" ? html : `online ${path}`);
    };
    const caches = {
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const entries = stores.get(name)!;
        return {
          add: async (request: string) => { entries.set(key(request), await networkFetch(request)); },
          put: async (request: string | RequestLike, response: CachedResponse) => { entries.set(key(request), response); },
        };
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (request: string | RequestLike) => {
        for (const entries of stores.values()) {
          const match = entries.get(key(request));
          if (match) return match;
        }
        return undefined;
      },
    };

    type WorkerEvent = { waitUntil?: (promise: Promise<unknown>) => void; request?: RequestLike; respondWith?: (promise: Promise<CachedResponse | undefined>) => void };
    const listeners = new Map<string, (event: WorkerEvent) => void>();
    const self = {
      location: { origin },
      addEventListener: (type: string, listener: (event: WorkerEvent) => void) => { listeners.set(type, listener); },
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    };
    runInNewContext(readFileSync(resolve(root, "public/sw.js"), "utf8"), { self, caches, fetch: networkFetch, URL });

    const lifecycle = async (type: "install" | "activate") => {
      let completion: Promise<unknown> | undefined;
      listeners.get(type)!({ waitUntil: (promise) => { completion = promise; } });
      await completion;
    };
    await lifecycle("install");
    await lifecycle("activate");
    offline = true;

    const cachedFetch = async (request: RequestLike) => {
      let response: Promise<CachedResponse | undefined> | undefined;
      listeners.get("fetch")!({ request, respondWith: (promise) => { response = promise; } });
      return response ? await response : undefined;
    };
    const navigation = await cachedFetch({ url: `${origin}/FieldToday`, method: "GET", mode: "navigate" });
    expect(navigation?.body).toBe(html);
    expect(stores.has("sbp-shell-v1"), "activation must preserve the last working asset cache").toBe(true);
    for (const [url, body] of assets) {
      const response = await cachedFetch({ url: `${origin}${url}`, method: "GET", mode: "no-cors" });
      expect(response?.body, `${url} should remain available offline`).toBe(body);
    }
  });
});
