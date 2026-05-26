/**
 * Lightweight error telemetry shim.
 *
 * Right now this only logs to the console + a ring buffer that survives in
 * `window.__sbpErrorLog` (handy for debugging in production). When we wire
 * a real provider (Sentry, Logtail, Supabase Edge Function, …) we plug it
 * in here and every ErrorBoundary, mutation, and toast gets coverage for
 * free.
 */

const MAX_BUFFER = 50;
const buffer = [];

// ── Optional Sentry forwarder (env-gated, lazy) ──────────────────────────
// The @sentry/react SDK is imported ONLY when VITE_SENTRY_DSN is set, so a
// build/runtime without a DSN never loads it (zero overhead). initTelemetry()
// is called once from main.jsx; logError/logEvent forward to Sentry when it's
// active. Telemetry must never break the app, so all of this is best-effort.
let sentry = null;
let sentryInitStarted = false;

export async function initTelemetry() {
  if (sentryInitStarted) return;
  sentryInitStarted = true;
  let dsn;
  try { dsn = import.meta.env?.VITE_SENTRY_DSN; } catch { dsn = undefined; }
  if (!dsn) return; // no DSN configured → Sentry SDK is never loaded
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: (typeof import.meta !== "undefined" && import.meta.env?.MODE) || "production",
      release: import.meta.env?.VITE_SENTRY_RELEASE || undefined,
      tracesSampleRate: Number(import.meta.env?.VITE_SENTRY_TRACES_RATE ?? 0.1),
      sendDefaultPii: false,
    });
    sentry = Sentry;
  } catch (err) {
    console.warn("[telemetry] Sentry init skipped:", err?.message || err);
  }
}

function pushBuffer(entry) {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  if (typeof window !== "undefined") {
    window.__sbpErrorLog = buffer;
  }
}

function safeStringify(value) {
  if (value == null) return null;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "object") {
    try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
  }
  return value;
}

/**
 * Log a caught error with optional structured context. Safe to call during
 * render error boundaries — never throws.
 */
export function logError(error, context = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      url: typeof window !== "undefined" ? window.location?.href : null,
      error: safeStringify(error),
      context: safeStringify(context),
    };
    pushBuffer(entry);
    // Loud console.error so it shows up in dev tools and any log forwarder
    // hooked into the console (e.g. LogRocket, Sentry's BrowserTracing).

    console.error("[telemetry]", entry);
    // Forward to Sentry when configured (no-op until a DSN is set).
    if (sentry) {
      if (error instanceof Error) {
        sentry.captureException(error, { extra: { ...context, url: entry.url } });
      } else {
        sentry.captureMessage(String(error?.message || error || "Unknown error"), {
          level: "error",
          extra: { ...context, url: entry.url, error: entry.error },
        });
      }
    }
  } catch {
    /* never throw from telemetry */
  }
}

/**
 * Lightweight breadcrumb logger for non-fatal events. Same buffer, lower
 * severity. Use this for things like "user opened FabRelease" or "drawing
 * upload skipped scanned PDF" so when an error fires we have context.
 */
export function logEvent(name, data = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      name: String(name || "event"),
      data: safeStringify(data),
    };
    pushBuffer({ event: entry });

    if (typeof console !== "undefined" && console.debug) console.debug("[event]", entry);
    // Breadcrumb so Sentry has context leading up to any captured error.
    if (sentry) sentry.addBreadcrumb({ message: entry.name, data: entry.data, level: "info" });
  } catch { /* no-op */ }
}

/** Drain the in-memory ring buffer. Used by tests. */
export function _drainBuffer() {
  const copy = buffer.slice();
  buffer.length = 0;
  return copy;
}
