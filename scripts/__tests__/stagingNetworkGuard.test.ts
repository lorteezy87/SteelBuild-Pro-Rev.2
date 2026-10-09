import { describe, expect, it, vi } from 'vitest';
import type { BrowserContext, Route } from '@playwright/test';
import { APP_ORIGIN, STAGING_ORIGIN, TELEMETRY_ORIGIN, TELEMETRY_PATH, TELEMETRY_DISCARD_LIMIT,
  allowsStagingBrowserRequest as allows, isLocalTelemetryDiscard, installStagingNetworkGuard } from '../../e2e/stagingNetworkGuard.js';

describe('shared staging browser policy', () => {
  it.each([
    [APP_ORIGIN + '/assets/app.js', 'GET'], [APP_ORIGIN + '/Drawings', 'HEAD'],
    [STAGING_ORIGIN + '/rest/v1/projects?select=id', 'GET'],
    [STAGING_ORIGIN + '/rest/v1/projects?select=id', 'HEAD'],
    [STAGING_ORIGIN + '/rest/v1/drawings?project_id=eq.fixture', 'OPTIONS'],
    [STAGING_ORIGIN + '/auth/v1/user', 'GET'],
    [STAGING_ORIGIN + '/auth/v1/token?grant_type=refresh_token', 'POST'],
    ...['get_my_project_role', 'get_submittal_revision_coverage', 'get_submittal_revision_coverages']
      .map(name => [STAGING_ORIGIN + '/rest/v1/rpc/' + name, 'POST']),
    ['https://fonts.googleapis.com/css2?family=Inter', 'GET'],
    ['https://fonts.gstatic.com/font.woff2', 'GET'],
  ])('allows an explicit read or session refresh: %s %s', (url, method) => expect(allows(url, method)).toBe(true));

  it.each([
    [APP_ORIGIN + '/email', 'POST'], ['https://api.stripe.com/v1/customers', 'GET'],
    ['https://kjrwqagyeswwoxpjkcko.supabase.co/rest/v1/projects', 'GET'],
    [STAGING_ORIGIN + '/functions/v1/stripe-billing', 'GET'],
    [STAGING_ORIGIN + '/functions/v1/email-send', 'POST'],
    [STAGING_ORIGIN + '/rest/v1/projects', 'PATCH'],
    [STAGING_ORIGIN + '/rest/v1/projects', 'DELETE'],
    [STAGING_ORIGIN + '/rest/v1/rpc/apply_submittal_round_workflow', 'POST'],
    [STAGING_ORIGIN + '/rest/v1/rpc/get_my_project_role', 'GET'],
    [STAGING_ORIGIN + '/rest/v1/rpc/get_my_project_role?override=1', 'POST'],
    [STAGING_ORIGIN + '/storage/v1/object/app-files/test', 'GET'],
    [STAGING_ORIGIN + '/auth/v1/token?grant_type=password', 'POST'],
    [STAGING_ORIGIN + '/auth/v1/logout', 'POST'],
    [STAGING_ORIGIN + '/auth/v1/user', 'PUT'],
    [STAGING_ORIGIN + '/rest/v1/projects%2frpc', 'GET'],
    [STAGING_ORIGIN + '/rest/v1/projects#fragment', 'GET'],
    ['https://user:password@ndyfjffsulfbwpmwdmic.supabase.co/rest/v1/projects', 'GET'],
    ['not a URL', 'GET'], ['https://fonts.gstatic.com/font', 'POST'],
  ])('rejects unapproved egress: %s %s', (url, method) => expect(allows(url, method)).toBe(false));
});

describe('local telemetry discard boundary', () => {
  const envelope = TELEMETRY_ORIGIN + TELEMETRY_PATH;
  it.each(['POST', 'OPTIONS'])('discards only the exact envelope %s without granting egress', method => {
    expect(isLocalTelemetryDiscard(envelope + '?sentry_key=public-key', method)).toBe(true);
    expect(allows(envelope, method)).toBe(false);
  });
  it.each([
    [envelope, 'GET'], [envelope, 'PUT'], [envelope, 'DELETE'],
    [envelope + '#fragment', 'POST'], [envelope.replace('/4511458819375104/', '/other/'), 'POST'],
    [envelope.replace('o4511458803253248', 'other'), 'POST'],
    [envelope.replace('https://', 'https://user:password@'), 'POST'],
    [envelope.replace('/envelope/', '/store/'), 'POST'], ['not a URL', 'POST'],
  ])('rejects a different endpoint or method %s %s', (url, method) => {
    expect(isLocalTelemetryDiscard(url, method)).toBe(false);
  });
  it('never reads payloads or forwards; stops after the finite discard budget', async () => {
    let dispatch!: (route: Route) => Promise<void>;
    const context = {
      route: vi.fn(async (_pattern, callback) => { dispatch = callback; }),
      routeWebSocket: vi.fn(),
    } as unknown as BrowserContext;
    const guard = await installStagingNetworkGuard(context);
    const request = { url: () => envelope, method: () => 'POST', postData: vi.fn(), headers: vi.fn() };
    const route = {
      request: () => request, fulfill: vi.fn(), abort: vi.fn(async () => undefined),
      fetch: vi.fn(), continue: vi.fn(), fallback: vi.fn(),
    };
    for (let index = 0; index < TELEMETRY_DISCARD_LIMIT; index++) await dispatch(route as unknown as Route);
    await guard.settle(); guard.assertHealthy();
    expect(route.fulfill).toHaveBeenCalledTimes(TELEMETRY_DISCARD_LIMIT);
    expect(route.fulfill.mock.calls[0][0]).toMatchObject({ status: 204 });
    for (const spy of [request.postData, request.headers, route.fetch, route.continue, route.fallback]) expect(spy).not.toHaveBeenCalled();
    expect(guard.diagnostics()).toEqual({ telemetryDiscarded: TELEMETRY_DISCARD_LIMIT, failureCategories: [] });
    await dispatch(route as unknown as Route);
    await guard.settle();
    expect(route.abort).toHaveBeenCalledExactlyOnceWith('blockedbyclient');
    expect(() => guard.assertHealthy()).toThrow('forbidden route');
    expect(guard.diagnostics()).toEqual({ telemetryDiscarded: TELEMETRY_DISCARD_LIMIT, failureCategories: ['telemetry-budget'] });
  });
});
