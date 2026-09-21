# Vercel → Cloudflare Workers — Migration Runbook

**SteelBuild Pro — hosting migration**
Purpose: make Cloudflare Workers the production host for the web frontend, and retire everything else.

> **The Vercel account is closed.** This is not a dual-run migration with a Vercel fallback — there is no Vercel to fall back to. The `deploy` and `deploy-staging` jobs have been deleted from `ci.yml`, along with `vercel.json`, `.vercelignore` and the Skew Protection helper, because they could only ever fail.

> **Consequence, stated plainly:** until you complete the owner steps below and set `CLOUDFLARE_ENABLED=true`, **a push to `main` deploys nowhere.** That is deliberate — publishing before the secrets exist would ship an app that cannot reach Supabase — but it does mean nothing ships until you flip it.

Refs:
- Cloudflare Worker: `steelbuild-pro-rev-2` · Repo: `lorteezy87/SteelBuild-Pro-Rev.2`
- Production domain: `steelbuild-pro.com` · Supabase (unchanged): `kjrwqagyeswwoxpjkcko`
- Also connected and to be retired: the Netlify site `steelbuild-pro` (step 2b)

---

## Target architecture

```
 main ──CI gate (lint/type/test/build)── deploy-cloudflare ──▶ Workers ──▶ steelbuild-pro.com

 PR   ──CI gate ─────────────────────── preview-cloudflare ──▶ versioned preview URL
```

- **One gate, one publisher.** `deploy-cloudflare` needs `ci`, so a red lint/typecheck/test/build cannot reach production. This holds **only** while it is the sole publisher — see step 2.
- **Previews cannot become production.** `preview-cloudflare` runs `wrangler versions upload`, which uploads a version without promoting it. Only `wrangler deploy` promotes.
- **Nothing else moves.** Supabase (DB, auth, storage, edge functions), Stripe, and Sentry are untouched. This migration is the static frontend only.

---

## What was ported (already done in code)

| Old Vercel mechanism | Now | Where |
|---|---|---|
| `vercel.json` `headers` — 6 security headers + CSP-Report-Only | `_headers` file, copied into `dist/` by Vite | `public/_headers` |
| `/assets/(.*)` immutable `Cache-Control` | same, via `_headers` | `public/_headers` |
| `.wasm` → `application/wasm` | Wrangler infers it from the file extension — **deliberately not ported**, see below | — |
| `rewrites` SPA fallback (with `/assets/`, `/wasm/` exclusions) | `not_found_handling: "single-page-application"` | `wrangler.jsonc` |
| `git.deploymentEnabled.main = false` (CI is the sole deploy path) | **Workers Builds must be disconnected** — see step 2 | Cloudflare dashboard |
| `vercel pull` for build-time env | `VITE_SUPABASE_*` repo secrets | `ci.yml` |
| Auth-walled preview deployments | `X-Robots-Tag: noindex` + Cloudflare Access | `public/_headers`, step 6 |
| Vercel runtime logs | Workers Logs (`observability.enabled`) | `wrangler.jsonc` |
| Vercel Skew Protection | nothing — removed with the account; `lazyRetry` covers it | see "Known differences" |
| `.vercel.app` preview-host gating | `.workers.dev` + Netlify `--` preview hosts | `src/lib/deployHost.ts` |

**`public/_headers` is now the only definition of the app's response headers.** There is no second file to cross-check it against, so `scripts/__tests__/deployHeaders.test.ts` asserts each header directly and records why it exists. A header deleted from `_headers` is gone from production with no other signal — that test is the signal.

### Two things that did not port cleanly

Both were measured against `wrangler dev`, not assumed from the docs.

**1. The SPA fallback has no per-path exclusions.** `vercel.json` excludes `/assets/` and `/wasm/` from its rewrite so a missing hashed chunk returns a real 404. Cloudflare returns **200 + `index.html` for every unmatched path**, regardless of `Sec-Fetch-Mode` — the docs describe navigation-only fallback, but that is not what the asset router actually does.

