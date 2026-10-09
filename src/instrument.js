/**
 * instrument.js — Sentry initialization.
 *
 * Imported as the FIRST statement in main.jsx so the SDK is active before any
 * application code runs (per the Sentry React SDK guide). Wires error capture,
 * performance tracing. Replay and structured logs remain disabled.
 *
 * DSN resolution: the VITE_SENTRY_DSN build env var wins (set it in the
 * Cloudflare build environment to rotate/override); the DSN below is a public
 * fallback so monitoring works out of the box. A Sentry DSN is a write-only
 * ingest key designed to ship in the browser bundle — it is NOT a secret.
 *
 * DOM masking alone does not establish that URLs and other recording metadata
 * exclude private project or authentication data. Replay and logs require their
 * own reviewed sanitization and envelope acceptance before they can be enabled.
 * Error-event/breadcrumb scrubbing below remains a separate, limited boundary.
 *
 * Follow-up (optional, needs a SENTRY_AUTH_TOKEN build secret): add
 * @sentry/vite-plugin to upload source maps for readable stack traces.
 */
import * as Sentry from "@sentry/react";

const DSN =
  import.meta.env.VITE_SENTRY_DSN ||
  "https://6709c2092ebda9743a803919a79c7b46@o4511458803253248.ingest.us.sentry.io/4511458819375104";

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || undefined,
    // PII off: don't auto-attach IP address / user identifiers / request headers.
    // Never attach email, financial, document, or raw authentication data.
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.1,
    // Trace-propagation adds `sentry-trace` + `baggage` request headers to
    // matched outgoing calls. Do NOT match *.supabase.co: deployed Edge
    // Functions use a fixed Access-Control-Allow-Headers list that does not
    // include those headers, so the browser's CORS preflight fails and every
    // browser→function call is blocked ("Request header field baggage is not
    // allowed…" → "Failed to send a request to the Edge Function"). Restrict
    // propagation to our own origin; Supabase is a third party we don't need
    // to trace-link. (If function-level tracing is ever wanted, first add
    // `sentry-trace, baggage` to the functions' CORS allow-headers, then re-add
    // a target.)
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/(www\.)?steelbuild-pro\.com/,
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    // Scrub sensitive data before anything leaves the browser (M15). Query
    // strings can carry projectId / redirect targets / tokens, and Postgres
    // unique-violation messages echo the conflicting ROW VALUES ("Key
    // (project_id, name)=(<uuid>, <name>) already exists") — both are stripped
    // here so they never reach Sentry.
    beforeSend(event) {
      // Drop the query string from the request URL.
      if (event.request?.url) {
        event.request.url = event.request.url.split("?")[0];
      }
      // Redact row values embedded in Postgres unique-violation messages.
      if (event.exception?.values) {
        for (const v of event.exception.values) {
          if (typeof v.value === "string") {
            v.value = v.value.replace(/Key \(.+?\)=\(.+?\)/g, "Key (…)=(…)");
          }
        }
      }
      return event;
    },
    // Strip query strings from fetch/xhr breadcrumbs for the same reason.
    beforeBreadcrumb(breadcrumb) {
      if (
        (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") &&
        typeof breadcrumb.data?.url === "string"
      ) {
        breadcrumb.data.url = breadcrumb.data.url.split("?")[0];
      }
      return breadcrumb;
    },
  });
}

export { Sentry };
