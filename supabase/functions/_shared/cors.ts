// Shared CORS helpers for browser-facing edge functions (#11).
//
// CORS is defense-in-depth here: these functions authenticate via a Bearer JWT
// in the Authorization header (NOT cookies), so a cross-origin page can't ride a
// victim's session even with `Access-Control-Allow-Origin: *`. Still, we gate the
// PREFLIGHT to the known app origins so a stray site can't probe the endpoints
// from a browser.
//
// Enforcement model: the OPTIONS preflight response (which receives the request)
// echoes the Origin only when it's allowed; a disallowed origin gets the canonical
// production origin instead, so the browser's preflight fails and the real request
// is never sent. Non-preflight responses (jsonResponse/errorResponse called
// WITHOUT a req) keep "*", which is safe — a disallowed origin never gets past
// preflight in a browser, and there are no cookies to protect.
//
// OPT-IN: CORS is permissive ("*") by default and ONLY enforced when
// ALLOWED_ORIGINS is explicitly set to real origins (comma-separated, non-"*").
// This avoids the failure mode where a too-narrow baked default silently blocks a
// legitimate app origin. When enforced, the allowed set is the baked production
// defaults ∪ ALLOWED_ORIGINS entries ∪ localhost (any port) ∪ *.vercel.app
// previews. ALLOWED_ORIGINS="*" (or unset) = fully permissive.

const DEFAULT_ALLOWED_ORIGINS = [
  "https://steelbuild-pro.com",
  "https://www.steelbuild-pro.com",
];

// Superset of headers used across all browser-facing functions (llm-proxy needs
// sentry-trace/baggage; stripe-billing needs stripe-signature; email-ingest uses
// x-webhook-secret on its own CORS block). A permissive Allow-Headers list is not
// a security risk — the Origin gate above is what matters.
const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, sentry-trace, baggage, stripe-signature, x-webhook-secret";

// Explicit, non-"*" origins configured via env — ADDITIONS to the baked defaults.
function envOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return [];
  return raw.split(",").map((o) => o.trim()).filter((o) => o && o !== "*");
}

// CORS is ENFORCED only when ALLOWED_ORIGINS is explicitly set to something other
// than "*". Unset (or "*") → permissive ("*"), so a too-narrow baked list can
// never silently block a real app origin (the failure mode that took down AI
// calls once). To opt into the lockdown, set ALLOWED_ORIGINS to your real origins.
function corsLockedDown(): boolean {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  return !!raw && raw.trim() !== "*";
}

// Is `origin` a known, legitimate app origin? ALWAYS strict — baked defaults + env
// additions + localhost + *.vercel.app. Independent of the CORS permissive default:
// used for redirect-target validation (#12), which must stay bounded even when CORS
// is wide open (a "*" env does NOT make this return true for arbitrary origins).
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;
  if (envOrigins().includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

export function corsHeaders(req?: Request): Record<string, string> {
  // Permissive unless explicitly locked down (and for response helpers with no
  // req). The preflight — which has the req — is where a locked-down config gates
  // cross-origin browsers; non-preflight responses staying "*" is safe (bearer-
  // token auth, no cookies).
  if (!req || !corsLockedDown()) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
  }
  const origin = req.headers.get("Origin") || "";
  const allow = isAllowedOrigin(origin)
    ? origin
    : (DEFAULT_ALLOWED_ORIGINS[0] || "https://steelbuild-pro.com");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, message: string, req?: Request): Response {
  return jsonResponse({ error: message }, status, req);
}
