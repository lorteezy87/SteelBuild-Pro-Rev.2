/**
 * Lightweight error telemetry shim — LOCAL ring buffer only.
 *
 * Keeps the last N errors/events in `window.__sbpErrorLog` (handy for debugging
 * in production via devtools). This is deliberately NOT wired to Sentry:
 * Sentry initialisation lives in `src/instrument.js` (imported first in
 * main.jsx), whose default integrations already capture window.onerror /
 * unhandledrejection, and the ErrorBoundaries call `Sentry.captureException`
 * directly for React render errors. Forwarding logError() here too would
 * double-report. Use this buffer for the in-page debug log; use Sentry for
 * aggregation/alerting.
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

// Callers often pass full project/email records as context; redact known
// sensitive keys so financial / document / PII data can't surface in
// window.__sbpErrorLog (readable in browser devtools).
const SENSITIVE_KEYS = new Set([
  "body_html", "body_text", "amount", "contract_value", "file_url",
  "storage_path", "email", "recipients", "cc", "bcc",
  "password", "token", "api_key", "secret",
]);

function scrubSensitive(value) {
  if (Array.isArray(value)) return value.map(scrubSensitive);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key) ? "[redacted]" : scrubSensitive(val);
    }
    return out;
  }
  return value;
}

function safeStringify(value) {
  if (value == null) return null;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "object") {
    try { return scrubSensitive(JSON.parse(JSON.stringify(value))); } catch { return String(value); }
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
    // hooked into the console.

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
