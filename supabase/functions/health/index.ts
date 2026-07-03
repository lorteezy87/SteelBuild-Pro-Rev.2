// ─────────────────────────────────────────────────────────────────────────────
// health — Supabase Edge Function (H7)
//
// Unauthenticated liveness/readiness probe for uptime monitoring. Returns 200
// with { status:"ok", db:"ok" } when the API can reach Postgres, or 503
// { status:"degraded", db:"down" } when it cannot. No project data is returned
// (a head-only query is used purely to confirm reachability), so the endpoint is
// safe to expose to an external monitor (Better Stack / Pingdom / UptimeRobot).
//
// Self-contained (permissive CORS inlined) — a health probe should carry no
// shared dependencies and no secrets. It is a public, data-free endpoint.
//
// Auth: none (deploy with --no-verify-jwt). Method: GET or HEAD.
// Secrets used: SUPABASE_URL + SUPABASE_ANON_KEY (already in the runtime).
//
// Deploy:
//   npx supabase functions deploy health --project-ref kjrwqagyeswwoxpjkcko --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.47";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const started = Date.now();
  let db: "ok" | "down" | "unconfigured" = "unconfigured";

  try {
    const url = Deno.env.get("SUPABASE_URL");
    // Service role for a pure liveness head-query: it must not depend on anon
    // table grants/RLS (a probe should test reachability, not authorization).
    // head:true returns NO rows, so no project data is ever exposed.
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await sb.from("feature_flags").select("id", { head: true }).limit(1);
      db = error ? "down" : "ok";
    }
  } catch {
    db = "down";
  }

  const ok = db === "ok";
  const body = {
    status: ok ? "ok" : "degraded",
    db,
    latency_ms: Date.now() - started,
    time: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 503,
    headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
  });
});
