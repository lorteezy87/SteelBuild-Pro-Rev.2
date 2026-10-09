import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corsHeaders } from '../../_shared/cors';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const executable = ts.transpileModule(source.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getText(source)).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
type Handler = (request: Request) => Promise<Response>;
function fixture(fetchImpl = vi.fn(async () => new Response(null)), configured = true) {
  let handler: Handler;
  const runtime = { env: { get: (key: string) => configured ? ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-secret' })[key] : undefined }, serve: (value: Handler) => { handler = value; } };
  vi.stubGlobal('Deno', runtime);
  new Function('Deno', 'corsHeaders', 'fetch', executable)(runtime, corsHeaders, fetchImpl);
  return { call: (path = '/', method = 'GET') => handler(new Request(`https://test.invalid${path}`, { method })), fetch: fetchImpl };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('actual health entrypoint', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('rejects %s without database work', async method => {
    const value = fixture();
    expect((await value.call('/', method)).status).toBe(405);
    expect(value.fetch).not.toHaveBeenCalled();
  });
  it('provides cheap liveness without implying database readiness', async () => {
    const value = fixture();
    expect(await (await value.call('/?mode=live')).json()).toEqual({ status: 'ok', db: 'not_checked' });
    expect(value.fetch).not.toHaveBeenCalled();
  });
  it('coalesces concurrent probes and reuses only a short readiness result', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const value = fixture();
    const responses = await Promise.all(Array.from({ length: 20 }, () => value.call()));
    expect(responses.every(r => r.status === 200)).toBe(true);
    await value.call();
    expect(value.fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 5_001);
    await value.call();
    expect(value.fetch).toHaveBeenCalledTimes(2);
  });
  it('sends a bounded HEAD query and returns a bodyless HEAD probe', async () => {
    const value = fixture();
    const result = await value.call('/', 'HEAD');
    expect(await result.text()).toBe('');
    const options = (value.fetch.mock.calls as unknown[][])[0][1] as RequestInit;
    expect(options.method).toBe('HEAD');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe('error');
  });
  it('returns safe degraded response on provider failure or missing configuration', async () => {
    const failed = fixture(vi.fn().mockRejectedValue(new Error('synthetic-secret')));
    const response = await failed.call();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic-secret');
    const missing = fixture(undefined, false);
    expect(await (await missing.call()).json()).toMatchObject({ status: 'degraded', db: 'unconfigured' });
    expect(missing.fetch).not.toHaveBeenCalled();
  });
});
