// @vitest-environment jsdom
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const PREFIX = 'sbp:password-recovery:v1:';
const COOKIE = 'sbp_recovery_hold_';
const session = (id = 'a', token = `token-${id}`) => ({ user: { id }, access_token: token }) as Session;
const load = () => import('../passwordRecovery');
const stored = () => Object.keys(localStorage).filter(key => key.startsWith(PREFIX));
const record = (id = 'newer', userId = 'b') => ({ version: 1, id, userId, phase: 'password', createdAt: Date.now() + 1 });
function clearCookies() {
  for (const part of document.cookie.split('; ')) {
    const name = part.split('=')[0];
    if (name.startsWith(COOKIE)) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}
beforeEach(() => {
  vi.resetModules(); localStorage.clear(); sessionStorage.clear(); clearCookies();
  window.history.replaceState({}, '', '/');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('deny-only recovery persistence', () => {
  it('binds a warm native callback hint to its SDK recovery event without orphaning a hold', async () => {
    const store = await load();
    expect(store.getPasswordRecoveryHold()).toBeNull();
    store.preparePasswordRecoveryCallback();
    expect(store.getPasswordRecoveryHold()?.phase).toBe('unresolved');
    store.capturePasswordRecovery(session());
    expect(stored()).toHaveLength(1);
    expect(store.getPasswordRecoveryHold()).toMatchObject({ userId: 'a', phase: 'password' });
  });
  it('restores owner and updated phase in a fresh runtime without storing credentials', async () => {
    const store = await load(); store.capturePasswordRecovery(session());
    store.markRecoveryPasswordUpdated(store.getPasswordRecoveryHold()!.id);
    expect(localStorage.getItem(stored()[0])).not.toContain('token-a');
    vi.resetModules();
    expect((await load()).getPasswordRecoveryHold()).toMatchObject({ userId: 'a', phase: 'updated' });
  });

  it('holds a reload when writes fail while reads and the existing SDK session remain available', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const store = await load(); store.capturePasswordRecovery(session());
    expect(stored()).toHaveLength(0);
    expect(store.recoveryAppliesTo(store.getPasswordRecoveryHold(), 'a')).toBe(true);
    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.recoveryAppliesTo(reloaded.getPasswordRecoveryHold(), 'a')).toBe(true);
  });

  it('holds a new tab when failed persistence later recovers and clears its own cookie on sign-out', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const store = await load(); store.capturePasswordRecovery(session());
    expect(document.cookie).not.toContain('token-a');
    expect(document.cookie).not.toContain('userId');
    write.mockRestore(); window.history.replaceState({}, '', '/'); vi.resetModules();
    const newTab = await load();
    expect(newTab.getPasswordRecoveryHold()).toMatchObject({ userId: null, phase: 'unresolved' });
    expect(newTab.clearPasswordRecoveryAfterSignOut(newTab.getPasswordRecoveryHold()!.id)).toBe(true);
    expect(document.cookie).not.toContain(COOKIE);
  });

  it('never deletes another lifecycle cookie, including one created during removal', async () => {
    const store = await load(); store.capturePasswordRecovery(session());
    const old = store.getPasswordRecoveryHold()!;
    const remove = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key: string) {
      document.cookie = `${COOKIE}newer=1; Path=/`;
      remove.call(this, key);
    });
    expect(store.clearPasswordRecoveryAfterSignOut(old.id)).toBe(false);
    expect(document.cookie).toContain(`${COOKIE}newer=1`);
    expect(store.getPasswordRecoveryHold()).toMatchObject({ userId: null, phase: 'unresolved' });
  });

  it.each(['{broken', '{}', 'null'])('holds malformed persisted state: %s', async raw => {
    localStorage.setItem(`${PREFIX}malformed`, raw);
    expect((await load()).getPasswordRecoveryHold()).toMatchObject({ userId: null, phase: 'unresolved' });
  });

  it('holds unavailable storage and failed marker cleanup', async () => {
    vi.spyOn(Storage.prototype, 'length', 'get').mockImplementation(() => { throw new Error('disabled'); });
    const store = await load(); const old = store.getPasswordRecoveryHold()!;
    expect(old.phase).toBe('unresolved');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('disabled'); });
    expect(store.clearPasswordRecoveryAfterSignOut(old.id)).toBe(false);
    expect(store.getPasswordRecoveryHold()).not.toBeNull();
  });

  it('never erases a newer marker even if another tab writes it inside the old marker removal', async () => {
    const store = await load(); store.capturePasswordRecovery(session());
    const old = store.getPasswordRecoveryHold()!;
    const newer = record();
    const remove = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key: string) {
      localStorage.setItem(`${PREFIX}newer`, JSON.stringify(newer));
      remove.call(this, key);
    });
    expect(store.clearPasswordRecoveryAfterSignOut(old.id)).toBe(false);
    expect(JSON.parse(localStorage.getItem(`${PREFIX}newer`)!)).toEqual(newer);
    vi.resetModules();
    expect((await load()).getPasswordRecoveryHold()).toMatchObject({ userId: 'b', phase: 'password' });
  });

  it('never overwrites another lifecycle while saving password-updated phase', async () => {
    const store = await load(); store.capturePasswordRecovery(session());
    const old = store.getPasswordRecoveryHold()!;
    const newer = record();
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      write.call(this, `${PREFIX}newer`, JSON.stringify(newer));
      write.call(this, key, value);
    });
    store.markRecoveryPasswordUpdated(old.id);
    expect(JSON.parse(localStorage.getItem(`${PREFIX}newer`)!)).toEqual(newer);
    expect(store.recoveryAppliesTo(store.getPasswordRecoveryHold(), 'a')).toBe(true);
  });

  it('keeps A held when another owner marker arrives before the SDK identity changes', async () => {
    const store = await load(); store.capturePasswordRecovery(session());
    const unsubscribe = store.subscribePasswordRecovery(() => {});
    const newer = record();
    window.dispatchEvent(new StorageEvent('storage', { key: `${PREFIX}newer`, newValue: JSON.stringify(newer) }));
    expect(store.recoveryAppliesTo(store.getPasswordRecoveryHold(), 'a')).toBe(true);
    unsubscribe();
  });

  it('does not treat storage deletion as authenticated sign-out', async () => {
    const store = await load(); store.capturePasswordRecovery(session());
    const old = store.getPasswordRecoveryHold();
    const unsubscribe = store.subscribePasswordRecovery(() => {});
    window.dispatchEvent(new StorageEvent('storage', { key: stored()[0], newValue: null }));
    expect(store.getPasswordRecoveryHold()).toBe(old);
    unsubscribe();
  });

  it('binds the unresolved URL hint to its verified event without leaving an orphan hold', async () => {
    window.history.replaceState({}, '', '/update-password');
    const store = await load();
    expect(store.getPasswordRecoveryHold()).toMatchObject({ userId: null, phase: 'unresolved' });
    store.capturePasswordRecovery(session());
    expect(stored()).toHaveLength(1);
    expect(store.getPasswordRecoveryHold()).toMatchObject({ userId: 'a', phase: 'password' });
    expect(store.clearPasswordRecoveryAfterSignOut(store.getPasswordRecoveryHold()!.id, 'a')).toBe(true);
    expect(stored()).toHaveLength(0);
  });

  it('does not create a hold or cookie on normal boot', async () => {
    expect((await load()).getPasswordRecoveryHold()).toBeNull();
    expect(document.cookie).not.toContain(COOKIE);
    expect(stored()).toHaveLength(0);
  });

  it('never reuses another runtime’s unresolved lifecycle for a fresh recovery', async () => {
    const first = await load(); first.capturePasswordRecovery(null);
    const old = first.getPasswordRecoveryHold()!;
    const oldKeys = stored();
    vi.resetModules();
    const second = await load(); second.capturePasswordRecovery(session('b'));
    const newKey = stored().find(key => !oldKeys.includes(key))!;
    expect(newKey).toBeDefined();
    expect(first.clearPasswordRecoveryAfterSignOut(old.id)).toBe(false);
    expect(JSON.parse(localStorage.getItem(newKey)!)).toMatchObject({ userId: 'b', phase: 'password' });
  });
});
