import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { APP_ORIGIN, TELEMETRY_ORIGIN, TELEMETRY_PATH, installStagingNetworkGuard } from './stagingNetworkGuard.js';
import { DrawingEvidenceTransport } from './drawingEvidenceTransport.js';
import { observeReadOnlyPage } from './acceptance.js';

async function listen(server: Server, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback listener');
  return address.port;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

test('exact telemetry envelopes receive a local 204 without reaching even a rejecting proxy', async ({ browser }) => {
  let proxyHits = 0;
  // Any accidental external egress is counted and rejected locally, never sent
  // to a telemetry service. Chromium and route.fetch both use this proxy.
  const proxy = createServer((_request, response) => { proxyHits++; response.writeHead(502); response.end(); });
  proxy.on('connect', (_request, socket) => { proxyHits++; socket.destroy(); });
  const proxyPort = await listen(proxy);
  const allowed = createServer((_request, response) => { response.end('<!doctype html><title>Synthetic envelope test</title>'); });
  const context = await browser.newContext({ serviceWorkers: 'block', proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '127.0.0.1' } });
  try {
    await listen(allowed, 4173);
    const guard = await installStagingNetworkGuard(context);
    const page = await context.newPage();
    const probe = await observeReadOnlyPage(page, 'https://ndyfjffsulfbwpmwdmic.supabase.co');
    await page.goto(APP_ORIGIN);
    const status = await page.evaluate(async url => (await fetch(url, { method: 'POST', body: 'synthetic-envelope' })).status, TELEMETRY_ORIGIN + TELEMETRY_PATH);
    expect(status).toBe(204);
    await probe.settle(); await guard.settle();
    probe.assertHealthy(); guard.assertHealthy();
    expect(proxyHits).toBe(0);
    expect(guard.diagnostics()).toEqual({ telemetryDiscarded: 1, failureCategories: [] });
  } finally { await context.close(); await close(allowed); await close(proxy); }
});

for (const fault of ['console', 'runtime'] as const) {
  test(`local telemetry discard does not suppress a real ${fault} fault`, async ({ browser }) => {
    const allowed = createServer((_request, response) => { response.end('<!doctype html><title>Synthetic fault test</title>'); });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await listen(allowed, 4173);
      const guard = await installStagingNetworkGuard(context);
      const page = await context.newPage();
      const probe = await observeReadOnlyPage(page, 'https://ndyfjffsulfbwpmwdmic.supabase.co');
      await page.goto(APP_ORIGIN);
      await page.evaluate(async url => { await fetch(url, { method: 'POST', body: 'synthetic-envelope' }); }, TELEMETRY_ORIGIN + TELEMETRY_PATH);
      if (fault === 'console') {
        const observed = page.waitForEvent('console', message => message.type() === 'error');
        await page.evaluate(() => console.error('Controlled synthetic console fault'));
        await observed;
      } else {
        const observed = page.waitForEvent('pageerror');
        await page.evaluate(() => { setTimeout(() => { throw new Error('Controlled synthetic runtime fault'); }, 0); });
        await observed;
      }
      await probe.settle(); await guard.settle();
      guard.assertHealthy();
      expect(() => probe.assertHealthy()).toThrow();
    } finally { await context.close(); await close(allowed); }
  });
}

test('closing staging realtime does not create a read-only console failure', async ({ browser }) => {
  const allowed = createServer((_request, response) => { response.end('<!doctype html><title>Synthetic realtime diagnostic</title>'); });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await listen(allowed, 4173);
    const guard = await installStagingNetworkGuard(context);
    const page = await context.newPage();
    const probe = await observeReadOnlyPage(page, 'https://ndyfjffsulfbwpmwdmic.supabase.co');
    await page.goto(APP_ORIGIN);
    await page.evaluate(() => new Promise<void>(resolve => {
      const socket = new WebSocket('wss://ndyfjffsulfbwpmwdmic.supabase.co/realtime/v1/websocket?apikey=synthetic-public-key');
      socket.addEventListener('close', () => resolve());
    }));
    await probe.settle(); await guard.settle();
    probe.assertHealthy(); guard.assertHealthy();
  } finally { await context.close(); await close(allowed); }
});

