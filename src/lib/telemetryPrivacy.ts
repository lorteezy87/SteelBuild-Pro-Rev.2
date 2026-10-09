import type { Breadcrumb, Event } from '@sentry/react';
import type { Integration } from '@sentry/core';
import { redactUrl } from './authCallbackPolicy';

const safeMethod = (value: unknown) => typeof value === 'string' && /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(value) ? value : undefined;

/** Covers standalone span envelopes as well as spans attached to transactions. */
export function sanitizeTelemetrySpan<T extends object>(span: T): T {
  const allowed = new Set(['span_id', 'trace_id', 'parent_span_id', 'start_timestamp', 'timestamp']);
  for (const key of Object.keys(span)) if (!allowed.has(key)) Reflect.deleteProperty(span, key);
  return span;
}

/** Keep operational timing/navigation; arbitrary console, DOM text and payloads stay local. */
export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (!['fetch', 'xhr', 'navigation'].includes(breadcrumb.category || '')) return null;
  const data: Record<string, string | number> = {};
  for (const key of ['url', 'from', 'to']) {
    const value: unknown = breadcrumb.data?.[key];
    if (typeof value === 'string') data[key] = redactUrl(value);
  }
  const method = safeMethod(breadcrumb.data?.method);
  if (method) data.method = method;
  if (typeof breadcrumb.data?.status_code === 'number') data.status_code = breadcrumb.data.status_code;
  return { category: breadcrumb.category, type: breadcrumb.type, timestamp: breadcrumb.timestamp, level: breadcrumb.level, data };
}

/** Deny arbitrary business context. Stack location, trace IDs, release and timing remain useful. */
export function sanitizeTelemetryEvent<T extends Event>(event: T): T {
  // Remove unknown SDK/caller fields too, including future context channels.
  const allowed = new Set(['event_id', 'start_timestamp', 'timestamp', 'platform', 'level', 'release', 'environment', 'type', 'transaction', 'contexts', 'request', 'exception', 'breadcrumbs', 'spans', 'tags']);
  for (const key of Object.keys(event)) if (!allowed.has(key)) Reflect.deleteProperty(event, key);
  delete event.extra;
  delete event.user;
  const tags = event.tags;
  event.tags = {};
  if (['ios', 'android', 'web'].includes(String(tags?.platform))) event.tags.platform = tags?.platform;
  for (const key of ['app_version', 'app_build']) {
    if (typeof tags?.[key] === 'string' && /^\d+(?:\.\d+){0,3}$/.test(tags[key])) event.tags[key] = tags[key];
  }
  delete event.message;
  delete event.logentry;
  delete event.fingerprint;
  delete event.threads;
  const trace = event.contexts?.trace;
  event.contexts = trace ? { trace: { trace_id: trace.trace_id, span_id: trace.span_id,
    parent_span_id: trace.parent_span_id, op: trace.op, status: trace.status } } : {};
  if (event.request) event.request = { url: event.request.url ? redactUrl(event.request.url) : undefined, method: safeMethod(event.request.method) };
  if (event.transaction && event.transaction !== 'Application transaction') event.transaction = redactUrl(event.transaction);
  // beforeSendSpan also processes the root transaction span. Its arbitrary
  // description is removed, so provide the required, non-sensitive name.
  if (event.type === 'transaction' && !event.transaction) event.transaction = 'Application transaction';
  for (const exception of event.exception?.values ?? []) {
    // SDK exceptions often contain database row values or provider payloads.
    // Grouping remains stack based; no arbitrary exception text is transmitted.
    const exceptionFields = new Set(['type', 'value', 'stacktrace']);
    for (const key of Object.keys(exception)) if (!exceptionFields.has(key)) Reflect.deleteProperty(exception, key);
    exception.type = ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'URIError', 'EvalError', 'AbortError'].includes(exception.type || '') ? exception.type : 'Error';
    exception.value = 'Application error; sensitive details omitted';
    if (exception.stacktrace) {
      const frames = exception.stacktrace.frames;
      exception.stacktrace = { frames };
    }
    for (const frame of exception.stacktrace?.frames ?? []) {
      const frameFields = new Set(['filename', 'abs_path', 'function', 'lineno', 'colno', 'in_app']);
      for (const key of Object.keys(frame)) if (!frameFields.has(key)) Reflect.deleteProperty(frame, key);
      if (frame.filename) frame.filename = redactUrl(frame.filename);
      if (frame.abs_path) frame.abs_path = redactUrl(frame.abs_path);
      delete frame.vars;
      delete frame.pre_context;
      delete frame.post_context;
      delete frame.context_line;
    }
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb).filter((value): value is Breadcrumb => value !== null);
  for (const span of event.spans ?? []) {
    sanitizeTelemetrySpan(span);
  }
  return event;
}

/** The SDK builds standalone trace headers and session/attachment items outside
 * beforeSend. Guard the final envelope as well; unknown channels fail closed. */
export type TelemetryEnvelope = [Record<string, unknown>, Array<[{ type: string }, unknown]>];
export function sanitizeTelemetryEnvelope(envelope: TelemetryEnvelope): void {
  // Dynamic sampling headers can contain the original, unsanitized span name.
  // Error and span bodies retain their trace/span IDs for safe correlation.
  delete envelope[0].trace;
  const retained: TelemetryEnvelope[1] = [];
  for (const [header, payload] of envelope[1]) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload instanceof Uint8Array) continue;
    if (header.type === 'event' || header.type === 'transaction') {
      sanitizeTelemetryEvent(payload as Event);
      retained.push([{ type: header.type }, payload]);
    } else if (header.type === 'span') {
      sanitizeTelemetrySpan(payload);
      retained.push([{ type: 'span' }, payload]);
    }
  }
  envelope[1] = retained;
}

export const telemetryPrivacyIntegration = (): Integration => ({
  name: 'SteelBuildTelemetryPrivacy',
  setup(client) { client.on('beforeEnvelope', sanitizeTelemetryEnvelope); },
});
