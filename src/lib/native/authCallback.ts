import { finishAuthCallback, inspectAuthCallbackUrl } from '@/lib/authCallbackPolicy';

interface NativeCallbackDependencies {
  exchangeCode(code: string): Promise<{ error: unknown }>;
  prepareRecovery(): void;
  navigate(path: string): void;
}
// Capacitor can deliver the cold-launch URL and the same appUrlOpen event.
// Keep only a bounded in-memory replay set, never persist or log callback codes.
const consumedCodes = new Set<string>();
let exchanging = false;

/** PKCE exchanges remain in the requesting webview; URL bearer sessions are rejected. */
export async function handleNativeAuthCallback(value: string, deps: NativeCallbackDependencies): Promise<boolean> {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || !['steelbuild-pro.com', 'www.steelbuild-pro.com'].includes(url.hostname) ||
    url.port || url.username || url.password) return false;
  const callback = inspectAuthCallbackUrl(value);
  if (!callback.isCallback) return false;
  // One webview has one PKCE verifier. Never let a second callback race the
  // active exchange or replace its recovery route while it is resolving.
  if (exchanging) return true;
  if (callback.code) {
    if (consumedCodes.has(callback.code)) return true;
    consumedCodes.add(callback.code);
    if (consumedCodes.size > 32) consumedCodes.delete(consumedCodes.values().next().value!);
  }
  if (callback.recovery) deps.prepareRecovery();
  // Never place the secret code or rejected fragment into browser history.
  deps.navigate(callback.path);
  if (!callback.code || callback.rejected) { finishAuthCallback(value, true); return true; }
  exchanging = true;
  try {
    const result = await deps.exchangeCode(callback.code);
    finishAuthCallback(value, Boolean(result.error));
  } catch { finishAuthCallback(value, true); }
  finally { exchanging = false; }
  return true;
}
