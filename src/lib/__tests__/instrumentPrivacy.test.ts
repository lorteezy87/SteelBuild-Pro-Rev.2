import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); vi.doUnmock('@sentry/react'); });

it('initializes monitoring without Replay, whose recording channel bypasses event sanitizers', async () => {
  const init = vi.fn();
  const replayIntegration = vi.fn();
  const tracing = { name: 'safe-tracing' };
  const browserTracingIntegration = vi.fn(() => tracing);
  vi.doMock('@sentry/react', () => ({ init, replayIntegration, browserTracingIntegration }));
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.invalid/1');
  vi.stubEnv('VITE_DEPLOY_ENV', 'preview');
  await import('../../instrument.js');
  expect(init).toHaveBeenCalledOnce();
  expect(init.mock.calls[0][0]).toMatchObject({
    integrations: expect.any(Function), environment: 'preview', sendDefaultPii: false,
    enableLogs: false, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
    beforeSend: expect.any(Function), beforeSendTransaction: expect.any(Function), beforeBreadcrumb: expect.any(Function), beforeSendSpan: expect.any(Function),
  });
  expect(init.mock.calls[0][0].integrations([{ name: 'BrowserSession' }, { name: 'GlobalHandlers' }])).toEqual([
    { name: 'SteelBuildTelemetryPrivacy', setup: expect.any(Function) }, { name: 'GlobalHandlers' }, tracing,
  ]);
  expect(browserTracingIntegration).toHaveBeenCalledWith({ enableInp: false });
  expect(replayIntegration).not.toHaveBeenCalled();
});
