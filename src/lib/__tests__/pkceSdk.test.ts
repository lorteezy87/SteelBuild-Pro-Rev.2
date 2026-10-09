import { AuthClient } from '@supabase/auth-js';
import { describe, expect, it, vi } from 'vitest';

// Exercise the installed SDK, including its verifier consumption and events.
// Only the provider HTTP boundary is synthetic; hosted Auth acceptance is separate.
function fixture(verifier?: string, reject = false) {
  const values = new Map<string, string>();
  if (verifier) values.set('pkce-test-code-verifier', JSON.stringify(verifier));
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body));
    if (reject || input.auth_code !== 'issued-code' || input.code_verifier !== 'local-verifier') {
      return new Response(JSON.stringify({ code: 'bad_code_verifier', msg: 'Code expired or verifier does not match' }),
        { status: 400, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
      token_type: 'bearer', expires_in: 3600, user: { id: 'verified-user', aud: 'authenticated',
        email: 'synthetic@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }),
      { headers: { 'content-type': 'application/json' } });
  });
  const client = new AuthClient({ url: 'https://auth.example.invalid', storageKey: 'pkce-test',
    flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false, persistSession: true,
    storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); } }, fetch });
  return { client, fetch, values };
}

describe('installed SDK PKCE exchange', () => {
  it('exchanges a browser-bound verifier, consumes it, and rejects a replay without another provider request', async () => {
    const { client, fetch, values } = fixture('local-verifier');
    const events: string[] = [];
    const { data: { subscription } } = client.onAuthStateChange(event => { events.push(event); });
    const first = await client.exchangeCodeForSession('issued-code');
    expect(first.error).toBeNull();
    expect(first.data.user?.id).toBe('verified-user');
    expect(events).toContain('SIGNED_IN');
    expect(values.has('pkce-test-code-verifier')).toBe(false);
    const replay = await client.exchangeCodeForSession('issued-code');
    expect(replay.error?.code).toBe('pkce_code_verifier_not_found');
    expect(fetch).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });
  it('rejects a code opened outside its requesting browser without network or session adoption', async () => {
    const { client, fetch, values } = fixture();
    const result = await client.exchangeCodeForSession('issued-code');
    expect(result.error?.code).toBe('pkce_code_verifier_not_found');
    expect(result.data.session).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(values.has('pkce-test')).toBe(false);
  });
  it.each(['wrong-verifier', 'local-verifier'])('rejects mismatch/expired provider results and consumes %s', async verifier => {
    const { client, values } = fixture(verifier, true);
    const result = await client.exchangeCodeForSession('issued-code');
    expect(result.error).not.toBeNull();
    expect(result.data.session).toBeNull();
    expect(values.has('pkce-test-code-verifier')).toBe(false);
    expect(values.has('pkce-test')).toBe(false);
  });
  it('emits PASSWORD_RECOVERY from the persisted verifier flow rather than a supplied URL flag', async () => {
    const { client } = fixture('local-verifier/recovery');
    const events: string[] = [];
    const { data: { subscription } } = client.onAuthStateChange(event => { events.push(event); });
    const result = await client.exchangeCodeForSession('issued-code');
    expect(result.error).toBeNull();
    expect(events).toContain('PASSWORD_RECOVERY');
    expect(events).not.toContain('SIGNED_IN');
    subscription.unsubscribe();
  });
});