So a request for a chunk that no longer exists gets HTML where Vercel gave a 404.

*Accepted.* The blast radius is one dead URL: chunk filenames are content-hashed, so a stale name is never requested again once `src/lib/lazyRetry.ts` catches the module-parse failure and does its one-shot reload. (It also means that HTML body is cached `immutable` under the `/assets/*` rule — same reasoning: the URL is dead.) If this ever needs to be exact, use `assets.run_worker_first: ["/assets/*"]` with a small Worker script that 404s the misses — but note that adding a Worker script stops `public/_headers` applying to those paths, so the immutable caching has to move into the script too.

**2. Do NOT port the `/wasm/` Content-Type rule.** It looks like a straight port and it is a footgun:

- Wrangler already derives `application/wasm` from the `.wasm` extension at upload, so the real `/wasm/web-ifc.wasm` is correctly typed with no rule at all.
- A path rule in `_headers` also applies to the SPA fallback. With the rule in place, a request for a `/wasm/` path that does **not** exist returned `200` with `index.html` in the body labelled `application/wasm` — `WebAssembly.instantiateStreaming` then fails on a confusing compile error instead of a clean 404.

The IFC viewer renders zero geometry with no error on a bad WASM response, so the rule would cause exactly the failure it appears to prevent. `public/_headers` and `scripts/__tests__/deployHeaders.test.ts` both guard against it being re-added.

---

## Owner steps

### 1. Repo secrets and variables

Secrets (Settings → Secrets and variables → Actions → **Secrets**):

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Account API token, template **Edit Cloudflare Workers**, scoped to this account |
| `CLOUDFLARE_ACCOUNT_ID` | From the Workers & Pages overview page |
| `VITE_SUPABASE_URL` | `https://kjrwqagyeswwoxpjkcko.supabase.co` — the same value the Vercel project env holds |
| `VITE_SUPABASE_ANON_KEY` | The publishable anon key from the same place |

`VITE_SUPABASE_*` are browser-safe by design (they ship in the bundle — see `src/lib/env.ts`). No service key is ever a `VITE_*` var. They live in secrets only because Cloudflare has no `vercel pull` equivalent.

Variables (same page → **Variables**):

| Name | Value | Effect |
|---|---|---|
| `CLOUDFLARE_ENABLED` | `true` | Turns the deploy job on. Leave unset to keep it inert. |
| ~~`CLOUDFLARE_BASE_URL`~~ | **RETIRED — no longer read by CI** | The health check now takes its URL from `ci.yml` directly. See the note under step 7.4. Safe to delete from the repo settings. |

### 2. Disconnect Workers Builds — CONFIRMED CONNECTED, do this before step 1

Cloudflare's own git integration (Workers & Pages → the Worker → Settings → **Builds**) auto-deploys on every push to the connected branch. It **bypasses the CI gate entirely** — a red lint/typecheck/test push reaches Cloudflare anyway. That is the exact hole `vercel.json`'s `git.deploymentEnabled.main = false` was added to close on the Vercel side.

**This is not hypothetical.** A `Workers Builds: steelbuild-pro-rev-2` check run appears on pull requests in this repo, so the integration is live and building today. Every push to `main` since the Worker was created on 2026-09-06 has deployed to it without passing `ci`.

Disconnect it. `deploy-cloudflare` must be the sole publisher. Until it is disconnected, turning on `CLOUDFLARE_ENABLED` gives you **two** publishers racing the same Worker — one gated, one not, and the ungated one wins whenever it finishes last.

Note there are **two** connected Workers, `steelbuild-pro-rev-2` and `nickl`; both build from this repo. Check both.

Disconnecting costs you the per-PR preview URLs Workers Builds posted — `preview-cloudflare` in `ci.yml` replaces them with `wrangler versions upload`, which produces the same kind of versioned preview URL but only after `ci` is green.

### 2b. Retire Netlify

