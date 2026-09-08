# Vercel → Cloudflare Workers — Migration Runbook

**SteelBuild Pro — hosting migration**
Purpose: move the web frontend from Vercel to Cloudflare Workers static assets **without a downtime window and without a flag day**, by running both hosts off the same commit until the DNS flip.

> The **code half is shipped**. `.github/workflows/ci.yml` has a guarded `deploy-cloudflare` job that publishes the same commit as the Vercel `deploy` job. It is **inert** until you complete the owner steps below and set `CLOUDFLARE_ENABLED=true`.

Refs:
- Cloudflare Worker: `steelbuild-pro-rev-2` · Vercel project: `steelbuildpro-og` · Repo: `lorteezy87/SteelBuild-Pro-Rev.2`
- Production domain: `steelbuild-pro.com` · Supabase (unchanged): `kjrwqagyeswwoxpjkcko`

---

## Architecture during the migration

```
                                   ┌── deploy ───────────▶ Vercel  ──▶ steelbuild-pro.com   (LIVE)
 main ──CI gate (lint/type/test/build)──┤
                                   └── deploy-cloudflare ─▶ Workers ──▶ *.workers.dev       (shadow)
```

- **One gate, two publishes.** Both deploy jobs `needs: ci`, so neither can ship a red build.
- **Independent.** `deploy-cloudflare` is not in `deploy.needs`. A Cloudflare failure can never stop or roll back the deploy that still serves customers.
- **Nothing else moves.** Supabase (DB, auth, storage, edge functions), Stripe, and Sentry are untouched. This migration is the static frontend only.

---

## What had to be ported (already done in code)

| Vercel mechanism | Cloudflare equivalent | Where |
|---|---|---|
| `vercel.json` `headers` — 6 security headers + CSP-Report-Only | `_headers` file, copied into `dist/` by Vite | `public/_headers` |
| `/assets/(.*)` immutable `Cache-Control` | same, via `_headers` | `public/_headers` |
| `.wasm` → `application/wasm` | Wrangler infers it from the file extension — **deliberately not ported**, see below | — |
| `rewrites` SPA fallback (with `/assets/`, `/wasm/` exclusions) | `not_found_handling: "single-page-application"` | `wrangler.jsonc` |
| `git.deploymentEnabled.main = false` (CI is the sole deploy path) | **Workers Builds must be disconnected** — see step 2 | Cloudflare dashboard |
| `vercel pull` for build-time env | `VITE_SUPABASE_*` repo secrets | `ci.yml` |
| Auth-walled preview deployments | `X-Robots-Tag: noindex` + Cloudflare Access | `public/_headers`, step 6 |
| Vercel runtime logs | Workers Logs (`observability.enabled`) | `wrangler.jsonc` |

**Drift guard:** `scripts/__tests__/deployHeaders.test.ts` fails CI if `public/_headers` and `vercel.json` stop agreeing. Delete it at step 8, when `vercel.json` goes.

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
| `CLOUDFLARE_BASE_URL` | workers.dev URL now, `https://steelbuild-pro.com` after step 7 | Turns the post-deploy health check on |

### 2. Disconnect Workers Builds — CONFIRMED CONNECTED, do this before step 1

Cloudflare's own git integration (Workers & Pages → the Worker → Settings → **Builds**) auto-deploys on every push to the connected branch. It **bypasses the CI gate entirely** — a red lint/typecheck/test push reaches Cloudflare anyway. That is the exact hole `vercel.json`'s `git.deploymentEnabled.main = false` was added to close on the Vercel side.

**This is not hypothetical.** A `Workers Builds: steelbuild-pro-rev-2` check run appears on pull requests in this repo, so the integration is live and building today. Every push to `main` since the Worker was created on 2026-09-06 has deployed to it without passing `ci`.

Disconnect it. `deploy-cloudflare` must be the sole path, exactly as `deploy` is for Vercel. Until it is disconnected, turning on `CLOUDFLARE_ENABLED` gives you **two** publishers racing to the same Worker — one gated, one not.

### 2b. Decide what happens to Netlify

A **Netlify** site (`steelbuild-pro`) is also connected to this repo and builds on push — it posts `Header rules`, `Redirect rules` and `Pages changed` check runs on pull requests. There is no `netlify.toml` in the repo, so it is configured entirely in the Netlify dashboard and is invisible to anyone reading this codebase.

That makes **three** git-connected hosting integrations plus the CI-gated Actions deploy. Before migrating, establish:

