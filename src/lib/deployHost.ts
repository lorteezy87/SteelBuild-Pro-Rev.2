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
 * Both used to hard-code a Vercel-only rule inline, twice. It lives here once,
 * pure and unit-tested, because the set of preview host families changes as
 * hosting does — it already has.
 *
 * Host families:
 *   • *.workers.dev     — ALWAYS preview. Cloudflare production is served from
 *                         the custom domain (steelbuild-pro.com); the
 *                         workers.dev subdomain and the per-version preview
 *                         URLs are only ever used for review.
 *   • *.netlify.app     — preview ONLY when the label carries Netlify's `--`
 *                         separator: `deploy-preview-309--site.netlify.app`
 *                         (pull requests) and `branch-name--site.netlify.app`
 *                         (branch deploys). The bare `site.netlify.app` is
 *                         Netlify's production URL for the site, so it is NOT
 *                         a preview.
 *
 * Vercel is deliberately absent: that account is gone and its config has been
 * removed from the repo, so a *.vercel.app origin can no longer be served.
 *
 * Anything else — the custom domain, localhost, a Capacitor webview — is not a
 * preview and is left alone. Callers handle localhost separately because the
 * two gates disagree about it: the manifest is wanted in local dev, a service
 * worker is not (it fights Vite HMR).
 */

/**
 * True when `hostname` belongs to a preview deployment.
 * Case-insensitive: hostnames are case-insensitive per RFC 4343, and
 * `window.location.hostname` is already lowercased by the browser, but a
 * caller passing a raw header value should not get a wrong answer.
 */
export function isPreviewDeployHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase();

  if (host.endsWith(".workers.dev")) return true;

  // `deploy-preview-309--site.netlify.app` / `my-branch--site.netlify.app`.
  // Netlify only ever puts `--` in the leftmost label, and never in the bare
  // production hostname, so that separator is the whole test.
  if (host.endsWith(".netlify.app")) {
    const label = host.slice(0, -".netlify.app".length);
    return label.includes("--");
  }

  return false;
}
