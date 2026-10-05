// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setStyle: vi.fn(),
  setBackgroundColor: vi.fn(),
  setOverlaysWebView: vi.fn(),
}));

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
  StatusBar: {
    setStyle: mocks.setStyle,
    setBackgroundColor: mocks.setBackgroundColor,
    setOverlaysWebView: mocks.setOverlaysWebView,
  },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));

const originalElementFromPoint = document.elementFromPoint;

function pageTopWith(color: string, parentColor?: string): void {
  const parent = document.createElement('div');
  if (parentColor) parent.style.backgroundColor = parentColor;
  const top = document.createElement('header');
  top.style.backgroundColor = color;
  parent.appendChild(top);
  document.body.appendChild(parent);
  document.elementFromPoint = () => top;
}

async function boot() {
  vi.resetModules();
  const { initNativePlatform } = await import('../capacitor');
  await initNativePlatform();
}

beforeEach(() => {
  mocks.setStyle.mockReset();
  mocks.setBackgroundColor.mockReset();
  mocks.setOverlaysWebView.mockReset();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => {
  document.elementFromPoint = originalElementFromPoint;
});

describe('status bar strip (MOB-10)', () => {
  it('paints a light top edge light, with dark glyphs', async () => {
    pageTopWith('rgb(245, 247, 251)');
    await boot();
    await vi.waitFor(() => expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#F5F7FB' }));
    expect(mocks.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(mocks.setOverlaysWebView).toHaveBeenCalledWith({ overlay: false });
  });

  it('paints a dark top edge dark, with light glyphs', async () => {
    pageTopWith('rgb(11, 14, 17)');
    await boot();
    await vi.waitFor(() => expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#0B0E11' }));
    expect(mocks.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
  });

  it('looks through a transparent top bar to the shell behind it', async () => {
    pageTopWith('rgba(0, 0, 0, 0)', 'rgb(245, 247, 251)');
    await boot();
    await vi.waitFor(() => expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#F5F7FB' }));
  });

  it('falls back to the theme when nothing at the top is painted yet', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    pageTopWith('rgba(0, 0, 0, 0)');
    await boot();
    await vi.waitFor(() => expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#F2F4F5' }));
    expect(mocks.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
  });

  it('repaints when the theme changes', async () => {
    const top = document.createElement('header');
    top.style.backgroundColor = 'rgb(245, 247, 251)';
    document.body.appendChild(top);
    document.elementFromPoint = () => top;
    await boot();
    await vi.waitFor(() => expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#F5F7FB' }));
    top.style.backgroundColor = 'rgb(5, 8, 16)';
    document.documentElement.setAttribute('data-theme', 'dark');
    await vi.waitFor(() => expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#050810' }));
    expect(mocks.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
  });
});