1. Does the Netlify site serve any production traffic, or only previews?
2. If it is dormant, disconnect it — it builds every push and its config lives nowhere in version control.
3. Note that Netlify uses the **same `_headers` format** as Cloudflare, so `public/_headers` is now being consumed by Netlify builds too. That is harmless (identical headers) but it means the file is load-bearing for two hosts, not one.

### 3. Turn it on and let it shadow

Set `CLOUDFLARE_ENABLED=true`, push to `main`, confirm the job runs green, and set `CLOUDFLARE_BASE_URL` to the workers.dev URL.

Then **leave it running for at least a week of normal deploys.** Cost of waiting: nothing. Cost of not waiting: you find the header/MIME/routing problems on the production domain.

### 4. Verify the shadow deployment

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
4. Set `CLOUDFLARE_BASE_URL=https://steelbuild-pro.com` so the deploy health check covers the real domain.
5. Update `E2E_BASE_URL` / `playwright.config.ts` if the default base URL needs to change (it does not — the domain is the same).

**Do not delete the Vercel project.** Keep it deployable for at least two weeks after the flip.

### 8. Decommission (only after a quiet two weeks)

1. Delete `vercel.json`, `.vercelignore`, `scripts/vercel-skew-protection.mjs` + its test, and the `renderBuiltUrl` block in `vite.config.js`.
2. Delete the `deploy` and `deploy-staging` Vercel jobs from `ci.yml` (port `deploy-staging` to Cloudflare first if staging is in use).
3. Delete `scripts/__tests__/deployHeaders.test.ts` — with `vercel.json` gone there is nothing to mirror.
4. Simplify `src/lib/deployHost.ts` to the `workers.dev` rule and drop the Vercel branch + its tests.
5. Remove the `VERCEL_*` repo secrets.
6. **Update the customer-facing hosting disclosures** — see below.

---

## Compliance: the hosting subprocessor changes

Four places name Vercel as the hosting provider to customers. They are accurate today and become false at step 7, so they change **on cutover day**, not before:

- `src/pages/Subprocessors.jsx` — Vercel is a listed subprocessor
- `src/pages/Privacy.jsx` — hosting/delivery, and the data-residency section
- `src/pages/Security.jsx` — hosting, and the data-residency section
- `ARCHITECTURE.md` — "Hosting / CDN: Vercel (US)"

Two things to check before the flip, both outside this repo:

1. **Subprocessor change notice.** If any customer contract or the posted subprocessor policy commits to advance notice of a subprocessor change, that clock starts before cutover, not after.
2. **Data residency.** The all-US vendor chain in `ARCHITECTURE.md` is a stated commitment. Cloudflare's network is global by default — traffic is served from the nearest edge, and static assets are cached there. Confirm what "all-US" now means, or restate it. Do not quietly let the claim go stale.

---

## Known differences to accept

**1. No Skew Protection.** Vercel can pin asset URLs to a deployment ID so an old open tab still loads its lazy chunks after a new deploy (`scripts/vercel-skew-protection.mjs`, active only when `VERCEL_SKEW_PROTECTION_ENABLED=1` on the project). Cloudflare has no equivalent.

Impact: a user with a tab open across a deploy who then navigates to a not-yet-loaded lazy route gets one chunk-load failure. `src/lib/lazyRetry.ts` already catches exactly that and does a one-shot reload, so the user sees a reload, not an error. Acceptable — but if the project has skew protection enabled today, this is a real (small) regression, not a no-op.

**2. Rollback is a different verb.** Vercel promotes a previous deployment. Cloudflare uses versions:

```bash
npx wrangler deployments list
npx wrangler rollback [<version-id>]
```

Add this to `docs/runbooks/rollback.md` at cutover.

**3. Build environment.** Cloudflare deploys prebuilt output from the GitHub runner — the build happens in Actions, not on Cloudflare. Anything that relied on Vercel build env vars (`VERCEL_*`) is simply absent. Only the skew-protection path read those.

---

## Rollback

**Before DNS (steps 1–6):** nothing to roll back. Vercel is still serving. Set `CLOUDFLARE_ENABLED=false`.

**After DNS (step 7):** point `steelbuild-pro.com` back at Vercel.
- If nameservers are still at the old registrar/DNS host: revert the A/CNAME records. Minutes at a 300s TTL.
- If nameservers have moved to Cloudflare: change the record in Cloudflare to point back at Vercel and set it to **DNS only** (grey cloud). Faster than moving nameservers back.

Either way the Vercel project must still be deployable — which is why step 8 waits two weeks.
