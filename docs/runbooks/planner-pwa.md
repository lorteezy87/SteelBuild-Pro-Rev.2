# SteelBuild Planner PWA deployment and rollback

This runbook covers the independent SteelBuild Planner build. It shares the
SteelBuild Pro Supabase authentication, organization/project access, and RLS
authority, but it must use a separate Vercel project and `dist-planner`
artifact. A local or preview build is not a production deployment.

## Security boundary

Only values designed for the browser may be supplied to Vite:

```dotenv
VITE_SUPABASE_URL=https://<steelbuild-supabase-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<browser-anon-or-publishable-key>
VITE_STEELBUILD_APP_URL=https://<main-steelbuild-host>
VITE_PLANNER_PWA_HOSTNAMES=127.0.0.1,<staging-host>,<production-host>
```

`VITE_PLANNER_PWA_HOSTNAMES` contains exact hostnames only: no schemes, paths,
wildcards, or unapproved Vercel previews. The service worker does not register
unless the production build hostname is on that list.

Never put `SUPABASE_SERVICE_ROLE_KEY`, a service-role/admin key, provider API
key, OAuth client secret, database password, or Vercel token in a `VITE_*`
variable, browser code, committed file, manifest, or Playwright fixture. The
Planner uses the anon/publishable key plus the signed-in user's JWT so RLS is
always authoritative.

## Local build and deterministic verification

Create an uncommitted `.env.local`, then run:

```powershell
npm ci
npm run dev:planner -- --host 127.0.0.1 --port 5174
npm run test:planner
npm run typecheck:planner
npm run build:planner
npx playwright test --config playwright.planner.config.ts
```

The Playwright suite builds and serves `dist-planner` at
`http://127.0.0.1:4174`. It intercepts the local Supabase boundary with
deterministic fixtures and contains no live account or credential. Do not
replace the fixture value with a real service credential. A dedicated staging
account may be used only through the existing separately approved staging E2E
workflow.

## Unapplied migrations and owner gate

At this checkpoint the Planner migrations are files in Git and are not known
to be applied to any remote environment. An environment owner must confirm the
target project and current migration ledger before changing it.

Apply through the approved Supabase migration workflow, never by pasting DDL
into a browser client, and preserve this order:

1. `20260802090000_planner_action_control.sql`
2. `20260802090500_planner_offline_idempotency.sql`

Before application:

```powershell
npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js supabase/migrations/__tests__/plannerOfflineIdempotency.test.js
```

Owner checklist:

1. Confirm the intended staging/production Supabase project reference and a
   restorable backup.
2. Inspect the remote migration ledger. If both versions are current, do not
   reapply them; record the verified versions.
3. If either version is absent, stop Planner promotion, apply missing versions
   in timestamp order using the approved migration mechanism, and verify the
   RLS policies, trigger functions, receipt table, and replay RPC.
4. Confirm an authenticated field-role user can perform authorized Planner
   writes and a viewer/unauthorized user cannot.
5. Keep queued offline operations visibly pending until the second migration's
   idempotent replay RPC is verified. Never mark replay successful merely
   because the client is online.

## Supabase Auth redirect URLs - owner action

In Supabase Dashboard -> Authentication -> URL Configuration, add the exact
Planner origins and recovery destinations for the separate staging and
production projects, including:

```text
https://<planner-staging-host>/**
https://<planner-production-host>/**
https://<planner-staging-host>/update-password
https://<planner-production-host>/update-password
```

Use the provider's supported redirect pattern syntax and the exact deployed
origins. Do not add a broad wildcard for arbitrary Vercel preview hosts. Verify
email/password sign-in, password recovery, and MFA on staging before production
promotion. Redirect configuration is an owner-controlled remote setting and is
not changed by this repository.

## Separate Vercel project

`vercel.planner.json` is a named **CLI-only** configuration. Vercel's Git
integration reads the root `vercel.json`, which belongs to the main SteelBuild
Pro application; it does not discover `vercel.planner.json`. The root config
must never govern a Planner build or deployment.

1. Create and link a dedicated Planner Vercel project without a Git repository
   connection. If the project was created by importing the repository,
   disconnect the Git repository or explicitly disable Git deployments in the
   project settings before continuing. Do not replace or relink the existing
   SteelBuild Pro project.
2. Keep the repository root as the project root because Planner imports narrow
   shared modules from `src/`.
