// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setTag: vi.fn(),
  getInfo: vi.fn(),
  hideSplash: vi.fn(),
}));

vi.mock('@sentry/react', () => ({ setTag: mocks.setTag }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));
vi.mock('@capacitor/app', () => ({
  App: { getInfo: mocks.getInfo, addListener: vi.fn() },
}));
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { addListener: vi.fn() } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: mocks.hideSplash } }));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: vi.fn(), setOverlaysWebView: vi.fn() },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));

import { initNativePlatform } from '../capacitor';

beforeEach(() => {
  mocks.setTag.mockReset();
  mocks.getInfo.mockReset();
  mocks.hideSplash.mockReset().mockResolvedValue(undefined);
});

describe('native crash-report tags', () => {
  it('tags the platform and the app version and build from the native bundle', async () => {
    mocks.getInfo.mockResolvedValue({ name: 'SteelBuild Pro', id: 'com.steelbuildpro.app', version: '1.0', build: '7' });
    await initNativePlatform();
    await vi.waitFor(() => expect(mocks.setTag).toHaveBeenCalledWith('app_build', '7'));
    expect(mocks.setTag).toHaveBeenCalledWith('platform', 'ios');
    expect(mocks.setTag).toHaveBeenCalledWith('app_version', '1.0');
  });

  it('still finishes booting when the version lookup fails', async () => {
    mocks.getInfo.mockRejectedValue(new Error('plugin unavailable'));
    await expect(initNativePlatform()).resolves.toBeUndefined();
    expect(mocks.hideSplash).toHaveBeenCalled();
    expect(mocks.setTag).toHaveBeenCalledWith('platform', 'ios');
    expect(mocks.setTag).not.toHaveBeenCalledWith('app_version', expect.anything());
  });
});
