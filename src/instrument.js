/**
 * instrument.js — Sentry initialization.
 *
 * Imported as the FIRST statement in main.jsx so the SDK is active before any
 * application code runs (per the Sentry React SDK guide). Wires error capture,
 * performance tracing, and session replay (fully masked).
 *
 * DSN resolution: the VITE_SENTRY_DSN env var wins (set it in the Vercel
 * project env to rotate/override); the project DSN below is a safe public
 * fallback so monitoring works out of the box. A Sentry DSN is a write-only
 * ingest key designed to ship in the browser bundle — it is NOT a secret.
 *
 * Privacy: replayIntegration runs with maskAllText + blockAllMedia, so session
 * replays show layout/interactions but never readable project/financial
 * content. Sampling is production-tuned (10% traces, 10% sessions, 100% of
 * error sessions).
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
    sendDefaultPii: true,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    // Trace-propagation adds `sentry-trace` + `baggage` request headers to
    // matched outgoing calls. Do NOT match *.supabase.co: the Edge Functions
    // (llm-proxy, schedule-assistant, bluebeam/sharepoint-proxy, email-send)
    // use a fixed Access-Control-Allow-Headers list that does not include those
    // headers, so the browser's CORS preflight fails and every browser→function
    // call is blocked ("Request header field baggage is not allowed…" →
    // "Failed to send a request to the Edge Function"). Restrict propagation to
    // our own origin; Supabase is a third party we don't need to trace-link.
    // (If function-level tracing is ever wanted, first add `sentry-trace,
    // baggage` to the functions' CORS allow-headers, then re-add a target.)
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/(www\.)?steelbuild-pro\.com/,
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
  });
}

export { Sentry };
