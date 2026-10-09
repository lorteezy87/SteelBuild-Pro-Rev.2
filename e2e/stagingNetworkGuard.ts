import type { BrowserContext } from '@playwright/test';

export const APP_ORIGIN = 'http://127.0.0.1:4173';
export const STAGING_ORIGIN = 'https://ndyfjffsulfbwpmwdmic.supabase.co';
// The exact public fallback DSN in src/instrument.js. This endpoint is never
// allowed onto the network: acceptance discards its envelopes locally.
export const TELEMETRY_ORIGIN = 'https://o4511458803253248.ingest.us.sentry.io';
export const TELEMETRY_PATH = '/api/4511458819375104/envelope/';
export const TELEMETRY_DISCARD_LIMIT = 64;
export const NETWORK_FAILURE_CATEGORIES = ['request-budget', 'blocked-route', 'redirect', 'guarded-http-failure', 'forbidden-websocket', 'telemetry-budget'] as const;
export type NetworkFailureCategory = typeof NETWORK_FAILURE_CATEGORIES[number];

export function isLocalTelemetryDiscard(raw: string, method: string): boolean {
  try {
    const url = new URL(raw);
    return !url.username && !url.password && !url.hash && url.origin === TELEMETRY_ORIGIN
      && url.pathname === TELEMETRY_PATH && ['POST', 'OPTIONS'].includes(method);
  } catch { return false; }
}
const READ_RPCS = new Set([
  '/rest/v1/rpc/get_my_project_role',
  '/rest/v1/rpc/get_submittal_revision_coverage',
  '/rest/v1/rpc/get_submittal_revision_coverages',
]);

export function allowsStagingBrowserRequest(raw: string, method: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.username || url.password || url.hash || /%2f|%5c/i.test(url.pathname)) return false;
  if (url.origin === APP_ORIGIN) return method === 'GET' || method === 'HEAD';
  if (['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(url.origin)) return method === 'GET';
  if (url.origin !== STAGING_ORIGIN) return false;
  if (method === 'OPTIONS') return allowsStagingBrowserRequest(raw, 'GET') || allowsStagingBrowserRequest(raw, 'POST');
  if (method === 'GET' && url.pathname === '/auth/v1/user' && !url.search) return true;
  if (['GET', 'HEAD'].includes(method) && /^\/rest\/v1\/[a-z_][a-z0-9_]*$/.test(url.pathname)) return true;
  if (method === 'POST' && READ_RPCS.has(url.pathname) && !url.search) return true;
  return method === 'POST' && url.pathname === '/auth/v1/token' && url.search === '?grant_type=refresh_token';
}

/** Install before creating/navigating pages, including the first popup request.
 * Contexts must also block service workers, which can bypass route interception.
 * No request contents or credentials enter diagnostics.
 */
export async function installStagingNetworkGuard(context: BrowserContext) {
  let failures = 0;
  const categories = new Set<NetworkFailureCategory>();
  const fail = (category: NetworkFailureCategory) => { failures++; categories.add(category); };
  let requests = 0;
  let telemetryDiscarded = 0;
  const pending = new Set<Promise<void>>();
  await context.route('**/*', route => {
    const operation = (async () => {
      if (++requests > 1_000) {
        fail('request-budget'); await route.abort('blockedbyclient').catch(() => undefined); return;
      }
      if (isLocalTelemetryDiscard(route.request().url(), route.request().method())) {
        if (telemetryDiscarded >= TELEMETRY_DISCARD_LIMIT) {
          fail('telemetry-budget'); await route.abort('blockedbyclient').catch(() => undefined); return;
        }
        telemetryDiscarded++;
        // Do not read body/headers, forward, retry, or retain envelopes. Returning
        // locally prevents deliberately denied telemetry from becoming a false
        // browser console failure. Real console/page errors remain observable.
        await route.fulfill({ status: 204, headers: {
          'Access-Control-Allow-Origin': APP_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        } });
        return;
      }
      if (!allowsStagingBrowserRequest(route.request().url(), route.request().method())) {
        fail('blocked-route'); await route.abort('blockedbyclient').catch(() => undefined); return;
      }
      // Playwright routes only the first URL in a redirect chain. Fetch one hop
      // and fulfill it ourselves so redirects never forward credentials or writes.
      try {
        const response = await route.fetch({ maxRedirects: 0, timeout: 20_000 });
        try {
          if (response.status() >= 300 && response.status() < 400) {
            fail('redirect'); await route.abort('blockedbyclient'); return;
          }
          await route.fulfill({ response });
        } finally { await response.dispose(); }
      } catch {
        fail('guarded-http-failure');
        await route.abort('blockedbyclient').catch(() => undefined);
      }
    })();
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  });
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    if (url.origin !== STAGING_ORIGIN.replace('https:', 'wss:') || url.pathname !== '/realtime/v1/websocket') fail('forbidden-websocket');
    // Even the staging Realtime socket could broadcast or write presence.
    // Acceptance uses explicit HTTP reads; never connect any socket to a server.
    socket.close({ code: 1000, reason: 'Realtime disabled for explicit-read acceptance' });
  });
  return {
    diagnostics() { return { telemetryDiscarded, failureCategories: [...categories] }; },
    async settle() { while (pending.size) await Promise.all([...pending]); },
    assertHealthy() { if (failures) throw new Error('Browser attempted a forbidden route or a guarded request failed'); },
  };
}
