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
 * Final envelopes are rebuilt from the reviewed error/transaction schema.
 * Auxiliary payloads and arbitrary business context are not transmitted.
 *
 * Follow-up (optional, needs a SENTRY_AUTH_TOKEN build secret): add
 * @sentry/vite-plugin to upload source maps for readable stack traces.
 */
import * as Sentry from "@sentry/react";
import { captureTelemetryAssets } from "./lib/telemetryAssetManifest";
import { createTelemetryPolicy } from "./lib/telemetryPrivacy";
import { createPrivateTelemetryTransport } from "./lib/telemetryTransport";

const DSN =
  import.meta.env.VITE_SENTRY_DSN ||
  "https://6709c2092ebda9743a803919a79c7b46@o4511458803253248.ingest.us.sentry.io/4511458819375104";

if (DSN) {
  const policy = createTelemetryPolicy({
    assets: captureTelemetryAssets(typeof document === 'undefined' ? undefined : document),
    release: import.meta.env.VITE_APP_VERSION,
    environment: import.meta.env.MODE,
    sdkVersion: Sentry.SDK_VERSION,
  });
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || undefined,
    sendDefaultPii: false,
    integrations(defaults) {
      return [...defaults.filter(integration => integration.name !== 'BrowserSession'),
        Sentry.browserTracingIntegration()];
    },
    tracesSampleRate: 0.1,
    // Keep local timing; dynamic sampling baggage can carry arbitrary span names.
    tracePropagationTargets: [],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    enableMetrics: false,
    sendClientReports: false,
    // Early scrubbing reduces retained SDK context. The transport reconstructs
    // again after SDK metadata, late hooks and attachment assembly.
    beforeSend: policy.errorEvent,
    beforeSendTransaction: policy.transactionEvent,
    beforeBreadcrumb: () => null,
    transport: createPrivateTelemetryTransport(policy),
  });
}

export { Sentry };
