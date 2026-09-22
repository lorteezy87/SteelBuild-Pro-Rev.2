// @vitest-environment jsdom
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import NativeNavigation from '../NativeNavigation';
const mocks = vi.hoisted(() => ({ native: true, platform: 'android', callbacks: {} as Record<string, (event: { url?: string }) => void>, remove: vi.fn().mockResolvedValue(undefined), launch: vi.fn(), minimize: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => mocks.platform } }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (event: string, callback: (event: { url?: string }) => void) => { mocks.callbacks[event] = callback; return { remove: mocks.remove }; }),
  getLaunchUrl: mocks.launch,
  minimizeApp: mocks.minimize,
} }));
function Path() { const location = useLocation(); return <output data-testid="path">{location.pathname}{location.search}{location.hash}</output>; }
function mount() { return render(<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NativeNavigation /><Path /></BrowserRouter>); }
beforeEach(() => { vi.clearAllMocks(); mocks.callbacks = {}; mocks.native = true; mocks.platform = 'android'; mocks.launch.mockResolvedValue(undefined); window.history.replaceState({ idx: 0 }, '', '/'); });
afterEach(cleanup);
describe('native router bridge', () => {
  it('routes a cold launch after the router mounts and does not replay it after navigation', async () => {
    mocks.launch.mockResolvedValue({ url: 'https://steelbuild-pro.com/RFIs?id=7' }); mount();
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/RFIs?id=7'));
    act(() => mocks.callbacks.appUrlOpen({ url: 'https://steelbuild-pro.com/Drawings' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/Drawings');
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    act(() => mocks.callbacks.appUrlOpen({ url: 'https://evil.test/Billing' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/Drawings');
  });
  it('ignores a stale launch URL after a warm link arrives', async () => {
    let resolve!: (value: { url: string }) => void;
    mocks.launch.mockReturnValue(new Promise(r => { resolve = r; })); mount();
    act(() => mocks.callbacks.appUrlOpen({ url: 'https://steelbuild-pro.com/Drawings' }));
    await act(async () => resolve({ url: 'https://steelbuild-pro.com/RFIs' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/Drawings');
  });
  it('returns a direct deep link to root then minimizes', async () => {
    window.history.replaceState({ idx: 0 }, '', '/RFIs'); mount();
    act(() => mocks.callbacks.backButton({}));
    expect(screen.getByTestId('path').textContent).toBe('/');
    act(() => mocks.callbacks.backButton({}));
    expect(mocks.minimize).toHaveBeenCalledTimes(1);
  });
  it('uses router history when a previous in-app entry exists', () => {
    window.history.replaceState({ idx: 1 }, '', '/RFIs'); const back = vi.spyOn(window.history, 'go').mockImplementation(() => {}); mount();
    act(() => mocks.callbacks.backButton({})); expect(back).toHaveBeenCalledWith(-1); expect(mocks.minimize).not.toHaveBeenCalled(); back.mockRestore();
  });
  it('allows the reset screen to consume Back', () => {
    mount(); const handler = (e: Event) => e.preventDefault(); window.addEventListener('steelbuild:native-back', handler);
    act(() => mocks.callbacks.backButton({})); expect(mocks.minimize).not.toHaveBeenCalled(); window.removeEventListener('steelbuild:native-back', handler);
  });
  it('removes listeners on unmount', async () => {
    const view = mount(); await act(async () => {}); view.unmount(); expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
  it('does not install native listeners on web', () => { mocks.native = false; mount(); expect(mocks.launch).not.toHaveBeenCalled(); expect(mocks.callbacks).toEqual({}); });
  it('does not register an Android Back handler on iOS', () => { mocks.platform = 'ios'; mount(); expect(mocks.callbacks.backButton).toBeUndefined(); });
});
