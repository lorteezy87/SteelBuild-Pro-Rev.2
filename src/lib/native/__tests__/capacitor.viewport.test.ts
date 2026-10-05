// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/react', () => ({ setTag: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));
vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn().mockResolvedValue({ version: '1.0', build: '1' }), addListener: vi.fn() },
}));
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { addListener: vi.fn() } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: vi.fn(), setBackgroundColor: vi.fn(), setOverlaysWebView: vi.fn() },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));

import { initNativePlatform, lockViewportScale } from '../capacitor';

const INDEX_HTML_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

function setViewport(content: string): HTMLMetaElement {
  document.head.innerHTML = '';
  const meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = content;
  document.head.appendChild(meta);
  return meta;
}

afterEach(() => {
  document.head.innerHTML = '';
});

describe('native viewport scale', () => {
  it('caps the scale at boot so focusing a small input does not zoom the app', async () => {
    const meta = setViewport(INDEX_HTML_VIEWPORT);
    await initNativePlatform();
    expect(meta.content).toBe(`${INDEX_HTML_VIEWPORT}, maximum-scale=1`);
  });

  it('adds the cap once, and leaves an existing cap alone', () => {
    const meta = setViewport(INDEX_HTML_VIEWPORT);
    lockViewportScale();
    lockViewportScale();
    expect(meta.content.match(/maximum-scale/g)).toHaveLength(1);

    const capped = setViewport('width=device-width, maximum-scale=2');
    lockViewportScale();
    expect(capped.content).toBe('width=device-width, maximum-scale=2');
  });

  it('does nothing without a viewport tag', () => {
    document.head.innerHTML = '';
    expect(() => lockViewportScale()).not.toThrow();
  });
});
