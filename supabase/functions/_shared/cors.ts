// Shared CORS helpers for browser-facing Edge Functions.
//
// When ALLOWED_ORIGINS is set, it is the complete allowlist. Origins are
// normalized and matched exactly.
//
// When it is UNSET we fall back to DEFAULT_ALLOWED_ORIGINS — the production
// hostnames plus loopback for `supabase functions serve`. This used to fall
// back to `Access-Control-Allow-Origin: *` plus a `^https://[a-z0-9-]+\.vercel\.app$`
// regex, which was two separate holes:
//
//   • `*` let any site on the internet script a call with a token it had
//     obtained, against every browser-facing function.
//   • the Vercel regex matched ANY Vercel account's deployment, not ours. Since
//     stripe-billing feeds isAllowedOrigin() straight into the Checkout
//     success/cancel and billing-portal return URLs, an attacker could stand up
//     `<anything>.vercel.app` and become a post-payment redirect target.
//
// Both are gone. The fallback is now a fixed, reviewable list, so an unset
// secret degrades to "production + localhost only" instead of "anyone". To add
// a preview host, name it explicitly in the ALLOWED_ORIGINS secret — never a
// pattern. (Nothing here is an authorization control; RLS and the per-function
// JWT checks still are. CORS just stops the browser being the attacker's
// delivery vehicle.)
//
// The iOS app is the one non-http(s) origin. Capacitor serves the bundled web
// app from `capacitor://localhost` and WKWebView sends exactly that as Origin;
// before it was listed here every call the app made to these functions was
// refused. A web page cannot present that origin, so allowing it opens nothing
// to the web. WHATWG URL gives a custom scheme an opaque "null" origin, so it is
// matched as an exact string and never parsed.

export const IOS_APP_ORIGIN = "capacitor://localhost";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://steelbuild-pro.com",
  "https://www.steelbuild-pro.com",
  IOS_APP_ORIGIN,
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
];

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-auth, sentry-trace, baggage, stripe-signature, x-webhook-secret";

function configuredOrigins(): string[] | null {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw || raw.trim() === "") return null;
  return parseAllowedOrigins(raw);
}

function normalizeOrigin(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw === "*") return null;
  if (raw.toLowerCase() === IOS_APP_ORIGIN) return IOS_APP_ORIGIN;

  try {
    const url = new URL(raw);
    if (!(url.protocol === "http:" || url.protocol === "https:")) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(
    raw
      .split(",")
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  )];
}

/**
 * The effective allowlist: the ALLOWED_ORIGINS secret when set, else the fixed
 * default list. Never a pattern, never `*`.
 */
function effectiveOrigins(): string[] {
  return configuredOrigins() ?? DEFAULT_ALLOWED_ORIGINS;
}

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  const normalized = origin ? normalizeOrigin(origin) : null;
  if (!normalized) return false;
  return effectiveOrigins().includes(normalized);
}

/**
 * True for the native app's origin. It may call these functions, but it is not
 * a web page, so it must never become a redirect target (Stripe return URLs).
 */
export function isNativeAppOrigin(origin: string | null | undefined): boolean {
  return (origin ?? "").trim().toLowerCase() === IOS_APP_ORIGIN;
}

export function corsHeaders(
  req?: Request,
  methods = "POST, OPTIONS",
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": methods,
    "Vary": "Origin",
  };
  // Reflect the caller's origin only when it is on the allowlist. A disallowed
  // or missing Origin gets NO Access-Control-Allow-Origin header at all, which
  // the browser treats as a refusal — the previous `*` fallback is gone.
  const origin = req?.headers.get("Origin");
  const normalized = origin ? normalizeOrigin(origin) : null;
  if (normalized && effectiveOrigins().includes(normalized)) {
    headers["Access-Control-Allow-Origin"] = normalized;
  }
  return headers;
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
