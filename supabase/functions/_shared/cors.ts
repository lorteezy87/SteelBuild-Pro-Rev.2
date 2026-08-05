// Shared CORS helpers for browser-facing Edge Functions.
//
// When ALLOWED_ORIGINS is set, it is the complete allowlist. Origins are
// normalized and matched exactly; no production, localhost, or Vercel-preview
// fallback is added. When it is unset, preserve the legacy permissive behavior
// for local development and existing deployments.

const DEFAULT_ALLOWED_ORIGINS = [
  "https://steelbuild-pro.com",
  "https://www.steelbuild-pro.com",
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

function legacyOriginAllowed(origin: string): boolean {
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
}

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  const normalized = origin ? normalizeOrigin(origin) : null;
  if (!normalized) return false;

  const configured = configuredOrigins();
  return configured === null
    ? legacyOriginAllowed(normalized)
    : configured.includes(normalized);
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
  const configured = configuredOrigins();

  if (configured === null) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }

  const origin = req?.headers.get("Origin");
  const normalized = origin ? normalizeOrigin(origin) : null;
  if (normalized && configured.includes(normalized)) {
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