A **Netlify** site (`steelbuild-pro`) is also connected to this repo and builds on push — it posts `Header rules`, `Redirect rules` and `Pages changed` check runs on pull requests. There is no `netlify.toml` in the repo, so it is configured entirely in the Netlify dashboard and is invisible to anyone reading this codebase.

The plan is to retire it once Cloudflare is serving. Until then:

1. **Establish what it currently serves** before disconnecting anything — if it is answering for `steelbuild-pro.com` today, disconnecting it is the outage, not the cutover.
2. Netlify reads the **same `_headers` format**, so `public/_headers` now applies there too. Harmless (identical rules), and worth knowing when debugging.
3. Netlify needs a `_redirects` file (or dashboard rules) for SPA deep links; this repo has none. If Netlify is serving production and deep links work, the rules are in its dashboard — confirm before assuming the repo tells the whole story.
4. Disconnect it at step 8, after Cloudflare has been serving cleanly.

### 3. Turn it on and verify off-domain

Set `CLOUDFLARE_ENABLED=true`, push to `main`, and confirm `deploy-cloudflare` runs green.

To point the post-deploy health check at the workers.dev URL for this phase, edit `BASE` in the `Post-deploy health check` step of `.github/workflows/ci.yml`. This used to be the repo variable `CLOUDFLARE_BASE_URL`; it is not any more, for the reason in step 7.4.

**Verify on the workers.dev URL before touching DNS** (steps 4–5). With Vercel gone there is no second host to fall back to, so the workers.dev URL is the only place left to find a problem cheaply. Spend the time here.

### 4. Verify the deployment off-domain

Against the workers.dev URL, not the live domain:

```bash
CF=https://<worker>.<subdomain>.workers.dev

# Security headers present (all 6 + CSP-Report-Only)
curl -sSI "$CF/" | grep -iE 'strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|content-security'

# Hashed assets immutable — NOT the max-age=0 default
curl -sSI "$CF/assets/$(curl -s "$CF/" | grep -oE 'assets/index-[^"]+\.js' | head -1 | cut -d/ -f2)" | grep -i cache-control

# WASM MIME — anything but application/wasm means the IFC viewer renders
# nothing. This comes from Wrangler's extension inference, NOT from _headers.
curl -sSI "$CF/wasm/web-ifc.wasm" | grep -i content-type

# A missing wasm path must NOT come back labelled application/wasm. Expect
# text/html (the SPA fallback); application/wasm here means someone re-added
# the /wasm/* rule to public/_headers.
curl -sSI "$CF/wasm/does-not-exist.wasm" | grep -i content-type

# Deep link returns the SPA shell (200 + HTML)
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' -H 'Sec-Fetch-Mode: navigate' "$CF/FieldToday"

# A missing chunk returns 200 + text/html on Cloudflare (it 404s on Vercel).
# Documented and accepted — recorded here so it is not mistaken for a new bug.
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$CF/assets/does-not-exist.js"

# Preview URLs not indexable
curl -sSI "$CF/" | grep -i x-robots-tag
```

Then in a browser, on the workers.dev URL:
1. Sign in — confirms CSP `connect-src` reaches Supabase.
2. Open a drawing set and a PDF sheet — confirms storage signed URLs and the PDF worker.
3. **Open the 3D/IFC viewer and confirm geometry renders** — this is the one that fails silently on a wrong WASM MIME type.
4. Open Stripe billing — confirms `frame-src`/`script-src` for `js.stripe.com`.
5. DevTools → Application → confirm **no service worker registered** (previews are gated off by `src/lib/deployHost.ts`).
6. DevTools → Console → check for CSP violation reports; they also land in Sentry.

### 5. Run the E2E suite against Cloudflare

```bash
E2E_BASE_URL=https://<worker>.<subdomain>.workers.dev npm run test:e2e
```

The fab-release gate spec is a P0 path (CLAUDE.md) — it must be green here before the flip.

### 6. Protect the preview URLs

