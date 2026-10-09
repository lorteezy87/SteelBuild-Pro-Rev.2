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
    init, replayIntegration, browserTracingIntegration: () => tracing,
  }));
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.invalid/1');
  await import('../../instrument.js');

  expect(init).toHaveBeenCalledOnce();
  expect(replayIntegration).not.toHaveBeenCalled();
  expect(init.mock.calls[0][0]).toMatchObject({
    dsn: 'https://public@example.invalid/1',
    integrations: [tracing],
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    beforeSend: expect.any(Function),
    beforeBreadcrumb: expect.any(Function),
  });
});
