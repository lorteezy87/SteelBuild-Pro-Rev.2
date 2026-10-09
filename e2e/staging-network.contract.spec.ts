import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { APP_ORIGIN, installStagingNetworkGuard } from './stagingNetworkGuard';
import { DrawingEvidenceTransport } from './drawingEvidenceTransport';

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