test('a setup navigation can cancel prior local assets without failing its health check', async ({ browser }) => {
  let finishAsset: (() => void) | undefined;
  const allowed = createServer((request, response) => {
    if (request.url === '/slow.svg') {
      finishAsset = () => { if (response.writableEnded) return; response.setHeader('Content-Type', 'image/svg+xml'); response.end('<svg xmlns="http://www.w3.org/2000/svg"/>'); };
    } else response.end(request.url === '/first' ? '<!doctype html><img src="/slow.svg">' : '<!doctype html><title>Second page</title>');
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await listen(allowed, 4173);
    const guard = await installStagingNetworkGuard(context);
    const page = await context.newPage();
    const probe = await observeReadOnlyPage(page, 'https://ndyfjffsulfbwpmwdmic.supabase.co');
    await page.goto(`${APP_ORIGIN}/first`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => !!finishAsset).toBe(true);
    await page.goto(`${APP_ORIGIN}/second`);
    finishAsset!();
    await probe.settle(); await guard.settle();
    probe.assertHealthy(); guard.assertHealthy();
  } finally { finishAsset?.(); await context.close(); await close(allowed); }
});

// Real browser and loopback servers only: no credentials, backend or provider.
test('trusted-origin redirects cannot reach a denied provider origin', async ({ browser }) => {
  let deniedHits = 0;
  const denied = createServer((_request, response) => { deniedHits++; response.end('denied'); });
  const port = await listen(denied);
  const allowed = createServer((_request, response) => { response.writeHead(302, { Location: `http://127.0.0.1:${port}/provider` }); response.end(); });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await listen(allowed, 4173);
    await installStagingNetworkGuard(context);
    const page = await context.newPage();
    await page.goto(`${APP_ORIGIN}/redirect`).catch(() => undefined);
    expect(deniedHits).toBe(0);
  } finally { await context.close(); await close(allowed); await close(denied); }
});

test('the first popup request cannot reach an external origin', async ({ browser }) => {
  let deniedHits = 0;
  const denied = createServer((_request, response) => { deniedHits++; response.end('denied'); });
  const port = await listen(denied);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await installStagingNetworkGuard(context);
    const opener = await context.newPage();
    await opener.setContent('<button>Open</button>');
    const popupPromise = context.waitForEvent('page');
    await opener.evaluate(url => { window.open(url); }, `http://127.0.0.1:${port}/provider`);
    const popup = await popupPromise;
    await expect.poll(() => popup.url()).not.toBe('about:blank');
    expect(deniedHits).toBe(0);
  } finally { await context.close(); await close(denied); }
});

test('direct external POST attempts never reach the network', async ({ browser }) => {
  let deniedHits = 0;
  const denied = createServer((_request, response) => { deniedHits++; response.end('denied'); });
  const port = await listen(denied);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await installStagingNetworkGuard(context);
    const page = await context.newPage();
    await page.evaluate(async url => { await fetch(url, { method: 'POST', mode: 'no-cors', body: 'synthetic' }).catch(() => undefined); }, `http://127.0.0.1:${port}/provider`);
    expect(deniedHits).toBe(0);
  } finally { await context.close(); await close(denied); }
});

test('WebSocket connections cannot bypass the HTTP read boundary', async ({ browser }) => {
  let upgrades = 0;
  const denied = createServer();
  denied.on('upgrade', (_request, socket) => { upgrades++; socket.destroy(); });
  const port = await listen(denied);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await installStagingNetworkGuard(context);
    const page = await context.newPage();
    await page.evaluate(url => new Promise<void>(resolve => {
      const socket = new WebSocket(url);
      socket.onclose = () => resolve(); socket.onerror = () => resolve();
    }), `ws://127.0.0.1:${port}/provider`);
    expect(upgrades).toBe(0);
  } finally { await context.close(); await close(denied); }
});

test('approved local assets remain readable', async ({ browser }) => {
  const allowed = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<h1>Reviewed local build</h1>'); });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await listen(allowed, 4173);
    await installStagingNetworkGuard(context);
    const page = await context.newPage();
    await page.goto(APP_ORIGIN);
    await expect(page.getByRole('heading', { name: 'Reviewed local build' })).toBeVisible();
  } finally { await context.close(); await close(allowed); }
});

test('setup sign-in cannot forward its POST body through a redirect', async () => {
  let deniedHits = 0;
  const denied = createServer((_request, response) => { deniedHits++; response.end('denied'); });
  const port = await listen(denied);
  const allowed = createServer((_request, response) => { response.writeHead(307, { Location: `http://127.0.0.1:${port}/provider` }); response.end(); });
  try {
    const allowedPort = await listen(allowed);
    // Replace only the initial host with loopback; retain the production fetch
    // options so this exercises Node's actual redirect boundary without secrets.
    const network: typeof fetch = (_input, options) => fetch(`http://127.0.0.1:${allowedPort}/auth`, options);
    const auth = new DrawingEvidenceTransport('sb_publishable_synthetic', undefined, network);
    await expect(auth.send('/auth/v1/token?grant_type=password', 'POST', { email: 'synthetic', password: 'synthetic' })).rejects.toThrow('Protected drawing setup request failed');
    expect(deniedHits).toBe(0);
  } finally { await close(allowed); await close(denied); }
});
