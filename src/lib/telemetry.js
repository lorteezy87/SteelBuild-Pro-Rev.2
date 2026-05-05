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
  } catch { /* no-op */ }
}

/** Drain the in-memory ring buffer. Used by tests. */
export function _drainBuffer() {
  const copy = buffer.slice();
  buffer.length = 0;
  return copy;
}
