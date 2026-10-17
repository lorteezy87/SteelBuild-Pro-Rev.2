import { afterEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ enabled: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.enabled } }));
import { isNativePlatform, isStoreShell } from '../platform';
afterEach(() => { native.enabled = false; vi.unstubAllGlobals(); });
describe('App Store shell presentation', () => {
  it('recognizes iOS through its real plugin runtime', () => {
    native.enabled = true;
    expect(isStoreShell()).toBe(true);
    expect(isNativePlatform()).toBe(true);
  });
  it('recognizes Mac presentation without enabling Capacitor plugins', () => {
    vi.stubGlobal('window', { location: { protocol: 'steelbuild:', hostname: 'localhost' } });
    expect(isStoreShell()).toBe(true);
    expect(isNativePlatform()).toBe(false);
  });
  it.each([
    ['https:', 'steelbuild-pro.com'], ['steelbuild:', 'evil.example'], ['file:', ''],
  ])('keeps other environments on the web path: %s %s', (protocol, hostname) => {
    vi.stubGlobal('window', { location: { protocol, hostname } });
    expect(isStoreShell()).toBe(false);
  });
  it('can run without a browser', () => {
    vi.stubGlobal('window', undefined);
    expect(isStoreShell()).toBe(false);
  });
});
