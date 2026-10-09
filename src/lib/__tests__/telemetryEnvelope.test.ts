// @vitest-environment jsdom
import type { BrowserOptions } from '@sentry/react';
import type { Envelope } from '@sentry/core';
import type { TelemetryEnvelope } from '../telemetryPrivacy';
import * as Sentry from '@sentry/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ envelopes: [] as TelemetryEnvelope[] }));
// Keep the installed SDK, integrations, event processing and envelope builder.
// Replace only its final network transport; sampling is deterministic here.
vi.mock('@sentry/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@sentry/react')>();
  return { ...actual, init: (options: BrowserOptions) => actual.init({ ...options,
    tracesSampleRate: 1,
    transport: () => ({ send: async envelope => {
      transport.envelopes.push(structuredClone(envelope));
      return { statusCode: 200 };
    }, flush: async () => true }),
  }) };
});

const secret = 'synthetic-private-envelope-marker';
const items = () => transport.envelopes.flatMap(envelope => envelope[1]);

beforeAll(async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.invalid/1');
  vi.stubEnv('VITE_APP_VERSION', 'synthetic-revision');
  vi.stubEnv('VITE_DEPLOY_ENV', 'test');
  await import('../../instrument.js');
});
afterAll(async () => { Sentry.setUser(null); await Sentry.close(1000); vi.unstubAllEnvs(); });

describe('installed Sentry SDK final transport boundary', () => {
  it('strips standalone span content and its separately-built sampling header', async () => {
    Sentry.withActiveSpan(null, () => {
      const span = Sentry.startInactiveSpan({ name: `button[aria-label="${secret}"]`,
        op: 'ui.interaction', attributes: { user: secret, 'http.url': `https://example.invalid/?code=${secret}` },
        experimental: { standalone: true } });
      span.end();
    });
    await Sentry.flush(1000);
    const envelope = transport.envelopes.find(value => value[1].some(([header]) => header.type === 'span'));
    expect(envelope).toBeDefined();
    expect(JSON.stringify(envelope)).not.toContain(secret);
    expect(envelope?.[0].trace).toBeUndefined();
    const span = envelope?.[1].find(([header]) => header.type === 'span')?.[1];
    expect(span).toMatchObject({ trace_id: expect.any(String), span_id: expect.any(String), start_timestamp: expect.any(Number), timestamp: expect.any(Number) });
  });

  it('keeps error and transaction diagnostics without exception, context or attachment content', async () => {
    Sentry.withScope(scope => {
      scope.setUser({ id: secret });
      scope.setExtra('private', secret);
      scope.addAttachment({ filename: `${secret}.txt`, data: secret });
      Sentry.addBreadcrumb({ category: 'fetch', data: { method: 'GET',
        url: `https://store.supabase.co/storage/v1/object/sign/email-attachments/${secret}/${secret}.pdf?token=${secret}` } });
      const failure = new Error(secret);
      failure.stack = `Error: ${secret}\n    at readAttachment (https://steelbuild-pro.com/assets/${secret}.js?key=${secret}:12:3)`;
      Sentry.captureException(failure);
    });
    Sentry.withActiveSpan(null, () => {
      const span = Sentry.startInactiveSpan({ name: `/Drawings?code=${secret}`, forceTransaction: true });
      span.end();
    });
    await Sentry.flush(1000);
    const error = items().find(([header]) => header.type === 'event')?.[1];
    const transaction = items().find(([header]) => header.type === 'transaction')?.[1];
    expect(error).toBeDefined();
    expect(transaction).toMatchObject({ transaction: 'Application transaction', start_timestamp: expect.any(Number), timestamp: expect.any(Number), release: 'synthetic-revision' });
    expect(items().some(([header]) => header.type === 'attachment')).toBe(false);
    expect(JSON.stringify(transport.envelopes)).not.toContain(secret);
  });

  it('disables automatic sessions and drops explicitly created sessions or unknown payload channels', async () => {
    expect(Sentry.getClient()?.getIntegrationByName('BrowserSession')).toBeUndefined();
    Sentry.startSession({ user: { id: secret } });
    Sentry.captureSession();
    Sentry.endSession();
    const unsupported = [{}, [[{ type: 'future_private_channel' }, secret]]] as unknown as Envelope;
    await Sentry.getClient()?.sendEnvelope(unsupported);
    await Sentry.flush(1000);
    expect(items().some(([header]) => ['session', 'sessions', 'future_private_channel'].includes(header.type))).toBe(false);
    expect(JSON.stringify(transport.envelopes)).not.toContain(secret);
  });
});
