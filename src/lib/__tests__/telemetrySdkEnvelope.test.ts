import { describe, expect, it, vi } from 'vitest';
import { BrowserClient, Scope, defaultStackParser, SDK_VERSION } from '@sentry/react';
import type { Event } from '@sentry/react';
import { createTelemetryPolicy, type TelemetryEnvelope as Envelope } from '../telemetryPrivacy';
import { createPrivateTelemetryTransport } from '../telemetryTransport';

const secret = 'synthetic-envelope-secret';
const asset = '/assets/Drawings-AbCd1234.js';
function harness() {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const localFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 200 });
  });
  const policy = createTelemetryPolicy({ assets: [asset], release: 'a'.repeat(40), environment: 'staging', sdkVersion: SDK_VERSION });
  const client = new BrowserClient({ dsn: 'https://public@example.invalid/1', integrations: [],
    stackParser: defaultStackParser, tracesSampleRate: 1, sendDefaultPii: false, sendClientReports: false,
    enableLogs: false, enableMetrics: false, beforeSend: policy.errorEvent,
    beforeSendTransaction: policy.transactionEvent, transport: createPrivateTelemetryTransport(policy, localFetch),
    transportOptions: { headers: { Authorization: secret }, fetchOptions: { credentials: 'include', redirect: 'follow', referrer: secret } },
  });
  return { client, requests, localFetch };
}
function bodies(requests: Array<{ init: RequestInit }>): string[] {
  return requests.map(request => typeof request.init.body === 'string' ? request.init.body : new TextDecoder().decode(request.init.body as Uint8Array));
}

describe('actual Sentry SDK envelopes at a local fetch sink', () => {
  it('captures exceptions and scope attachments without emitting their private contents', async () => {
    const { client, requests } = harness();
    const scope = new Scope();
    scope.setUser({ id: secret, email: secret }); scope.setExtra('private', secret);
    scope.addAttachment({ filename: `${secret}.txt`, data: secret });
    const error = new TypeError(secret);
    error.stack = `TypeError: ${secret}\n    at ${secret} (https://steelbuild-pro.com${asset}?${secret}#${secret}:42:9)`;
    client.captureException(error, { attachments: [{ filename: `${secret}.pdf`, data: new TextEncoder().encode(secret) }] }, scope);
    await client.flush(2_000);
    expect(requests).toHaveLength(1);
    const body = bodies(requests)[0];
    expect(body).not.toContain(secret); expect(body).not.toContain('attachment');
    expect(body).toContain(asset); expect(body).toContain('"lineno":42');
    expect(body).toContain('"infer_ip":"never"');
    expect(requests[0].init).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    expect(requests[0].init.referrer).toBeUndefined(); expect(requests[0].init.headers).toBeUndefined();
    await client.close();
  });
  it('sanitizes captureMessage and a real SDK transaction even after late envelope mutation', async () => {
    const { client, requests } = harness();
    client.on('beforeEnvelope', envelope => {
      (envelope[0] as Record<string, unknown>).trace = { transaction: secret };
      for (const item of envelope[1]) {
        const payload = item[1];
        if (payload && typeof payload === 'object') Object.assign(payload, { extra: { late: secret }, release: secret, debug_meta: { late: secret } });
      }
      (envelope[1] as unknown[]).push([{ type: 'attachment', filename: secret }, new TextEncoder().encode(secret)]);
    });
    client.captureMessage(secret, 'warning');
    client.captureEvent({ event_id: 'd'.repeat(32), type: 'transaction', transaction: secret,
      start_timestamp: 10, timestamp: 12, contexts: { trace: { trace_id: 'b'.repeat(32), span_id: 'c'.repeat(16), op: 'navigation' } },
      spans: [{ trace_id: 'b'.repeat(32), span_id: 'e'.repeat(16), op: secret, start_timestamp: 10, timestamp: 11,
        description: secret, data: { private: secret } }], extra: { private: secret },
    } as Event);
    await client.flush(2_000);
    expect(requests).toHaveLength(2);
    for (const body of bodies(requests)) { expect(body).not.toContain(secret); expect(body).not.toContain('attachment'); }
    expect(bodies(requests).join('')).toContain('"transaction":"Application navigation"');
    expect(bodies(requests).join('')).toContain('"start_timestamp":10');
    await client.close();
  });
  it('does not invoke even the local transport for auxiliary-only or malformed envelopes', async () => {
    const { client, localFetch } = harness();
    for (const type of ['attachment', 'session', 'sessions', 'span', 'log', 'metric', 'trace_metric', 'client_report',
      'replay_event', 'replay_recording', 'profile', 'profile_chunk', 'feedback', 'user_report', 'check_in', 'raw_security', 'future_type']) {
      await client.sendEnvelope([{ private: secret }, [[{ type, filename: secret }, { private: secret }]]] as unknown as Envelope);
    }
    await client.sendEnvelope([{}, [[{ type: 'event' }, { event_id: secret, message: secret }]]] as unknown as Envelope);
    await client.flush(2_000);
    expect(localFetch).not.toHaveBeenCalled();
    await client.close();
  });
});
