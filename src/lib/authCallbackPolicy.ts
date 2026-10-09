/** URL handling never establishes identity: only the SDK's PKCE exchange can. */
const TOKEN_KEYS = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'token_hash'];
const AUTH_KEYS = [...TOKEN_KEYS, 'expires_in', 'expires_at', 'token_type', 'type', 'error', 'error_code', 'error_description'];
const CALLBACK_PATHS = new Set(['/', '/update-password', '/auth/callback']);
const FAILURE = 'This sign-in link could not be accepted. Request a new link and open it in the same browser or app that requested it.';
let callbackFailure: string | null = null;
const failureListeners = new Set<() => void>();
function setCallbackFailure(value: string | null): void {
  if (value === callbackFailure) return;
  callbackFailure = value;
  failureListeners.forEach(listener => listener());
}

export function inspectAuthCallbackUrl(value: string) {
  const url = new URL(value);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const implicit = TOKEN_KEYS.some(key => url.searchParams.has(key) || fragment.has(key));
  const codes = url.searchParams.getAll('code');
  const code = codes[0] ?? null;
  const hasError = ['error', 'error_code', 'error_description'].some(key => url.searchParams.has(key) || fragment.has(key));
  const invalid = implicit || hasError || fragment.has('code') || codes.length > 1 || (codes.length > 0 && !code) || Boolean(code &&
    (!CALLBACK_PATHS.has(url.pathname) || code.length > 4096 || /[\s\x00-\x1f\x7f]/.test(code)));
  let fragmentChanged = false;
  for (const key of AUTH_KEYS) {
    url.searchParams.delete(key);
    if (fragment.has(key)) { fragment.delete(key); fragmentChanged = true; }
  }
  // A hash code is never an accepted PKCE callback for this app.
  if (fragment.has('code')) { fragment.delete('code'); fragmentChanged = true; }
  if (fragmentChanged) url.hash = fragment.toString();
  url.searchParams.delete('code');
  return { code: invalid ? null : code, rejected: invalid, isCallback: implicit || codes.length > 0 || hasError || fragmentChanged,
    recovery: url.pathname === '/update-password', cleanUrl: url.toString(),
    path: `${url.pathname}${url.search}${url.hash}` };
}

/** Run before monitoring or client initialization; never consume bearer tokens from a URL. */
export function rejectImplicitAuthCallback(): void {
  if (typeof window === 'undefined' || typeof window.location?.href !== 'string') return;
  const callback = inspectAuthCallbackUrl(window.location.href);
  if (!callback.rejected) return;
  setCallbackFailure(FAILURE);
  window.history.replaceState(window.history.state, '', callback.path);
}

export function finishAuthCallback(initialUrl: string, failed: boolean): void {
  setCallbackFailure(failed ? FAILURE : null);
  // Never rewrite a different navigation which arrived while Auth was resolving.
  if (typeof window !== 'undefined' && window.location.href === initialUrl) {
    window.history.replaceState(window.history.state, '', inspectAuthCallbackUrl(initialUrl).path);
  }
}

export const authCallbackFailureMessage = () => callbackFailure;
export const clearAuthCallbackFailure = () => { setCallbackFailure(null); };
export const subscribeAuthCallbackFailure = (listener: () => void) => {
  failureListeners.add(listener);
  return () => { failureListeners.delete(listener); };
};

// Keep this small, static and independent of the application route registry:
// monitoring initializes before the application and must not load its pages.
const TELEMETRY_ROUTES = new Set([
  '/', '/Landing', '/Dashboard', '/Projects', '/ProjectDetail', '/Drawings',
  '/DrawingViewer', '/DocumentControl', '/DrawingSubmittalHub', '/RFIs',
  '/ScheduleHub', '/FieldToday', '/ProductionStatus', '/PieceRegister',
  '/Settings', '/EmailInbox', '/update-password', '/auth/callback', '/DesktopConnect',
]);

function telemetryPath(path: string): string {
  if (TELEMETRY_ROUTES.has(path)) return path;
  if (path.startsWith('/storage/v1/')) return '/storage/v1/[object]';
  if (path.startsWith('/rest/v1/')) return '/rest/v1/[resource]';
  if (path.startsWith('/functions/v1/')) return '/functions/v1/[function]';
  if (path.startsWith('/auth/v1/')) return '/auth/v1/[action]';
  if (path.startsWith('/assets/')) return '/assets/[asset]';
  return '/[route]';
}

/** URL paths can contain project IDs, filenames and bearer capabilities too.
 * Preserve only a parsed HTTP origin and a static route/service template. */
export function redactUrl(value: string): string {
  if (/^https?:\/\//i.test(value) || value.startsWith('//')) {
    try {
      const url = new URL(value.startsWith('//') ? `https:${value}` : value);
      return `${url.origin}${telemetryPath(url.pathname)}`;
    } catch { return '[invalid-url]'; }
  }
  if (value.startsWith('/')) {
    try { return telemetryPath(new URL(value, 'https://telemetry.invalid').pathname); }
    catch { return '[invalid-url]'; }
  }
  return '[redacted-url]';
}
