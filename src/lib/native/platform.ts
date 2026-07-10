import { Capacitor } from '@capacitor/core'

/**
 * True when the app is running inside the native (Capacitor iOS) shell rather
 * than a web browser or the test runner.
 *
 * Used to gate web-only UI out of the native App Store build — most importantly
 * the in-app purchase / subscription surface. The iOS app is **sign-in only**
 * (App Store Guideline 3.1.x): accounts and billing are created and managed on
 * the web, so no plan/upgrade/checkout UI may appear natively. Wrapped in
 * try/catch so a missing Capacitor runtime can never throw at import/render.
 */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