3. Use `vercel.planner.json` only through the CLI's explicit `--local-config`
   option. It specifies
   `npm run build:planner`, `dist-planner`, no-cache service-worker/manifest
   headers, immutable hashed assets, main-app-aligned security headers, and SPA
   rewrites that exclude assets, service worker, manifest, and icons.
4. Set only the four browser-safe variables above for the correct Preview and
   Production scopes. Keep staging and production Supabase targets explicit.
5. From the repository root, verify `.vercel/project.json` identifies the
   dedicated Planner project, then deploy only with the named config:

   ```powershell
   npx vercel deploy --local-config vercel.planner.json
   npx vercel deploy --prod --local-config vercel.planner.json
   ```

   The first command creates a preview candidate; run the staging checks before
   the explicitly authorized production command. Never run a bare `vercel` or
   `vercel --prod` command for Planner because it can read the main app's root
   `vercel.json`. The boolean `git.deploymentEnabled: false` is a defense in the
   named config, not a substitute for disconnecting/disabling the project's Git
   integration.
6. Add the approved Planner hostname/alias. Configure
   `planner.steelbuild-pro.com` DNS only through the owner-approved Vercel/DNS
   process.

## Staging PWA acceptance

Verify the built staging deployment at the accepted desktop viewport first,
then tablet and mobile:

- Browser manifest reports `SteelBuild Planner`, `/` scope/start URL, and
  `display: standalone`; both icons return the correct content type.
- `/sw.js` returns `Cache-Control: no-cache, no-store, must-revalidate` and
  `Service-Worker-Allowed: /`; the current page has an active `/` registration.
- Hashed `/assets/*` return immutable one-year caching. Manifest and service
  worker are not rewritten to `index.html`.
- A signed-in authorized fixture loads Task Register, creates an action,
  confirms a date change, filters, bulk-completes eligible rows, loads the
  48-Hour Gate, archives without delete, and signs out.
- Offline mode shows the cached-data timestamp, shell/index and visited hashed
  assets exist in Cache Storage, and no Supabase/auth/API response is present
  in the service-worker cache.
- Sign-out removes the Supabase session, Planner local-storage keys, Query
  cache, IndexedDB snapshots, and pending Planner state before another user can
  render.
- Desktop shell/table density matches the accepted reference; tablet retains
  the rail; mobile uses the Menu drawer, horizontal register scrolling, sticky
  headers/context, minimum touch targets, visible focus, Escape close, and
  keyboard traversal.
- No uncaught page error, console error, failed same-origin static asset, or CSP
  violation remains. CSP is report-only, so review browser and Sentry reports.

Run the same checks against the production candidate before alias promotion,
then repeat manifest, service-worker, sign-in, read-only register, logout, and
console checks after promotion. Do not perform disposable mutations against
production merely to complete a smoke test.

## Service-worker cache versions

`planner/public/sw.js` owns `CACHE_NAME`. Change its `sbp-planner-shell-vN`
suffix whenever shell files, caching rules, or incompatible static assets
change. Never reuse a cache version for different contents. Activation deletes
all older Planner cache names and claims clients; verify the new worker is
active before asking users to refresh. Keep HTML, manifest, and service worker
non-immutable so a rollback can replace them, while hashed assets remain safe
to cache indefinitely.

## Rollback

1. Stop promotion and record the failing Git SHA, Vercel deployment ID, active
   service-worker cache version, Supabase project reference, and migration
   ledger.
2. In the dedicated Planner Vercel project, promote the last known-good
   deployment from that project's deployment history. Promotion of an existing
   artifact does not rebuild from Git. If the known-good SHA must be rebuilt,
   check it out in a clean recovery worktree, verify the linked Planner project,
   and deploy it only with
   `npx vercel deploy --prod --local-config vercel.planner.json`. Never use the
   root `vercel.json`, a bare Vercel deploy command, or the main SteelBuild Pro
   project for Planner rollback.
3. Ensure the restored deployment serves its matching `sw.js`. If asset/shell
   compatibility changed, publish a new cache version rather than reusing an
   old name; verify activation and removal of the failed cache.
4. Re-run the staging/production read-only PWA checks and confirm signed-out
   tenant data cannot reappear.
5. Database migrations are additive and shared with SteelBuild Pro. Do not
   delete tables, functions, receipts, or audit history during a frontend
   rollback. If a database rollback is genuinely required, stop traffic and
   use a separately reviewed forward migration/restoration plan from the owner
   backup. Never improvise destructive SQL from the frontend or Vercel build.

Deployment, redirect changes, DNS changes, and remote migration application
remain explicit owner actions. This runbook does not authorize them.