`*.workers.dev` preview URLs are **public**, unlike Vercel's auth-walled previews. The `noindex` header in `public/_headers` keeps them out of search results but does not stop anyone with the link. Put **Cloudflare Access** in front of the workers.dev hostname before the migration ends, or disable preview URLs.

### 7. Cutover

1. Add the `steelbuild-pro.com` zone to Cloudflare and move the nameservers at the registrar. **Lower the DNS TTL to 300s at least 24h beforehand** so a rollback propagates in minutes.
2. Attach the custom domain to the Worker (Workers & Pages → the Worker → Settings → Domains & Routes → **Add custom domain**). Cloudflare issues the certificate.
3. Watch it. Health check, Sentry error rate, Workers Logs.
4. Point the deploy health check at the real domain: set `BASE` to `https://steelbuild-pro.com` in the `Post-deploy health check` step of `.github/workflows/ci.yml`.

   **This step was missed on the real cutover**, and it is why the health check is no longer a repo variable. `CLOUDFLARE_BASE_URL` stayed on its step-3 workers.dev value, so every production deploy afterwards health-checked a URL no customer uses. workers.dev answers straight from the Worker, so it returns 200 through a missing custom-domain binding, a wrong route, or DNS pointed elsewhere — the live site can be dark while the check is green. A repo variable is invisible in review; nothing in a diff shows what it holds. `BASE` now lives in `ci.yml`, where changing it needs a PR.
5. Update `E2E_BASE_URL` / `playwright.config.ts` if the default base URL needs to change (it does not — the domain is the same).

**Keep Netlify deployable until Cloudflare has served cleanly for at least a week.** It is the only rollback target left — see Rollback below.

### 8. Decommission (only after a quiet week on Cloudflare)

Already done in code (nothing to do): `vercel.json`, `.vercelignore`, `scripts/vercel-skew-protection.mjs` + its test, the `renderBuiltUrl` block in `vite.config.js`, and the `deploy` / `deploy-staging` jobs are all removed.

Remaining:

1. Disconnect the Netlify site (step 2b) and delete it once you are sure nothing points at it.
2. **Uninstall the Vercel GitHub App** (repo/org → Settings → GitHub Apps → Vercel → Configure → remove this repository).

   Deleting `vercel.json` did **not** stop Vercel from touching this repo. The GitHub App is installed independently of repo contents, so it still posts a commit status on every push, and for the closed account those statuses are permanent failures:

   ```
   Vercel – steelbuildpro-og        failure   "Account is blocked."
   Vercel – steelbuild-pro-staging  failure   "Account is blocked."
   ```

   Every pull request from here on will show two red checks that no code change can fix, which is exactly how a team learns to ignore red checks. Uninstall it.

   Note a third project, `Vercel – steel-build-pro-rev-2` (team `steel-build-pro`), is on a *different, working* Vercel account and still deploys successfully. Decide what that one is for before removing it — it is not part of the closed account.
3. Remove the `VERCEL_*` repo secrets — they authenticate to a closed account.
4. Re-provision **staging** if you want it back — it is gone at both layers, not just the hosting one:
   - The Vercel staging project went with the closed account.
   - The staging **Supabase** project is gone too. CI proved it: the staging E2E job failed with `getaddrinfo ENOTFOUND abbeavtbifuddtrifvae.supabase.co`, so `STAGING_BASE_URL` and the staging Supabase secrets both point at things that no longer exist.

   The `staging-e2e-readonly` / `staging-e2e-mutations` jobs survive on `needs: ci` and carry a staging-branch/push condition in their own `if:` — **keep that condition.** They used to inherit it from `deploy-staging`, and repointing them at `ci` without restating it made them run on every pull request against the dead environment.

   Rebuilding means a second Worker (or a Wrangler environment) *and* a fresh staging Supabase project, then updating `STAGING_BASE_URL`, `E2E_EXPECTED_SUPABASE_REF` and the staging E2E secrets. See `staging-setup.md`.
