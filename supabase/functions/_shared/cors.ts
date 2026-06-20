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
// Allowlist = baked production defaults ∪ localhost (any port) ∪ *.vercel.app
// preview deploys, OVERRIDABLE via the ALLOWED_ORIGINS env (comma-separated; set
// it to "*" as an escape hatch to fully open CORS without a redeploy).

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

function configuredOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  const configured = configuredOrigins();
  if (configured.includes("*")) return true;
  if (configured.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

/** Canonical production origin — the safe fallback for a disallowed request. */
export function primaryOrigin(): string {
  const firstExact = configuredOrigins().find(
    (o) => o !== "*" && /^https?:\/\//.test(o),
  );
  return firstExact || "https://steelbuild-pro.com";
}

export function corsHeaders(req?: Request): Record<string, string> {
  // No request context: response helpers default to "*". The preflight (which
  // always gets the req) is where cross-origin browsers are gated, so a POST
  // response staying "*" is safe (no cookies; a blocked origin never reaches here).
  if (!req) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
  }
  const origin = req.headers.get("Origin") || "";
  const allow = isAllowedOrigin(origin) ? origin : primaryOrigin();
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
