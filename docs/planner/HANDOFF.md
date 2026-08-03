# SteelBuild Planner PWA — Restore and Continuation Handoff

**Checkpoint date:** 2026-08-03
**Repository:** `https://github.com/lorteezy87/SteelBuild-Pro-Rev.2.git`
**Branch:** `codex/steelbuild-planner-pwa`
**Production deployment source:** `83274bf3de5e24f2a7ff70c94086bfa221902aec`
**Production URL:** `https://steelbuild-planner.vercel.app`

## Purpose

This branch contains the standalone SteelBuild Planner PWA built inside the
SteelBuild Pro repository. It is a separate Vite/PWA entry point and is
intended to use SteelBuild Pro's existing Supabase authentication, MFA,
organization membership, project access, data, and RLS authority.

The branch is a safe GitHub checkpoint. The Planner is deployed from the
separate `steelbuild-planner` Vercel project, which has no Git connection, and
uses the existing production SteelBuild Pro Supabase project. The two Planner
migrations are applied in staging and production with their committed ledger
versions.

## Restore on a new computer

```powershell
git clone https://github.com/lorteezy87/SteelBuild-Pro-Rev.2.git
cd SteelBuild-Pro-Rev.2
git switch codex/steelbuild-planner-pwa
npm ci
```

Create `.env.local` locally. Do not commit it. Required browser-safe values:

```dotenv
VITE_SUPABASE_URL=https://<steelbuild-supabase-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<steelbuild-browser-anon-or-publishable-key>
VITE_STEELBUILD_APP_URL=https://<main-steelbuild-app-host>
VITE_PLANNER_PWA_HOSTNAMES=127.0.0.1,<approved-planner-host>
```

Never place a Supabase service-role key in this PWA, Vercel browser
environment, documentation, fixtures, or committed files.

Start the Planner locally:

```powershell
npm run dev:planner -- --host 127.0.0.1 --port 5174
```

Then open `http://127.0.0.1:5174/` and sign in with an existing SteelBuild Pro
account. A local URL is only available while the development server is
running; it is not a deployment.

## What is complete

Core implementation Tasks 1–9 are complete and independently reviewed:

- Separate Planner Vite entry point, manifest, icons, build output, and PWA
  identity.
- Existing SteelBuild Supabase auth, MFA, onboarding, organization, project,
  sign-out, and recovery composition.
- Canonical action control contract based on `action_items`, with server-side
  audit behavior and project-scoped RLS.
- Deterministic 48-hour gate, 10-day lookahead, My Day, Calendar, Waiting On,
  Milestones, Archive, Command Center, and Task Register behavior.
- Project-scoped action and schedule repositories with optimistic concurrency.
- Dense desktop command shell and action register matching the accepted visual
  direction.
- New task, edit, explicit date-change confirmation, conflict resolution,
  bulk completion, archive-only removal, filters, and CSV export.
- Tenant-partitioned sanitized IndexedDB snapshots and a narrow offline outbox.
- Durable, user-bound replay receipts with authorization checks, strict
  operation binding, advisory-lock serialization, and exact client/server
  payload contracts.
- StrictMode-safe tenant cleanup, scope-generation replay guards, truthful
  connectivity states, and safe service-worker caching boundaries.

Canonical design and execution documents are preserved under `docs/planner/`:

- `steelbuild-planner-pwa-design.md`
- `steelbuild-planner-core-implementation-plan.md`
- `steelbuild-planner-readiness-implementation-plan.md`
- `implementation-evidence/progress.md`
- `implementation-evidence/task-1-report.md` through `task-9-report.md`

## Validation at the backup checkpoint

The following commands passed immediately before commit `efb47459`:

```text
npm run test:planner -- --maxWorkers=1 --no-file-parallelism
  21 test files passed; 116 tests passed
npm run typecheck:planner
npm run lint
npm run build:planner
git diff --check
```

The Planner build retains two non-blocking Vite warnings:

- Supabase is both statically and dynamically imported, so the dynamic import
  does not create a separate chunk.