5. **Update the customer-facing hosting disclosures** — see below.

---

## Compliance: the hosting subprocessor changes

Four places tell customers that Vercel hosts this app:

- `src/pages/Subprocessors.jsx` — Vercel is a listed subprocessor
- `src/pages/Privacy.jsx` — hosting/delivery, and the data-residency section
- `src/pages/Security.jsx` — hosting, and the data-residency section
- `ARCHITECTURE.md` — "Hosting / CDN: Vercel (US)"

**These were left unchanged on purpose, and they need a decision — possibly before cutover, not after.** The original plan was to update them on cutover day, on the assumption that Vercel was serving until then. With the Vercel account closed that assumption is gone: whatever is actually answering for `steelbuild-pro.com` today, these pages are describing a host that can no longer deploy. Writing "Cloudflare" into a privacy policy before Cloudflare actually serves would just swap one inaccurate claim for another, so nothing was changed blind.

Settle it as part of step 3:

1. **Confirm what serves production today** (Netlify, per step 2b, or something else). That is the name that is currently correct.
2. **Subprocessor change notice.** If any customer contract or the posted subprocessor policy commits to advance notice of a subprocessor change, that clock starts *before* cutover. Two changes may need disclosing here, not one — Vercel → whatever is serving now, and → Cloudflare.
3. **Data residency.** The all-US vendor chain in `ARCHITECTURE.md` is a stated commitment. Cloudflare's network is global by default — traffic is served from the nearest edge and static assets are cached there. Confirm what "all-US" means once Cloudflare serves, or restate it. Do not let the claim go stale quietly.

Update all four in one commit once production is genuinely on Cloudflare.

---

## Known differences to accept

**1. No Skew Protection.** Vercel could pin asset URLs to a deployment ID so a tab open across a deploy still loaded its lazy chunks. Cloudflare has no equivalent, and the helper that did it has been deleted along with the account.

Impact: a user with a tab open across a deploy who then navigates to a not-yet-loaded lazy route gets one chunk-load failure. `src/lib/lazyRetry.ts` catches exactly that and does a one-shot reload, so they see a reload, not an error. Acceptable — but if the Vercel project had skew protection switched on, this is a real (small) regression, not a no-op.

**2. Rollback is a different verb.** Vercel promoted a previous deployment. Cloudflare uses versions:

```bash
npx wrangler deployments list
npx wrangler rollback [<version-id>]
```

This is now the **primary** rollback for a bad release, not a footnote — see Rollback below. Add it to `docs/runbooks/rollback.md` at cutover.

**3. Build environment.** Cloudflare deploys prebuilt output from the GitHub runner — the build happens in Actions, not on Cloudflare. Anything that relied on `VERCEL_*` build env vars is simply absent; only the skew-protection path read those.

**4. No second host.** Every previous version of this plan assumed a healthy Vercel to fall back to. There isn't one. Treat step 3's off-domain verification as load-bearing rather than a formality.

---

## Rollback

**A bad release (Cloudflare is serving, the new version is broken)** — this is the common case and it is fast:

```bash
npx wrangler deployments list      # find the last good version
npx wrangler rollback <version-id>
```

No DNS involved, no other host involved. This is why the version history matters more than it did on Vercel.

**Before DNS (steps 1–6):** nothing to roll back — production is wherever it is today, untouched. Set `CLOUDFLARE_ENABLED=false` to stop publishing.

**After DNS (step 7), if Cloudflare itself is the problem** rather than a specific version: point `steelbuild-pro.com` back at whatever served before the cutover (per step 2b, most likely the Netlify site).
- If nameservers are still at the old registrar/DNS host: revert the A/CNAME records. Minutes at a 300s TTL.
- If nameservers have moved to Cloudflare: change the record in Cloudflare to point back and set it to **DNS only** (grey cloud). Faster than moving nameservers back.

That target must still be deployable — which is why step 8 keeps Netlify alive for a week after the flip. **Vercel is not a rollback option.** The account is closed.
