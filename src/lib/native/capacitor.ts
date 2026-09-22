/**
 * Native-platform bootstrap for the Capacitor iOS shell.
 *
 * This module is loaded ONLY inside the native app: main.jsx dynamic-imports it
 * behind `Capacitor.isNativePlatform()`, so none of these plugin packages ship
 * in the web bundle and none of this code runs in a browser or under the test
 * runner. Every side effect is additionally wrapped so that a single failing
 * plugin can never prevent the React app from mounting.
 */
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { cssColorToHex } from './statusBarColor'

function currentTheme(): 'light' | 'dark' {
  // index.html stamps data-theme on <html> before first paint (see the inline
  // theme script); default to dark to match the app's default shell.
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

let appliedStatusBar = ''

async function applyStatusBar(): Promise<void> {
  try {
    // Style.Dark = light (white) content for dark backgrounds; Style.Light =
    // dark content for light backgrounds. Match the active theme.
    const style = currentTheme() === 'light' ? Style.Light : Style.Dark
    // With the overlay off, the plugin paints its own native strip behind the
    // status bar, black unless told otherwise, which left the light theme's
    // dark clock and battery icons unreadable. Paint it what html/body paint
    // (--bg-page, src/styles/base.css) rather than a second copy of the palette.
    const color = cssColorToHex(getComputedStyle(document.body).backgroundColor)
    const key = `${style}|${color ?? ''}`
    if (key === appliedStatusBar) return
    await StatusBar.setStyle({ style })
    if (color) await StatusBar.setBackgroundColor({ color })
    // We do not draw behind the status bar — the OS insets the webview below it.
    await StatusBar.setOverlaysWebView({ overlay: false })
    appliedStatusBar = key
  } catch { /* status bar unavailable — non-fatal */ }
}

function markPlatformOnRoot(): void {
  const root = document.documentElement
  root.classList.add('capacitor-native')
  root.classList.add(`capacitor-${Capacitor.getPlatform()}`)
}

function observeThemeForStatusBar(): void {
  try {
    // The page colour follows the steelbuild-dark class as well as data-theme
    // (tokens.css remaps --bg-page under it), so watch both. Unrelated class
    // changes (keyboard-open) re-run this too; the applied-state check makes
    // them free.
    const observer = new MutationObserver(() => { void applyStatusBar() })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  } catch { /* MutationObserver is always present on iOS WKWebView */ }
}

function wireKeyboardClasses(): void {
  try {
    void Keyboard.addListener('keyboardWillShow', () => {
      document.documentElement.classList.add('keyboard-open')
    })
    void Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.classList.remove('keyboard-open')
    })
  } catch { /* keyboard events optional */ }
}

function extractInAppPath(url: string): string | null {
  try {
    const u = new URL(url)
    // Only follow Universal Links to our own site. Custom-scheme URLs (e.g. auth
    // callbacks) are handled by their own flows and must not be hijacked here.
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const path = `${u.pathname}${u.search}${u.hash}`
    return path && path !== '/' ? path : null
  } catch {
    return null
  }
}

function wireDeepLinks(): void {
  try {
    void App.addListener('appUrlOpen', (event) => {
      const path = extractInAppPath(event?.url || '')
      if (!path) return
      // Hand the path to the SPA router via the History API + popstate;
      // react-router's BrowserRouter listens for popstate.
      window.history.pushState({}, '', path)
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
  } catch { /* deep links optional */ }
}

/**
 * Idempotent entry point. Safe to call on any platform — returns immediately
 * unless running inside the native shell.
 */
export async function initNativePlatform(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    markPlatformOnRoot()
    void applyStatusBar()
    observeThemeForStatusBar()
    wireKeyboardClasses()
    wireDeepLinks()
  } catch { /* never let native setup break app boot */ }

  // Splash auto-hide is disabled in capacitor.config.ts so there is no flash of
  // an empty webview before React hydrates; hide it now that the shell is up.
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 })
  } catch { /* already hidden / unavailable */ }
}