- The main Planner JavaScript chunk is greater than 500 kB minified.

Do not describe the entire repository test gate as green. A bounded baseline
`npm test` run exposed two pre-existing failures in
`src/pages/resourceScheduling/__tests__/resourceSchedulingHelpers.test.ts`
and was stopped after it ceased producing output. Planner-focused validation
is green; the broad repository gate still requires a fresh bounded run.

## Database migrations — applied in staging and production

Apply these in timestamp order only through the approved Supabase migration
workflow and only after confirming the target SteelBuild environment:

1. `supabase/migrations/20260802090000_planner_action_control.sql`
2. `supabase/migrations/20260802090500_planner_offline_idempotency.sql`

Current state:

- Both migrations are committed and recorded remotely with their exact source
  versions in staging `abbeavtbifuddtrifvae` and production
  `kjrwqagyeswwoxpjkcko`.
- Production verification confirmed both tables, RLS, the authenticated-only
  replay RPC, restricted direct grants, the event select policy, and all four
  required triggers.
- The receipt table intentionally has no direct authenticated policy; replay
  access is only through the role-checked RPC.
- The migration contract tests passed before application. Re-run them before
  any future modification:

```powershell
npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js supabase/migrations/__tests__/plannerOfflineIdempotency.test.js
```

## Task 10 — complete and deployed

Task 10 is complete, pushed, independently reviewed, and deployed from source
commit `83274bf3de5e24f2a7ff70c94086bfa221902aec`.

Completed Task 10 artifacts and behavior:

- `vercel.planner.json` defines the separate Planner build and globally
  disables automatic Git deployments. Because it is a named CLI config rather
  than root `vercel.json`, the Planner Vercel project must remain disconnected
  from Git and be deployed explicitly with `--local-config`.
- `playwright.planner.config.ts` builds and serves `dist-planner` on port 4174.
- `e2e/planner-core.spec.ts` uses deterministic local Supabase request mocks;
  it contains no real credentials and no staging-account dependency.
- The built-preview suite passes the unauthenticated and authenticated
  boundaries, create/edit/date confirmation, filters, bulk completion,
  48-hour gate, archive, service-worker/cache evidence, responsive navigation,
  sign-out, local cleanup, and console/request error checks.
- `.env.example` contains the browser-safe Planner variables.
- `docs/runbooks/planner-pwa.md` documents local use, Supabase redirects,
  CLI-only Vercel setup, migration order, PWA checks, cache versions, rollback,
  and the service-role prohibition.
- The mobile shell has an accessible drawer, Escape/link close behavior, and
  a sign-out action supplied by a Planner-local authenticated session context.
- Service-worker hashed-asset caching now awaits `cache.put` before completing
  the fetch response.
- `vite.config.js` excludes `planner/**` from the root Vitest tree; Planner
  tests remain under `npm run test:planner`.
- `implementation-evidence/task-10-report.md` contains the full validation and
  visual-fidelity evidence, and `progress.md` records Task 10 completion.

Validation at the local Task 10 checkpoint:

```text
npm run test:planner                         PASS — 21 files, 116 tests
npm run typecheck:planner                    PASS
npm run lint                                 PASS
npm run typecheck                            PASS
npm run typecheck:js                         PASS
npm run typecheck:strict                     PASS — 0 enforced errors
npm run typecheck:noimplicitany              PASS — 0 enforced errors
npx playwright test --config playwright.planner.config.ts
                                             PASS — 3/3 tests
npm run build                                PASS
npm run build:planner                        PASS
git diff --check                             PASS
```

The full root `npm test` gate is not green. It reproduces two unrelated
Resource Scheduling offset failures and then stalls after a bounded wait.
Cold installed-browser offline relaunch is also not claimed; active worker,
shell/bootstrap cache contents, and cached-data labeling are verified.

Independent Task 10 review: PASS; code quality PASS; no Critical or Important
issue remains.

Run the deterministic browser suite with:

