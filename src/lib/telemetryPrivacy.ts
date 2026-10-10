import type { BrowserClient, Event, StackFrame } from '@sentry/react';
import { isTelemetryAssetPath, TELEMETRY_ASSET_LIMIT } from './telemetryAssetManifest';

export type TelemetryEnvelope = Parameters<BrowserClient['sendEnvelope']>[0];
type SpanJSON = NonNullable<Event['spans']>[number];

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as RecordValue : {};
const id = (value: unknown, length: number): string | undefined => typeof value === 'string'
  && new RegExp(`^[a-f0-9]{${length}}$`).test(value) && !/^0+$/.test(value) ? value : undefined;
const number = (value: unknown, maximum = 100_000_000_000): number | undefined => typeof value === 'number'
  && Number.isFinite(value) && value >= 0 && value <= maximum ? value : undefined;
const integer = (value: unknown): number | undefined => Number.isInteger(value) ? number(value, 10_000_000) : undefined;
const choice = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T =>
  typeof value === 'string' && choices.includes(value as T) ? value as T : fallback;
const OPS = ['pageload', 'navigation', 'http.client', 'resource.script', 'resource.css', 'resource.link', 'resource.img',
  'resource.fetch', 'resource.other', 'ui.action.click', 'ui.interaction', 'browser', 'app'] as const;
const STATUSES = ['ok', 'unknown_error', 'internal_error', 'cancelled', 'deadline_exceeded', 'not_found',
  'permission_denied', 'unauthenticated', 'resource_exhausted', 'invalid_argument', 'unavailable'] as const;
const ERROR_TYPES = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError'] as const;
const LEVELS = ['fatal', 'error', 'warning', 'log', 'info', 'debug'] as const;
const MAX_FRAMES = 50;
const MAX_SPANS = 100;
const MAX_EXCEPTIONS = 5;

export interface TelemetryPolicyConfig {
  assets?: readonly string[];
  release?: string;
  environment?: string;
  sdkVersion: string;
}

