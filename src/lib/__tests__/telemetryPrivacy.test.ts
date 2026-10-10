import { describe, expect, it } from 'vitest';
import { createTelemetryPolicy, type TelemetryEnvelope as Envelope } from '../telemetryPrivacy';
import { parseTelemetryAssets, captureTelemetryAssets, TELEMETRY_ASSET_LIMIT } from '../telemetryAssetManifest';

const secret = 'synthetic-private-project-marker';
const asset = '/assets/Drawings-AbCd1234.js';
const policy = createTelemetryPolicy({ assets: [asset], sdkVersion: '10.54.0', release: 'a'.repeat(40), environment: 'staging' });
const eventId = 'a'.repeat(32), traceId = 'b'.repeat(32), spanId = 'c'.repeat(16);
const trace = { trace_id: traceId, span_id: spanId, op: 'navigation', status: 'ok' };

describe('exact build asset capture', () => {
  it('captures and freezes a bounded list once', () => {
    const element = { tagName: 'SCRIPT', getAttribute: () => 'application/json',
      textContent: JSON.stringify({ version: 1, files: [asset] }) };
    const captured = captureTelemetryAssets({ querySelectorAll: () => [element] });
    element.textContent = JSON.stringify({ version: 1, files: ['/assets/private.js'] });
    expect(captured).toEqual([asset]); expect(Object.isFrozen(captured)).toBe(true);
  });
  it.each([null, '', '{', JSON.stringify({ version: 2, files: [asset] }),
    JSON.stringify({ version: 1, files: [asset, asset] }),
    JSON.stringify({ version: 1, files: [asset, '/storage/private.js'] }),
    JSON.stringify({ version: 1, files: ['/assets/../secret.js'] }),
    JSON.stringify({ version: 1, files: [`/assets/${secret}<script>.js`] }),
    JSON.stringify({ version: 1, files: Array.from({ length: TELEMETRY_ASSET_LIMIT + 1 }, (_, n) => `/assets/a${n}.js`) }),
    ' '.repeat(128 * 1024 + 1),
  ])('fails closed for malformed/missing/oversized manifest %#', raw => expect(parseTelemetryAssets(raw)).toEqual([]));
  it('rejects duplicate/wrong-kind elements and absent dev manifests', () => {
    const element = { tagName: 'SCRIPT', getAttribute: () => 'text/javascript', textContent: JSON.stringify({ version: 1, files: [asset] }) };
    expect(captureTelemetryAssets({ querySelectorAll: () => [element] })).toEqual([]);
    expect(captureTelemetryAssets({ querySelectorAll: () => [element, element] })).toEqual([]);
    expect(captureTelemetryAssets()).toEqual([]);
  });
});

