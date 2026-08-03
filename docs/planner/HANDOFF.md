# SteelBuild Planner PWA — Restore and Continuation Handoff

**Checkpoint date:** 2026-08-02  
**Repository:** `https://github.com/lorteezy87/SteelBuild-Pro-Rev.2.git`  
**Branch:** `codex/steelbuild-planner-pwa`  
**Backup commit:** `efb4745956338211c6e15ce700dc525af6f4887c`

## Purpose

This branch contains the standalone SteelBuild Planner PWA built inside the
SteelBuild Pro repository. It is a separate Vite/PWA entry point and is
intended to use SteelBuild Pro's existing Supabase authentication, MFA,
organization membership, project access, data, and RLS authority.

The branch is a safe GitHub checkpoint. It has not been merged, deployed, or
connected to a production Vercel project. Its Supabase migrations have not
been applied remotely.

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
  21 test files passed; 114 tests passed
npm run typecheck:planner
npm run lint
npm run build:planner
git diff --cached --check
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

## Database migrations — local files only

Apply these in timestamp order only through the approved Supabase migration
workflow and only after confirming the target SteelBuild environment:

1. `supabase/migrations/20260802090000_planner_action_control.sql`
2. `supabase/migrations/20260802090500_planner_offline_idempotency.sql`

Current state:

- Both migrations are committed to the branch.
- Neither migration was applied by this work session.
- Offline replay depends on the second migration's RPC and receipt table.
- Until migrations are applied, failed replay operations remain queued rather
  than being reported as successful.
- Re-run the migration contract tests before applying:

```powershell
npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js supabase/migrations/__tests__/plannerOfflineIdempotency.test.js
```

## Task 10 checkpoint — partially complete

Task 10 was interrupted so this GitHub backup could be created. Preserve its
current work and continue from this exact boundary.

Completed Task 10 artifacts:

- `vercel.planner.json` exists and its deployment-contract E2E test passed.
- `playwright.planner.config.ts` builds and serves `dist-planner` on port 4174.
- `e2e/planner-core.spec.ts` uses deterministic local Supabase request mocks;
  it contains no real credentials and no staging-account dependency.
- The unauthenticated sign-in boundary E2E passed.
- The authenticated workflow reached the real required-date confirmation UI.
  A test-only locator mismatch was corrected to the production
  `alertdialog`/`Confirm required-date change` contract.

Task 10 work still required:

1. Finish the authenticated browser flow and resolve only evidence-backed
   failures for Task Register, new task, date confirmation, filters, bulk
   completion, 48-hour gate, archive, and logout cleanup.
2. Complete PWA/offline, cached-shell, responsive navigation, keyboard, and
   console-error browser verification.
3. Add Planner variables and safe descriptions to `.env.example`.
4. Create `docs/runbooks/planner-pwa.md` with local, Vercel, redirect URL,
   migration, cache-version, verification, and rollback procedures.
5. Run the full Task 10 validation matrix in
   `docs/planner/implementation-evidence/task-10-brief.md`, recording exact
   broad-repository failures rather than changing unrelated code.
6. Compare the built desktop UI with the accepted reference, then verify
   tablet and mobile behavior. The original local reference path was:
   `C:\Users\Nicholas\AppData\Local\Temp\codex-clipboard-79db13b1-b736-4f39-86a6-9f24054a48c0.png`.
   That temporary image is not part of Git; reattach it after restore if it is
   unavailable.
7. Write `implementation-evidence/task-10-report.md` and update `progress.md`
   only after the Task 10 review is clean.

Run the deterministic browser suite with:

```powershell
npx playwright test --config playwright.planner.config.ts
```

The Playwright configuration's placeholder anon value is used only with local
request mocks. It is not a Supabase credential.

## Deployment boundary

The Planner is intended for a separate Vercel project using
`vercel.planner.json`:

- Build command: `npm run build:planner`
- Output directory: `dist-planner`
- Service worker and manifest use no-cache headers.
- Hashed assets use immutable caching.
- SPA rewrites exclude assets, service worker, manifest, and icons.
- Git auto-deployment is disabled in the current config.

Before deployment, an owner must:

1. Apply and verify the two migrations in the intended Supabase environment.
2. Create the separate Vercel project and set only browser-safe environment
   values.
3. Add the Planner callback/recovery URLs to Supabase Auth redirect URLs.
4. Set `VITE_STEELBUILD_APP_URL` to the main SteelBuild Pro host.
5. Set `VITE_PLANNER_PWA_HOSTNAMES` to the exact approved Planner hostnames.
6. Complete Task 10 browser/PWA and rollback verification.

No Vercel deployment, GitHub pull request, production migration, or remote
data mutation was performed at this checkpoint.

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
