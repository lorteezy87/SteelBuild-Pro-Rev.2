import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { telemetryAssetManifest } from '../scripts/vite/telemetryAssetManifest.js';

const secret = 'synthetic-browser-private-marker';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('actual browser SDK sends only sanitized envelopes and no trace headers over fetch or XHR', async ({ browser }) => {
  test.setTimeout(60_000);
  const fixtureParent = join(repo, '.tmp'); mkdirSync(fixtureParent, { recursive: true });
  const fixture = mkdtempSync(join(fixtureParent, 'telemetry-browser-'));
  const envelopes: Array<{ body: string; headers: Record<string, string> }> = [];
  const probes: Array<Record<string, string | string[] | undefined>> = [];
  const denied: string[] = [];
  const server = createServer();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    writeFileSync(join(fixture, 'index.html'), '<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>');
    const instrument = JSON.stringify(join(repo, 'src/instrument.js').replaceAll('\\', '/'));
    writeFileSync(join(fixture, 'main.ts'), `import { Sentry } from ${instrument};
      window.runTelemetryProbe = async () => {
        const secret = ${JSON.stringify(secret)};
        Sentry.setUser({ id: secret, email: secret });
        Sentry.setExtra('private', secret);
        Sentry.getCurrentScope().addAttachment({ filename: secret + '.txt', data: secret });
        Sentry.getClient().on('beforeEnvelope', envelope => {
          envelope[0].trace = { transaction: secret };
          envelope[1].push([{ type: 'attachment', filename: secret }, new TextEncoder().encode(secret)]);
        });
        Sentry.getClient().getOptions().tracesSampleRate = 1;
        await Sentry.startNewTrace(() => Sentry.startSpan({ name: secret, op: 'navigation', forceTransaction: true, parentSpan: null }, async () => {
          await fetch('/probe?kind=fetch');
          await new Promise((resolve, reject) => { const xhr = new XMLHttpRequest();
            xhr.open('GET', '/probe?kind=xhr'); xhr.onload = resolve; xhr.onerror = reject; xhr.send(); });
          try { throw new Error(secret); } catch (error) { Sentry.captureException(error); }
        }));
        await Sentry.flush(2000);
        return true;
      };`);
    const built = await build({ configFile: false, root: fixture, logLevel: 'silent', plugins: [telemetryAssetManifest()],
      define: { 'import.meta.env.VITE_SENTRY_DSN': JSON.stringify('https://public@example.invalid/1'),
        'import.meta.env.VITE_APP_VERSION': JSON.stringify('a'.repeat(40)) }, build: { write: false, minify: false } });
    if (Array.isArray(built) || !('output' in built)) throw new Error('Unexpected fixture build');
    const files = new Map(built.output.map(entry => ['/' + entry.fileName, entry.type === 'chunk' ? entry.code : entry.source]));
    server.on('request', (request, response) => {
      const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
      if (path === '/probe') { probes.push(request.headers); response.end('ok'); return; }
      const payload = files.get(path === '/' ? '/index.html' : path);
      if (payload === undefined) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html'); response.end(payload);
    });
    await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback listener');
    const origin = `http://127.0.0.1:${address.port}`;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) { await route.continue(); return; }
      if (url.origin === 'https://example.invalid' && url.pathname === '/api/1/envelope/' && request.method() === 'POST') {
        envelopes.push({ body: request.postData() || '', headers: await request.allHeaders() });
        await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': origin } }); return;
      }
      denied.push(url.origin); await route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', socket => { denied.push('websocket'); socket.close(); });
    const page = await context.newPage();
    await page.goto(`${origin}/?private=${secret}#${secret}`);
    await page.waitForFunction(() => typeof (window as unknown as { runTelemetryProbe?: unknown }).runTelemetryProbe === 'function');
    await page.evaluate(() => (window as unknown as { runTelemetryProbe(): Promise<boolean> }).runTelemetryProbe());
    expect(probes).toHaveLength(2);
    for (const headers of probes) {
      expect(headers['baggage']).toBeUndefined(); expect(headers['sentry-trace']).toBeUndefined(); expect(headers['traceparent']).toBeUndefined();
    }
    expect(denied).toEqual([]); expect(envelopes.length).toBeGreaterThan(0);
    const body = envelopes.map(envelope => envelope.body).join('\n');
    expect(body).not.toContain(secret); expect(body).not.toContain('attachment');
    expect(body).toContain('"filename":"/assets/'); expect(body).toContain('"lineno":');
    expect(body).toContain('Application navigation');
    for (const envelope of envelopes) { expect(envelope.headers.referer).toBeUndefined(); expect(envelope.headers.cookie).toBeUndefined(); }
  } finally {
    await context.close(); server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    if (!resolve(fixture).startsWith(resolve(fixtureParent) + sep)) throw new Error('Unsafe fixture cleanup target');
    rmSync(fixture, { recursive: true, force: true });
  }
});