```powershell
npx playwright test --config playwright.planner.config.ts
```

The Playwright configuration's placeholder anon value is used only with local
request mocks. It is not a Supabase credential.

## Production deployment

Current production state as of 2026-08-03:

- Public URL: `https://steelbuild-planner.vercel.app`
- Vercel project: `steelbuild-planner`
- Production deployment: `dpl_8fMjDzfceWH9MZDwHm8m7QwDN87Y` (READY)
- Source commit: `83274bf3de5e24f2a7ff70c94086bfa221902aec`
- Supabase project: `kjrwqagyeswwoxpjkcko` (SteelBuild Pro production)
- Applied migration versions: `20260802090000` and `20260802090500`

Live verification passed for the public root, Task Register and Meetings deep
links, manifest, service worker, production Supabase target, SPA routing,
security/cache headers, active service-worker registration, and the
unauthenticated sign-in modal. The smoke test produced no browser console or
page errors. Authenticated production data mutations were intentionally not
performed.

The exact Planner production/recovery redirect entries in Supabase Auth could
not be inspected with the available deployment tooling. Email/password sign-in
renders and is connected to production, but password recovery and any OAuth
provider callback should be verified in the Supabase Auth redirect allow-list
before inviting users who depend on those flows.

## Deployment boundary

The Planner is intended for a separate Vercel project using
`vercel.planner.json`:

- Build command: `npm run build:planner`
- Output directory: `dist-planner`
- Service worker and manifest use no-cache headers.
- Hashed assets use immutable caching.
- SPA rewrites exclude assets, service worker, manifest, and icons.
- Git auto-deployment is globally disabled in the named config.
- `vercel.planner.json` is CLI-only. Root `vercel.json` remains authoritative
  for the main SteelBuild app and must not be used for the Planner project.

For a future deployment, an owner must:

1. Apply and verify the two migrations in the intended Supabase environment.
2. Create/link the separate Vercel project without a Git connection, or
   disconnect/disable its Git integration, and set only browser-safe values.
3. Add the Planner callback/recovery URLs to Supabase Auth redirect URLs.
4. Set `VITE_STEELBUILD_APP_URL` to the main SteelBuild Pro host.
5. Set `VITE_PLANNER_PWA_HOSTNAMES` to the exact approved Planner hostnames.
6. Deploy from a clean worktree with the Planner configuration and complete
   the runbook's staging, rollback, and real-device offline checks. Vercel's
   remote builder gave the committed root `vercel.json` precedence over the
   named `--local-config` during this deployment; the clean deployment
   worktree therefore used a temporary root `vercel.json` byte-equivalent to
   committed `vercel.planner.json`. Do not commit that temporary override to
   the main branch.

## Readiness expansion — not started

The separate readiness plan is preserved in
`docs/planner/steelbuild-planner-readiness-implementation-plan.md`. Its next
task is `implementation-evidence/readiness-task-1-brief.md`:

1. Add `schedule_task_readiness` schema, project/schedule identity enforcement,
   timestamps, RLS, field-role writes, and audit events without blocker free
   text in metadata.
2. Add deterministic readiness source projections and policies using only
   evidence-backed existing tables/columns.
3. Add the readiness repository, conflict-safe checklist, and narrow offline
   extension.
4. Build the six operational readiness pages/detail drawer/checklist.
5. Finish management pages, reports, settings, and readiness E2E.

Do not invent source-table mappings. Inspect the restored repository and use
only confirmed SteelBuild schemas and business rules.

## Continuation rules

- Work from `codex/steelbuild-planner-pwa` or a new branch created from it.
- Preserve SteelBuild's existing Supabase/RLS authority; never use a service
  role in the browser.
- Keep date changes explicitly confirmed and removal archive-only.
- Keep offline writes narrow and idempotent; do not queue broad creates,
  dates, ownership, archive, or source-link changes.
- Do not apply migrations or deploy merely to test locally.
- Distinguish locally validated, remotely migrated, and deployed states in
  every handoff.
