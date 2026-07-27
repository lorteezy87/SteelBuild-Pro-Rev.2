// Shared edge-function error reporting (audit M13).
//
// Every production edge function previously only `console.error`'d into
// Supabase's short-retention log explorer. Machine-to-machine paths
// (stripe-billing /webhook, email-ingest) have no human user to notice a
// failure, so billing drift / broken email pipelines could go unnoticed.
//
// This helper keeps the Supabase log line AND best-effort forwards to
// Sentry when `EDGE_SENTRY_DSN` is set (`supabase secrets set EDGE_SENTRY_DSN=…`).
// Reporting failures must NEVER fail the request.
//
// Sentry is loaded via dynamic import so local Vitest can exercise the
// no-DSN / import-failure paths without resolving `npm:@sentry/deno`.

type SentryMod = {
  init: (opts: { dsn: string; environment?: string; tracesSampleRate?: number }) => void;
  captureException: (
    err: unknown,
    hint?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
  ) => void;
  flush: (timeout?: number) => Promise<boolean>;
};

let initialized = false;
let sentryMod: SentryMod | null | undefined;

async function loadSentry(): Promise<SentryMod | null> {
  if (sentryMod !== undefined) return sentryMod;
  try {
    sentryMod = (await import("npm:@sentry/deno")) as SentryMod;
  } catch {
    sentryMod = null;
  }
  return sentryMod;
}

/**
 * Log + optionally capture an exception. Safe to await in top-level catches;
 * never throws.
 */
export async function reportError(
  err: unknown,
  fn: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[${fn}]`, message, stack || "", extra ?? "");

  try {
    const dsn = Deno.env.get("EDGE_SENTRY_DSN") ?? "";
    if (!dsn) return;

    const Sentry = await loadSentry();
    if (!Sentry) return;

    if (!initialized) {
      Sentry.init({
        dsn,
        environment: Deno.env.get("EDGE_SENTRY_ENVIRONMENT") ?? "production",
        tracesSampleRate: 0,
      });
      initialized = true;
    }

    Sentry.captureException(err instanceof Error ? err : new Error(message), {
      tags: { edge_function: fn },
      extra,
    });
    await Sentry.flush(2000);
  } catch {
    // never fail the request on telemetry
  }
}