/** Reconstruct, never spread caller objects: new SDK fields remain denied by default. */
export function createTelemetryPolicy(config: TelemetryPolicyConfig) {
  const candidates = config.assets ?? [];
  const assets = new Set(candidates.length <= TELEMETRY_ASSET_LIMIT && candidates.every(isTelemetryAssetPath) ? candidates : []);
  const release = typeof config.release === 'string' && /^[a-f0-9]{40}$/.test(config.release) ? config.release : undefined;
  const environment = choice(config.environment, ['production', 'staging', 'development', 'test', 'preview'], 'production');
  const sdkVersion = /^\d+\.\d+\.\d+$/.test(config.sdkVersion) ? config.sdkVersion : '0.0.0';
  const sdk = () => ({ name: 'sentry.javascript.react', version: sdkVersion, settings: { infer_ip: 'never' as const } });

  function safeFilename(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length > 4_096) return undefined;
    try {
      const url = new URL(value, 'https://telemetry-assets.invalid');
      if (url.username || url.password || !['https:', 'http:', 'capacitor:', 'ionic:'].includes(url.protocol)) return undefined;
      // Origin/query/fragment are never copied; only a build-emitted path survives.
      return assets.has(url.pathname) ? url.pathname : undefined;
    } catch { return undefined; }
  }

  function frame(value: unknown): StackFrame {
    const source = record(value);
    const filename = safeFilename(source.filename) ?? safeFilename(source.abs_path);
    return { ...(filename ? { filename } : {}),
      ...(integer(source.lineno) !== undefined ? { lineno: integer(source.lineno) } : {}),
      ...(integer(source.colno) !== undefined ? { colno: integer(source.colno) } : {}),
      ...(typeof source.in_app === 'boolean' ? { in_app: source.in_app } : {}) };
  }

  function trace(value: unknown) {
    const source = record(value);
    const traceId = id(source.trace_id, 32), spanId = id(source.span_id, 16);
    if (!traceId || !spanId) return undefined;
    return { trace_id: traceId, span_id: spanId,
      ...(id(source.parent_span_id, 16) ? { parent_span_id: id(source.parent_span_id, 16) } : {}),
      op: choice(source.op, OPS, 'app'),
      ...(typeof source.status === 'string' && STATUSES.includes(source.status as typeof STATUSES[number]) ? { status: source.status } : {}) };
  }

  function span(value: unknown): SpanJSON | undefined {
    const source = record(value), context = trace(source);
    const start = number(source.start_timestamp), end = number(source.timestamp);
    if (!context || start === undefined || end === undefined || end < start) return undefined;
    return { ...context, start_timestamp: start, timestamp: end, data: {} };
  }

  function event(input: unknown, kind?: 'event' | 'transaction'): Event | null {
    try {
      const source = record(input), eventId = id(source.event_id, 32);
      if (!eventId || (source.type !== undefined && source.type !== 'transaction')) return null;
      const transaction = kind === 'transaction' || source.type === 'transaction';
      if (kind === 'event' && transaction) return null;
      const context = trace(record(source.contexts).trace);
      const result: Event = { event_id: eventId, platform: 'javascript', environment, sdk: sdk(),
        ...(release ? { release } : {}),
        ...(number(source.timestamp) !== undefined ? { timestamp: number(source.timestamp) } : {}),
        ...(context ? { contexts: { trace: context } } : {}),
      };
      if (transaction) {
        const start = number(source.start_timestamp), end = number(source.timestamp);
        if (!context || start === undefined || end === undefined || end < start) return null;
        result.type = 'transaction'; result.transaction = `Application ${context.op}`;
        result.start_timestamp = start; result.timestamp = end;
        result.spans = Array.isArray(source.spans) ? source.spans.slice(0, MAX_SPANS).map(span)
          .filter((value): value is SpanJSON => value !== undefined) : [];
      } else {
        result.level = choice(source.level, LEVELS, 'error');
        const values = record(source.exception).values;
        if (Array.isArray(values) && values.length) {
          result.exception = { values: values.slice(0, MAX_EXCEPTIONS).map(value => {
            const exception = record(value), frames = record(exception.stacktrace).frames;
            const handled = record(exception.mechanism).handled;
            return { type: choice(exception.type, ERROR_TYPES, 'Error'), value: 'Application error; details omitted',
              ...(typeof handled === 'boolean' ? { mechanism: { type: 'generic', handled } } : {}),
              ...(Array.isArray(frames) ? { stacktrace: { frames: frames.slice(-MAX_FRAMES).map(frame) } } : {}) };
          }) };
        } else result.message = 'Application diagnostic; details omitted';
      }
      return result;
    } catch { return null; }
  }

  function envelope(input: TelemetryEnvelope): TelemetryEnvelope | null {
    try {
      if (!Array.isArray(input) || !Array.isArray(input[1]) || input[1].length > 64) return null;
      const items: Array<[{ type: 'event' | 'transaction' }, Event]> = [];
      for (const entry of input[1]) {
        if (!Array.isArray(entry)) continue;
        const type = record(entry[0]).type;
        if (type !== 'event' && type !== 'transaction') continue;
        const cleaned = event(entry[1], type);
        if (cleaned) items.push([{ type }, cleaned]);
      }
      if (!items.length) return null;
      // No dynamic sampling context, arbitrary headers, attachment names or SDK overrides.
      const cleaned: TelemetryEnvelope = [{ event_id: items[0][1].event_id!, sent_at: new Date().toISOString(), sdk: sdk() }, items];
      return JSON.stringify(cleaned).length <= 256 * 1_024 ? cleaned : null;
    } catch { return null; }
  }
  function errorEvent(input: unknown): (Event & { type: undefined }) | null {
    const cleaned = event(input, 'event');
    return cleaned ? { ...cleaned, type: undefined } : null;
  }
  function transactionEvent(input: unknown) {
    const cleaned = event(input, 'transaction');
    return cleaned?.type === 'transaction' ? { ...cleaned, type: 'transaction' as const } : null;
  }
  return Object.freeze({ event, errorEvent, transactionEvent, envelope });
}

export type TelemetryPolicy = ReturnType<typeof createTelemetryPolicy>;
