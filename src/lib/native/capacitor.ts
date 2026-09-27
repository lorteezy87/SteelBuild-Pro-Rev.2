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
import * as Sentry from '@sentry/react'

function currentTheme(): 'light' | 'dark' {
  // index.html stamps data-theme on <html> before first paint (see the inline
  // theme script); default to dark to match the app's default shell.
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

type Rgb = [number, number, number]

function parseRgb(value: string): { rgb: Rgb; alpha: number } | null {
  const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)/.exec(value)
  if (!m) return null
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) }
}

/**
 * The color the page shows along its top edge: the first opaque background
 * under the top-center point, walking up from the element there (the top bar
 * is transparent and shows the shell behind it). Null before layout.
 */
export function topEdgeColor(): Rgb | null {
  const fromPoint = typeof document.elementFromPoint === 'function'
    ? document.elementFromPoint(window.innerWidth / 2, 1)
    : null
  for (let el: Element | null = fromPoint ?? document.body; el; el = el.parentElement) {
    const parsed = parseRgb(getComputedStyle(el).backgroundColor)
    if (parsed && parsed.alpha >= 0.99) return parsed.rgb
  }
  return null
}

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()

// Perceived brightness (0-255); above this, dark status bar glyphs read best.
const isLight = ([r, g, b]: Rgb): boolean => 0.299 * r + 0.587 * g + 0.114 * b > 150

let paintedStrip = ''

async function applyStatusBar(): Promise<void> {
  try {
    // We do not draw behind the status bar — the OS insets the webview below it.
    await StatusBar.setOverlaysWebView({ overlay: false })
    // The strip behind the status bar is then a native view, black unless told
    // otherwise, so the light theme got dark glyphs on black (MOB-10). Paint it
    // the color along the page's top edge and pick glyphs that read on it.
    // Style.Dark = light (white) glyphs; Style.Light = dark glyphs.
    const rgb = topEdgeColor()
    const light = rgb ? isLight(rgb) : currentTheme() === 'light'
    const hex = rgb ? toHex(rgb) : light ? '#F2F4F5' : '#0B0E11'
    if (hex === paintedStrip) return
    paintedStrip = hex
    await StatusBar.setBackgroundColor({ color: hex })
    await StatusBar.setStyle({ style: light ? Style.Light : Style.Dark })
  } catch { /* status bar unavailable — non-fatal */ }
}

/**
 * iOS zooms the page in whenever an input with text under 16px takes focus,
 * and the app's inputs are 11-13px, so opening the project picker or any form
 * left the whole screen zoomed and cut off. Capping the scale stops that inside
 * the app shell; web browsers keep pinch zoom, since this only runs natively.
 */
export function lockViewportScale(): void {
  const meta = document.querySelector('meta[name="viewport"]')
  const content = meta?.getAttribute('content') ?? ''
  if (!meta || /maximum-scale/i.test(content)) return
  meta.setAttribute('content', content ? `${content}, maximum-scale=1` : 'maximum-scale=1')
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
    // Screens change color too (the dark legal pages, sign-in vs the app
    // shell), so re-check the top edge once the page settles after a change.
    let pending: ReturnType<typeof setTimeout> | undefined
    const settle = new MutationObserver(() => {
      clearTimeout(pending)
      pending = setTimeout(() => { void applyStatusBar() }, 250)
    })
    settle.observe(document.body, { childList: true, subtree: true })
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
 * Tag crash reports with the platform and the native app's version and build,
 * so iOS errors can be told apart from the web's and traced to a TestFlight or
 * App Store build. The web release comes from VITE_APP_VERSION in CI; a Mac
 * `cap:sync` build has none, so these tags are what identify it.
 */
async function tagCrashReports(): Promise<void> {
  try {
    Sentry.setTag('platform', Capacitor.getPlatform())
    const info = await App.getInfo()
    Sentry.setTag('app_version', info.version)
    Sentry.setTag('app_build', info.build)
  } catch { /* crash tags are optional */ }
}

/**
 * Idempotent entry point. Safe to call on any platform — returns immediately
 * unless running inside the native shell.
 */
export async function initNativePlatform(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    markPlatformOnRoot()
    lockViewportScale()
    void applyStatusBar()
    observeThemeForStatusBar()
    wireKeyboardClasses()
    wireDeepLinks()
    void tagCrashReports()
  } catch { /* never let native setup break app boot */ }

  // Splash auto-hide is disabled in capacitor.config.ts so there is no flash of
  // an empty webview before React hydrates; hide it now that the shell is up.
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 })
  } catch { /* already hidden / unavailable */ }
}
