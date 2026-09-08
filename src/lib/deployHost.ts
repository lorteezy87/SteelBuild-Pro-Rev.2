/**
 * deployHost.ts — is this hostname a throwaway preview deployment?
 *
 * Two things in main.jsx must never run on a preview origin:
 *   1. the PWA manifest link (installing "SteelBuild Pro" from a preview URL
 *      pins the shortcut to a deployment that gets torn down), and
 *   2. the service worker (public/sw.js caches an app shell under the origin
 *      it was registered on — on a preview that shell is auth-walled junk that
 *      then outlives the deployment in the user's browser).
 *
 * Both used to hard-code the Vercel rule inline, twice. Cloudflare adds a
 * second family of preview hostnames, so the predicate lives here once, is
 * pure, and is unit-tested.
 *
 * Host families:
 *   • *.vercel.app      — preview, EXCEPT the steelbuild-pro.vercel.app alias,
 *                         which Vercel points at the current production
 *                         deployment. That alias is a real production origin.
 *   • *.workers.dev     — ALWAYS preview. Cloudflare production is served from
 *                         the custom domain (steelbuild-pro.com); the
 *                         workers.dev subdomain and per-version preview URLs
 *                         are only ever used for review. There is no
 *                         workers.dev equivalent of the Vercel production
 *                         alias, so no exception belongs here.
 *
 * Anything else — the custom domains, localhost, a Capacitor webview — is not
 * a preview and is left alone by this predicate. Callers handle localhost
 * separately because the two gates disagree about it: the manifest is wanted
 * in local dev, a service worker is not (it fights Vite HMR).
 */

/** The one *.vercel.app host that is production, not a preview. */
const VERCEL_PRODUCTION_ALIAS = "steelbuild-pro.vercel.app";

/**
 * True when `hostname` belongs to a preview deployment on either host.
 * Case-insensitive: hostnames are case-insensitive per RFC 4343, and
 * `window.location.hostname` is already lowercased by the browser, but a
 * caller passing a raw header value should not get a wrong answer.
 */
export function isPreviewDeployHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase();

  if (host.endsWith(".workers.dev")) return true;
  if (host.endsWith(".vercel.app")) return host !== VERCEL_PRODUCTION_ALIAS;

  return false;
}
