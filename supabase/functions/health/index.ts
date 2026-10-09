// Public data-free liveness (?mode=live) and bounded default readiness.
// Short per-isolate caching is not a global rate limiter; configure probe throttling separately.
import "jsr:@supabase/functions-js@2.117.2/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

type DatabaseStatus = "ok" | "down" | "unconfigured";
let cached: { db: DatabaseStatus; expiresAt: number } | null = null;
let pending: Promise<DatabaseStatus> | null = null;

async function databaseReadiness(): Promise<DatabaseStatus> {
  if (cached && cached.expiresAt > Date.now()) return cached.db;
  if (pending) return pending;
  pending = (async () => {
    let db: DatabaseStatus = "unconfigured";
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (url && key) {
      try {
        // HEAD returns no rows. One total deadline, no provider retries.
        const response = await fetch(`${url}/rest/v1/feature_flags?select=id&limit=1`, {
          method: "HEAD", redirect: "error", signal: AbortSignal.timeout(3_000),
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        db = response.ok ? "ok" : "down";
      } catch { db = "down"; }
    }
    cached = { db, expiresAt: Date.now() + (db === "ok" ? 5_000 : 2_000) };
    return db;
  })();
  try { return await pending; } finally { pending = null; }
}

Deno.serve(async req => {
  const headers = { ...corsHeaders(req, "GET, HEAD, OPTIONS"), "content-type": "application/json", "cache-control": "no-store" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...headers, Allow: "GET, HEAD, OPTIONS" } });
  }
  const started = Date.now();
  if (new URL(req.url).searchParams.get("mode") === "live") {
    return new Response(req.method === "HEAD" ? null : JSON.stringify({ status: "ok", db: "not_checked" }), { headers });
  }
  const db = await databaseReadiness();
  const body = { status: db === "ok" ? "ok" : "degraded", db, latency_ms: Date.now() - started, time: new Date().toISOString() };
  return new Response(req.method === "HEAD" ? null : JSON.stringify(body), { status: db === "ok" ? 200 : 503, headers });
});
