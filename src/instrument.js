/**
 * instrument.js — Sentry initialization.
 *
 * Imported as the FIRST statement in main.jsx so the SDK is active before any
 * application code runs (per the Sentry React SDK guide). Wires error capture,
 * performance tracing with an allowlisted telemetry payload.
 *
 * DSN resolution: the VITE_SENTRY_DSN build env var wins (set it in the
 * publishing environment to rotate/override); the project DSN below is a safe public
 * fallback so monitoring works out of the box. A Sentry DSN is a write-only
 * ingest key designed to ship in the browser bundle — it is NOT a secret.
 *
 * Replay is disabled: DOM masking does not remove callback URLs or signed
 * attachment links from recording metadata. Re-enabling it requires separate
 * recording/envelope sanitization and synthetic-secret acceptance tests.
 *
 * Follow-up (optional, needs a SENTRY_AUTH_TOKEN build secret): add
 * @sentry/vite-plugin to upload source maps for readable stack traces.
 */
import * as Sentry from "@sentry/react";
import { rejectImplicitAuthCallback } from "@/lib/authCallbackPolicy";

// Reject bearer callbacks before monitoring can observe the browser location.
rejectImplicitAuthCallback();

import { sanitizeBreadcrumb, sanitizeTelemetryEvent, sanitizeTelemetrySpan, telemetryPrivacyIntegration } from './lib/telemetryPrivacy';

const DSN =
  import.meta.env.VITE_SENTRY_DSN ||
  "https://6709c2092ebda9743a803919a79c7b46@o4511458803253248.ingest.us.sentry.io/4511458819375104";

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.VITE_DEPLOY_ENV || import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || undefined,
    // PII off: don't auto-attach IP address / user identifiers / request headers.
    sendDefaultPii: false,
    integrations: defaults => [
      telemetryPrivacyIntegration(),
      ...defaults.filter(integration => integration.name !== 'BrowserSession'),
      Sentry.browserTracingIntegration({ enableInp: false }),
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
    beforeSend: sanitizeTelemetryEvent,
    beforeBreadcrumb: sanitizeBreadcrumb,
    beforeSendTransaction: sanitizeTelemetryEvent,
    // Standalone spans are sent through a different envelope than transactions.
    beforeSendSpan: sanitizeTelemetrySpan,
  });
}

export { Sentry };