describe('closed event schema', () => {
  it('drops unknown metadata at every nesting level and preserves only useful safe stack coordinates', () => {
    const result = policy.event({ event_id: eventId, timestamp: 12, level: 'warning', release: secret, environment: secret,
      message: secret, logentry: { message: secret }, fingerprint: [secret], extra: { private: secret },
      user: { id: secret }, tags: { project: secret }, request: { url: `/private/${secret}` },
      threads: { values: [{ id: secret }] }, logger: secret, server_name: secret, modules: { [secret]: secret },
      sdk: { name: secret }, sdkProcessingMetadata: { dynamicSamplingContext: { transaction: secret } },
      debug_meta: { images: [{ code_file: secret }] }, futureField: secret,
      breadcrumbs: [{ message: secret }], contexts: { business: { value: secret }, trace: { ...trace, op: secret, status: secret, data: { private: secret } } },
      exception: { values: [{ type: secret, value: secret, module: secret, thread_id: secret,
        mechanism: { type: secret, description: secret, handled: false, data: { private: secret } },
        stacktrace: { registers: { private: secret }, frames: [{ filename: `https://www.steelbuild-pro.com${asset}?${secret}#${secret}`,
          abs_path: secret, function: secret, module: secret, module_metadata: { private: secret }, debug_id: secret,
          lineno: 42, colno: 9, in_app: true, vars: { private: secret }, context_line: secret }] } }] } });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result?.release).toBe('a'.repeat(40)); expect(result?.environment).toBe('staging');
    expect(result?.exception?.values?.[0]).toEqual({ type: 'Error', value: 'Application error; details omitted',
      mechanism: { type: 'generic', handled: false }, stacktrace: { frames: [{ filename: asset, lineno: 42, colno: 9, in_app: true }] } });
    expect(result?.contexts?.trace).toEqual({ trace_id: traceId, span_id: spanId, op: 'app' });
    expect(result?.sdk?.settings?.infer_ip).toBe('never');
  });
  it.each(['https://www.steelbuild-pro.com', 'http://127.0.0.1:4173', 'capacitor://localhost', 'ionic://localhost'])
  ('allows an exact emitted path without preserving origin/query/fragment for %s', origin => {
    const result = policy.event({ event_id: eventId, exception: { values: [{ stacktrace: { frames: [{ filename: `${origin}${asset}?q=${secret}#${secret}` }] } }] } });
    expect(result?.exception?.values?.[0].stacktrace?.frames).toEqual([{ filename: asset }]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it.each([`https://user:${secret}@example.invalid${asset}`, `/assets/${secret}-AbCd1234.js`,
    `https://ndyfjffsulfbwpmwdmic.supabase.co/storage/v1/object/sign/app-files/${secret}/plan.pdf?token=${secret}`,
    `blob:https://steelbuild-pro.com/${secret}`, `file:///C:/private/${secret}.js`, `/assets/%44rawings-AbCd1234.js`])
  ('does not treat a path pattern or signed URL as a trusted asset %#', filename => {
    const result = policy.event({ event_id: eventId, exception: { values: [{ stacktrace: { frames: [{ filename, lineno: 7, colno: 2 }] } }] } });
    expect(result?.exception?.values?.[0].stacktrace?.frames).toEqual([{ lineno: 7, colno: 2 }]);
  });
  it('redacts all filenames when the build manifest is missing', () => {
    const empty = createTelemetryPolicy({ sdkVersion: '10.54.0' });
    const result = empty.event({ event_id: eventId, exception: { values: [{ stacktrace: { frames: [{ filename: asset, lineno: 7 }] } }] } });
    expect(result?.exception?.values?.[0].stacktrace?.frames).toEqual([{ lineno: 7 }]);
  });
  it('retains bounded transaction timing while dropping arbitrary span data and invalid spans', () => {
    const result = policy.event({ event_id: eventId, type: 'transaction', transaction: secret, timestamp: 12, start_timestamp: 10,
      contexts: { trace }, measurements: { [secret]: { value: 3 } }, transaction_info: { source: secret },
      spans: [{ ...trace, parent_span_id: 'd'.repeat(16), start_timestamp: 10, timestamp: 11, description: secret,
        origin: secret, profile_id: secret, data: { private: secret }, links: [{ private: secret }], futureField: secret },
      { ...trace, start_timestamp: 12, timestamp: 11 }, { ...trace, span_id: secret, start_timestamp: 10, timestamp: 11 }] });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result?.transaction).toBe('Application navigation');
    expect(result?.spans).toEqual([{ ...trace, parent_span_id: 'd'.repeat(16), start_timestamp: 10, timestamp: 11, data: {} }]);
  });
  it('does not invent an error status for a span whose status is unknown', () => {
    const result = policy.event({ event_id: eventId, contexts: { trace: { trace_id: traceId, span_id: spanId } } });
    expect(result?.contexts?.trace).not.toHaveProperty('status');
  });
  it.each([{ event_id: secret }, { event_id: eventId, type: 'feedback' },
    { event_id: eventId, type: 'transaction', start_timestamp: 3, timestamp: 2, contexts: { trace } },
    { event_id: eventId, type: 'transaction', start_timestamp: Infinity, timestamp: 2, contexts: { trace } }])
  ('rejects malformed or unsupported events %#', event => expect(policy.event(event)).toBeNull());
});

it('rebuilds final headers/items, dropping every auxiliary payload even beside a valid event', () => {
  const input = [{ event_id: secret, trace: { transaction: secret }, sdk: { name: secret }, unknown: secret }, [
    [{ type: 'event', filename: secret, unknown: secret }, { event_id: eventId, message: secret }],
    ...['attachment', 'session', 'sessions', 'span', 'log', 'metric', 'trace_metric', 'client_report', 'replay_event',
      'replay_recording', 'profile', 'profile_chunk', 'feedback', 'user_report', 'check_in', 'raw_security', 'future_type']
      .map(type => [{ type, filename: secret }, secret]),
  ]] as unknown as Envelope;
  const result = policy.envelope(input);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result?.[1]).toHaveLength(1); expect(result?.[1][0][0]).toEqual({ type: 'event' });
  expect(result?.[0].event_id).toBe(eventId); expect(result?.[0]).not.toHaveProperty('trace');
  expect(policy.envelope([{ extra: secret }, [[{ type: 'attachment' }, secret]]] as unknown as Envelope)).toBeNull();
});

it('bounds exception/frame/span counts and drops oversized or over-count final envelopes', () => {
  const error = { event_id: eventId, exception: { values: Array.from({ length: 10 }, () => ({
    stacktrace: { frames: Array.from({ length: 100 }, () => ({ filename: asset, lineno: 20 })) },
  })) } };
  const result = policy.event(error);
  expect(result?.exception?.values).toHaveLength(5);
  expect(result?.exception?.values?.every(value => value.stacktrace?.frames?.length === 50)).toBe(true);
  const transaction = policy.event({ event_id: eventId, type: 'transaction', contexts: { trace }, start_timestamp: 1, timestamp: 2,
    spans: Array.from({ length: 150 }, () => ({ ...trace, start_timestamp: 1, timestamp: 2 })) });
  expect(transaction?.spans).toHaveLength(100);
  expect(policy.envelope([{}, Array.from({ length: 65 }, () => [{ type: 'event' }, error])] as unknown as Envelope)).toBeNull();
  expect(policy.envelope([{}, Array.from({ length: 64 }, () => [{ type: 'event' }, error])] as unknown as Envelope)).toBeNull();
});

it('does not mutate caller payloads and fails closed on hostile property access', () => {
  const event = { event_id: eventId, message: secret };
  policy.event(event); expect(event.message).toBe(secret);
  const hostile = { get event_id(): string { throw new Error(secret); } };
  expect(policy.event(hostile)).toBeNull();
  expect(policy.envelope([{}, [[{ type: 'event' }, hostile]]] as unknown as Envelope)).toBeNull();
});
