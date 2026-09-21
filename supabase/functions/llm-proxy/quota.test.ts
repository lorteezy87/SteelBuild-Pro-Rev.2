import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkUserQuota } from './quota';

describe('configured AI quotas', () => {
  let env: Record<string, string>;
  beforeEach(() => {
    env = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key', LLM_DAILY_REQUEST_LIMIT: '100' };
    vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] } });
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('fails closed regardless of a routing label when usage is unavailable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await expect(checkUserQuota('user-id')).resolves.toMatchObject({ ok: false, status: 503 });
  });
  it.each([{ rows: [] }, { rows: [{ request_count: 'invalid', cost_sum: '0' }] }, { rows: [{ request_count: 0 }] }])('rejects malformed usage data $rows', async ({ rows }) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(rows));
    await expect(checkUserQuota('user-id')).resolves.toMatchObject({ ok: false, status: 503 });
  });
  it('accepts verified zero usage', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json([{ request_count: '0', cost_sum: '0' }]));
    await expect(checkUserQuota('user-id')).resolves.toEqual({ ok: true });
  });
  it('blocks the request at the configured cap', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json([{ request_count: '100', cost_sum: '0' }]));
    await expect(checkUserQuota('user-id')).resolves.toMatchObject({ ok: false, status: 429 });
  });
  it('preserves explicitly disabled quotas', async () => {
    delete env.LLM_DAILY_REQUEST_LIMIT;
    await expect(checkUserQuota('user-id')).resolves.toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not silently disable a malformed cap', async () => {
    env.LLM_DAILY_REQUEST_LIMIT = 'invalid';
    await expect(checkUserQuota('user-id')).resolves.toMatchObject({ ok: false, status: 503 });
  });
});
