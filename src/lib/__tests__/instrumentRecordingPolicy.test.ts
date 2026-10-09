import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doUnmock('@sentry/react');
});

it('keeps error monitoring and tracing without initializing Replay or structured logs', async () => {
  const init = vi.fn();
  const replayIntegration = vi.fn(() => ({ name: 'Replay' }));
  const tracing = { name: 'BrowserTracing' };
  vi.doMock('@sentry/react', () => ({
    init, replayIntegration, browserTracingIntegration: () => tracing, SDK_VERSION: '10.54.0',
  }));
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.invalid/1');
  await import('../../instrument.js');

  expect(init).toHaveBeenCalledOnce();
  expect(replayIntegration).not.toHaveBeenCalled();
  expect(init.mock.calls[0][0]).toMatchObject({
    dsn: 'https://public@example.invalid/1',
    integrations: expect.any(Function),
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    enableMetrics: false,
    sendClientReports: false,
    beforeSend: expect.any(Function),
    beforeBreadcrumb: expect.any(Function),
  });
  expect(init.mock.calls[0][0].integrations([{ name: 'BrowserSession' }, { name: 'GlobalHandlers' }]))
    .toEqual([{ name: 'GlobalHandlers' }, tracing]);
});

it('enforces final envelopes and removes arbitrary event content and trace propagation', async () => {
  const init = vi.fn();
  vi.doMock('@sentry/react', () => ({ init, browserTracingIntegration: () => ({ name: 'BrowserTracing' }), SDK_VERSION: '10.54.0' }));
  await import('../../instrument.js');
  const options = init.mock.calls[0][0];
  const secret = 'synthetic-private-project-marker';
  const event = options.beforeSend({ event_id: 'a'.repeat(32), message: secret,
    request: { url: `https://example.invalid/private/${secret}#${secret}` },
    exception: { values: [{ type: secret, value: secret, mechanism: { type: secret } }] },
    contexts: { trace: { trace_id: 'b'.repeat(32), span_id: 'c'.repeat(16), op: secret } },
  });
  expect(JSON.stringify(event)).not.toContain(secret);
  expect(options.tracePropagationTargets).toEqual([]);
  expect(options.transport).toEqual(expect.any(Function));
  expect(options.beforeSendTransaction).toEqual(expect.any(Function));
});
