import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const shell = '<!doctype html><meta name="steelbuild-app-shell" content="v1"><div id="root"></div>';
function response(body = shell, options: { status?: number; type?: string; redirected?: boolean; mime?: string; challenge?: boolean } = {}) {
  return {
    status: options.status ?? 200, type: options.type ?? 'basic', redirected: options.redirected ?? false,
    headers: new Headers({ 'content-type': options.mime ?? 'text/html', ...(options.challenge ? { 'cf-mitigated': 'challenge' } : {}) }),
    text: async () => body, clone: () => response(body, options),
  };
}
type Reply = ReturnType<typeof response> | Response;
function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const entries = new Map<string, Reply>();
  const key = (request: string | { url: string }) => typeof request === 'string' ? request : request.url;
  const cache = { match: vi.fn(async (request: string | { url: string }) => entries.get(key(request))), put: vi.fn(async (request: string | { url: string }, reply: Reply) => { entries.set(key(request), reply); }) };
  const fetch = vi.fn<(...args: unknown[]) => Promise<Reply>>(async () => response());
  const caches = { open: vi.fn(async () => cache), match: cache.match, keys: vi.fn(async () => ['sbp-shell-v1', 'unrelated']), delete: vi.fn(async () => true) };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { URL, Response, fetch, caches, self: { location: { origin: 'https://app.example' }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } } });
  const navigate = (url = 'https://app.example/FieldToday', mode = 'navigate') => {
    let reply: Promise<Reply> | undefined;
    handlers.fetch({ request: { url, mode, method: 'GET' }, respondWith: (promise: Promise<Reply>) => { reply = promise; } });
    return reply;
  };
  const lifecycle = async (type: string) => {
    let done: Promise<unknown> | undefined;
    handlers[type]({ waitUntil: (promise: Promise<unknown>) => { done = promise; } });
    await done;
  };
  return { entries, cache, caches, fetch, navigate, lifecycle };
}
describe('actual service worker app shell safety', () => {
  it.each([
    response(shell, { status: 503 }), response(shell, { status: 403 }), response(shell, { mime: 'application/pdf' }),
    response(shell, { redirected: true }), response(shell, { type: 'opaque' }), response(shell, { challenge: true }),
    response('<html>Access challenge</html>'),
  ])('does not poison the shell with a failed/non-app navigation', async bad => {
    const sw = worker(); const good = response(); sw.entries.set('/index.html', good);
    sw.fetch.mockResolvedValue(bad); expect(await sw.navigate()).toBe(bad);
    expect(sw.entries.get('/index.html')).toBe(good); expect(sw.cache.put).not.toHaveBeenCalled();
  });
  it('caches a valid navigation and serves it on a later offline deep route', async () => {
    const sw = worker(); await sw.navigate();
    expect(sw.entries.has('/index.html')).toBe(true);
    sw.fetch.mockRejectedValue(new Error('offline'));
    expect(await (await sw.navigate())?.text()).toBe(shell);
  });
  it('returns an honest offline failure when no valid shell was cached', async () => {
    const sw = worker(); sw.entries.set('/index.html', response('bad'));
    sw.fetch.mockRejectedValue(new Error('offline'));
    expect((await sw.navigate())?.status).toBe(503);
  });
  it('validates the installation shell before precaching', async () => {
    const sw = worker(); sw.fetch.mockResolvedValue(response('<html>challenge</html>'));
    await sw.lifecycle('install'); expect(sw.entries.has('/index.html')).toBe(false);
  });
  it('does not discard valid online navigation if cache storage fails', async () => {
    const sw = worker(); sw.caches.open.mockRejectedValue(new Error('quota'));
    expect(await (await sw.navigate())?.text()).toBe(shell);
  });
  it('removes old shell caches without erasing unrelated caches', async () => {
    const sw = worker(); await sw.lifecycle('activate'); expect(sw.caches.delete.mock.calls).toEqual([['sbp-shell-v1']]);
  });
  it('never intercepts tenant API/storage origins', () => {
    const sw = worker(); expect(sw.navigate('https://tenant.supabase.co/storage/v1/object/x')).toBeUndefined();
    expect(sw.navigate('https://app.example/api/private')).toBeUndefined(); expect(sw.fetch).not.toHaveBeenCalled();
  });
  it('ignores an old unversioned WASM cache and fetches without HTTP cache reuse', async () => {
    const sw = worker(); sw.entries.set('https://app.example/wasm/web-ifc.wasm', response('old'));
    sw.fetch.mockResolvedValue(response('new', { mime: 'application/wasm' }));
    expect(await (await sw.navigate('https://app.example/wasm/web-ifc.wasm', 'cors'))?.text()).toBe('new');
    expect(sw.fetch.mock.calls[0][1]).toEqual({ cache: 'no-store' });
  });
  it('different hashed WASM URLs cannot reuse a preceding build binary', async () => {
    const sw = worker(); sw.entries.set('https://app.example/assets/web-ifc-old.wasm', response('old'));
    sw.fetch.mockResolvedValue(response('new', { mime: 'application/wasm' }));
    expect(await (await sw.navigate('https://app.example/assets/web-ifc-new.wasm', 'cors'))?.text()).toBe('new');
  });
});
