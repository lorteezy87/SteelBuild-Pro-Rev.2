import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor wraps the built web app (dist/) in a native iOS shell for App Store
// distribution. The web deploy (Cloudflare Workers) is untouched by this file —
// it is read only by the `@capacitor/cli` when syncing/opening the native
// project in ios/.
//
//  - appId  MUST equal the Bundle Identifier you register in App Store Connect
//           and in the Apple Developer portal. Changing it later re-provisions
//           the app, so pick the final value before first submission.
//  - webDir points at Vite's production output; run `npm run build` before any
//           `npx cap sync` so the native app bundles fresh assets.
//
// For local device/simulator development against a live-reload dev server, set
// CAP_SERVER_URL (see docs/app-store/SUBMISSION.md) — it is intentionally unset
// for release builds so the app serves the bundled assets offline.
const devServerUrl = process.env.CAP_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.steelbuildpro.app',
  appName: 'SteelBuild Pro',
  webDir: 'dist',
  ios: {
    // Content sits below the status bar / above the home indicator; the app
    // handles safe-area insets in CSS (see src/styles/base.css). A dark shell
    // matches the default theme so there is no white flash on rotation/keyboard.
    backgroundColor: '#0B0E11',
    contentInset: 'never',
    // Do NOT set limitsNavigationsToAppBoundDomains. It is not what sends
    // links to Safari: Capacitor already opens every top-level navigation and
    // window.open() outside the app in the system browser (WebViewDelegation-
    // Handler in @capacitor/ios). The flag instead limits the webview to the
    // WKAppBoundDomains listed in Info.plist (there are none), and its one
    // use, service workers, the bundled app does not need.
  },
  plugins: {
    StatusBar: {
      // Launch state, applied natively before any JS runs: the webview starts
      // below the status bar over a strip in the dark shell colour with light
      // content. src/lib/native/capacitor.ts re-applies both per theme.
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0B0E11',
    },
    SplashScreen: {
      // The native bootstrap hides the splash once React has mounted
      // (see src/lib/native/capacitor.ts), so disable auto-hide to avoid a
      // flash of an empty webview before hydration.
      launchAutoHide: false,
      backgroundColor: '#0B0E11',
      showSpinner: false,
    },
    Keyboard: {
      // Resize the webview (not just the visual viewport) so inputs stay above
      // the keyboard in native forms.
      resize: 'native',
    },
  },
  ...(devServerUrl
    ? { server: { url: devServerUrl, cleartext: true } }
    : {}),
}

export default config
