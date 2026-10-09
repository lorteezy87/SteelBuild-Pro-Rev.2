// Edge reporting is deliberately metadata-only. Neither SDK integrations nor
// caller error objects may export request content, identities, tokens or stacks.
// Reporting remains best effort, including console/SDK initialization failures.
type SafeEvent = {
  event_id: string;
  message: string;
  level: "error";
  environment: string;
  tags: Record<string, string>;
  fingerprint: string[];
};
type SentryMod = {
  init: (options: Record<string, unknown>) => void;
  captureEvent: (event: SafeEvent) => unknown;
  flush: (timeout?: number) => Promise<boolean>;
};
const FUNCTIONS = new Set(["llm-proxy", "email-ingest", "email-send", "stripe-billing", "project-export", "health", "command-center-read", "command-center-session-handoff", "account-delete", "enforce-mfa", "staging-e2e-bootstrap"]);
const EVENT_TYPES = new Set(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"]);
const ERROR_KINDS = new Set(["type_error", "syntax_error", "range_error", "operation_failed", "unknown_failure"]);
const ENVIRONMENTS = new Set(["production", "staging", "development", "test"]);
let initialized = false;
let sentryMod: SentryMod | null | undefined;
async function loadSentry(): Promise<SentryMod | null> {
  if (sentryMod !== undefined) return sentryMod;
  try { sentryMod = (await import("npm:@sentry/deno@11.4.0")) as unknown as SentryMod; }
  catch { sentryMod = null; }
  return sentryMod;
}

/** Rebuild instead of blacklisting fields. Runs after SDK scope enrichment. */
function safeEvent(input: unknown): SafeEvent | null {
  try {
    const event = input as Record<string, unknown>;
    if (!event || typeof event.event_id !== 'string' || !/^[0-9a-f]{32}$/.test(event.event_id)) return null;
    const incoming = (event.tags ?? {}) as Record<string, unknown>;
    const fn = typeof incoming.edge_function === 'string' && FUNCTIONS.has(incoming.edge_function) ? incoming.edge_function : 'unknown-edge';
    const kind = typeof incoming.error_kind === 'string' && ERROR_KINDS.has(incoming.error_kind) ? incoming.error_kind : 'unknown_failure';
    const tags: Record<string, string> = { edge_function: fn, error_kind: kind };
    if (incoming.path === '/webhook') tags.path = '/webhook';
    if (typeof incoming.event_type === 'string' && EVENT_TYPES.has(incoming.event_type)) tags.event_type = incoming.event_type;
    if (incoming.unhandled === 'true') tags.unhandled = 'true';
    return { event_id: event.event_id, message: 'Edge operation failed', level: 'error',
      environment: typeof event.environment === 'string' && ENVIRONMENTS.has(event.environment) ? event.environment : 'production',
      tags, fingerprint: ['steelbuild-edge', fn, kind, tags.path ?? 'request', tags.event_type ?? 'none'] };
  } catch { return null; }
}

export async function reportError(err: unknown, fn: string, extra?: Record<string, unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Never coerce err to a string or inspect its message, stack, cause or custom
    // name. Category derives solely from built-in classes, not caller text.
    const kind = err instanceof TypeError ? 'type_error' : err instanceof SyntaxError ? 'syntax_error'
      : err instanceof RangeError ? 'range_error' : err instanceof Error ? 'operation_failed' : 'unknown_failure';
    const event = safeEvent({ event_id: crypto.randomUUID().replaceAll('-', ''), environment: Deno.env.get('EDGE_SENTRY_ENVIRONMENT'),
      tags: { edge_function: fn, error_kind: kind, path: extra?.path, event_type: extra?.eventType, unhandled: extra?.unhandled === true ? 'true' : undefined } });
    if (!event) return;
    try { console.error('[edge-error]', event); } catch { /* logging cannot change the response */ }
    const dsn = Deno.env.get('EDGE_SENTRY_DSN');
    if (!dsn) return;
    let expired = false;
    const reporting = (async () => {
      const Sentry = await loadSentry();
      if (!Sentry || expired) return;
      if (!initialized) {
        Sentry.init({ dsn, environment: event.environment, defaultIntegrations: false,
          sendDefaultPii: false, attachStacktrace: false, maxBreadcrumbs: 0,
          tracesSampleRate: 0, tracePropagationTargets: [], enableLogs: false,
          autoSessionTracking: false, beforeBreadcrumb: () => null,
          beforeSend: safeEvent, beforeSendTransaction: () => null,
        });
        initialized = true;
      }
      Sentry.captureEvent(event);
      await Sentry.flush(2000);
    })();
    await Promise.race([reporting, new Promise<void>(resolve => {
      timer = setTimeout(() => { expired = true; resolve(); }, 2500);
    })]);
  } catch { /* never fail or echo a reporting failure */ }
  finally { clearTimeout(timer); }
}
