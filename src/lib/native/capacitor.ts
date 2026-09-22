/**
 * Native-platform bootstrap for the Capacitor iOS shell.
 *
 * This module is loaded ONLY inside the native app: main.jsx dynamic-imports it
 * behind `Capacitor.isNativePlatform()`, so none of these plugin packages ship
 * in the web bundle and none of this code runs in a browser or under the test
 * runner. Every side effect is additionally wrapped so that a single failing
 * plugin can never prevent the React app from mounting.
 */
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

function currentTheme(): 'light' | 'dark' {
  // index.html stamps data-theme on <html> before first paint (see the inline
  // theme script); default to dark to match the app's default shell.
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

async function applyStatusBar(): Promise<void> {
  try {
    // Style.Dark = light (white) content for dark backgrounds; Style.Light =
    // dark content for light backgrounds. Match the active theme.
    await StatusBar.setStyle({ style: currentTheme() === 'light' ? Style.Light : Style.Dark })
    // We do not draw behind the status bar — the OS insets the webview below it.
    await StatusBar.setOverlaysWebView({ overlay: false })
  } catch { /* status bar unavailable — non-fatal */ }
}

function markPlatformOnRoot(): void {
  const root = document.documentElement
  root.classList.add('capacitor-native')
  root.classList.add(`capacitor-${Capacitor.getPlatform()}`)
}

function observeThemeForStatusBar(): void {
  try {
    const observer = new MutationObserver(() => { void applyStatusBar() })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
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
    // Router-mounted NativeNavigation owns app links and Android Back.
  } catch { /* never let native setup break app boot */ }

  // Splash auto-hide is disabled in capacitor.config.ts so there is no flash of
  // an empty webview before React hydrates; hide it now that the shell is up.
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 })
  } catch { /* already hidden / unavailable */ }
}
