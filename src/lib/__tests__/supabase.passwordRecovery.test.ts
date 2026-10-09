// @vitest-environment jsdom
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callback: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  onCreate: vi.fn(),
  initialize: vi.fn(),
}));
vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'test-anon' } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => {
  mocks.onCreate(...args);
  return { auth: { initialize: mocks.initialize, onAuthStateChange: (callback: typeof mocks.callback) => {
    mocks.callback = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  } } };
} }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  document.cookie = 'sbp_recovery_hold=; Max-Age=0; Path=/';
  window.history.replaceState({}, '', '/');
  mocks.initialize.mockResolvedValue({ error: null });
});

it('scrubs an unconsumed code and explains a missing browser verifier', async () => {
  window.history.replaceState({}, '', '/?code=unbound-code');
  await import('../supabase');
  await vi.waitFor(() => expect(window.location.search).toBe(''));
  const policy = await import('../authCallbackPolicy');
  expect(policy.authCallbackFailureMessage()).toContain('same browser or app');
  expect(mocks.initialize).toHaveBeenCalledTimes(1);
});

it('uses PKCE and rejects unsolicited implicit credentials before creating the SDK', async () => {
  window.history.replaceState({}, '', '/#access_token=untrusted-access&refresh_token=untrusted-refresh&type=recovery');
  mocks.onCreate.mockImplementation((_url, _key, options) => {
    expect(options.auth.flowType).toBe('pkce');
    expect(window.location.href).not.toContain('untrusted');
  });
  await import('../supabase');
  expect(mocks.onCreate).toHaveBeenCalledTimes(1);
});

it('captures a recovery URL before the SDK initializes and captures its event before React mounts', async () => {
  window.history.replaceState({}, '', '/update-password#type=recovery');
  mocks.onCreate.mockImplementation(() => {
    expect(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('sbp:password-recovery:v1:'))!)!)).toMatchObject({ phase: 'unresolved', userId: null });
    window.history.replaceState({}, '', '/update-password');
  });
  await import('../supabase');
  const session = { user: { id: 'a' }, access_token: 'secret-token' } as Session;
  expect(mocks.callback?.('PASSWORD_RECOVERY', session)).toBeUndefined();
  const store = await import('../passwordRecovery');
  expect(store.getPasswordRecoveryHold()).toMatchObject({ userId: 'a', phase: 'password' });
  expect(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('sbp:password-recovery:v1:'))!)).not.toContain('secret-token');
  const id = store.getPasswordRecoveryHold()!.id;
  store.markRecoveryPasswordUpdated(id);
  store.capturePasswordRecovery(session);
  expect(store.getPasswordRecoveryHold()?.phase).toBe('updated');
  expect(mocks.callback?.('INITIAL_SESSION', session)).toBeUndefined();
  expect(store.getPasswordRecoveryHold()?.phase).toBe('updated');
});
