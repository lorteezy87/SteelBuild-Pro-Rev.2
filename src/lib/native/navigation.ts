const TRUSTED_ORIGINS = new Set(['https://steelbuild-pro.com', 'https://www.steelbuild-pro.com']);

/** Auth links finish in the hosted browser flow; never put credentials in SPA history. */
export function extractInAppPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!TRUSTED_ORIGINS.has(url.origin) || url.username || url.password) return null;
    const decodedPath = decodeURIComponent(url.pathname);
    if (decodedPath.startsWith('//') || decodedPath.includes('\\') || /[\u0000-\u001f]/.test(decodedPath)) return null;
    if (/^\/(update-password|auth)(\/|$)/i.test(url.pathname)) return null;
    const fragment = new URLSearchParams(url.hash.slice(1));
    for (const key of ['access_token', 'refresh_token', 'code', 'token_hash', 'error', 'error_code']) {
      if (url.searchParams.has(key) || fragment.has(key)) return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export function passwordResetRedirect(native: boolean, origin: string): string {
  return `${native ? 'https://steelbuild-pro.com' : origin}/update-password`;
}

export const NATIVE_BACK_EVENT = 'steelbuild:native-back';
