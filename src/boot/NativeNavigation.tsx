import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { extractInAppPath, NATIVE_BACK_EVENT } from '@/lib/native/navigation';

/** Mount within the router, so links participate in its history and auth gates. */
export default function NativeNavigation(): null {
  const navigate = useNavigate();
  const location = useLocation();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const current = useRef(location);
  current.current = location;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let receivedLink = false;
    const initialKey = current.current.key;
    const handles: PluginListenerHandle[] = [];
    const register = (promise: Promise<PluginListenerHandle>) => {
      void promise.then(handle => { if (disposed) void handle.remove().catch(() => {}); else handles.push(handle); }).catch(() => {});
    };
    const route = (url: string) => {
      const path = extractInAppPath(url);
      if (!disposed && path) navigateRef.current(path, { replace: true });
    };
    register(App.addListener('appUrlOpen', ({ url }) => { receivedLink = true; route(url); }));
    void App.getLaunchUrl().then(result => {
      if (!receivedLink && current.current.key === initialKey && result?.url) route(result.url);
    }).catch(() => {});
    if (Capacitor.getPlatform() === 'android') {
      register(App.addListener('backButton', () => {
        if (disposed) return;
        const event = new Event(NATIVE_BACK_EVENT, { cancelable: true });
        if (!window.dispatchEvent(event)) return;
        if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) navigateRef.current(-1);
        else if (current.current.pathname !== '/' || current.current.search || current.current.hash) navigateRef.current('/', { replace: true });
        else void App.minimizeApp().catch(() => {});
      }));
    }
    return () => { disposed = true; handles.forEach(handle => { void handle.remove().catch(() => {}); }); };
  }, []);
  return null;
}
