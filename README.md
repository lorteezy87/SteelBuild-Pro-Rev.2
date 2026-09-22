# SteelBuild Pro

A **multi-tenant** project-management platform purpose-built for structural
steel fabricators and erectors — tracking drawings, submittals, RFIs,
fabrication, deliveries, change orders, costs, and field operations from
detailing through closeout. Each company works in its own **workspace
(organization)**; the drawings + submittals + RFI workflow is the product's
moat.

> **Reading order for new contributors:**
> 1. This README — get it running locally
> 2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system shape, tenancy, auth/RBAC, workflow concepts
> 3. [`TECH_DEBT.md`](./TECH_DEBT.md) — known issues + remediation paths
> 4. [`CLAUDE.md`](./CLAUDE.md) — agent-driven development conventions (deploy flow, branch model)

## Stack

- **Frontend**: Vite + React 18, shadcn/radix UI primitives, TanStack Query,
  React Router, Recharts. Styling is **token-first**: CSS custom properties
  (`src/styles/tokens.css`, the "SteelBuild Dark" system) plus a small
  design-system module carry every surface, text and border colour. Tailwind is
  installed and compiled (`tailwind.config.js`, `@tailwind` directives in
  `src/globals.css`) and is used for layout/utility classes — but colours come
  from tokens only, never a hardcoded hex. See the design-system rules in
  [`CLAUDE.md`](./CLAUDE.md).
- **Viewers**: a **self-hosted IFC viewer** (`web-ifc` wasm + `three.js`,
  lazy-loaded) for the Detailing Control Center's 3D tab; `pdf.js` for drawings.
- **Data**: Supabase (Postgres + RLS + Storage + Auth + Edge Functions).
- **Hosting**: Cloudflare Workers (`steelbuild-pro-rev-2`), serving
  `steelbuild-pro.com`. Production deploys are **CI-gated** on four jobs —
  `ci` (lint + TS/JS typechecks + strictNullChecks + noImplicitAny + Vitest +
  production build), `secret-scan`, `supabase-drift` and `edge-typecheck` — and
  only a green run of all four publishes the Worker. Vercel is retired.
- **LLM**: a provider-agnostic gateway via the `llm-proxy` Edge Function
  (currently OpenAI `gpt-4o` / `gpt-4o-mini`). Never call a provider from the browser.
- **Billing**: Stripe subscription plans via the `stripe-billing` Edge Function.
- **Monitoring**: Sentry (`@sentry/react`) with masked session replay.

## Multi-tenancy

A company signs up and creates a **workspace** (`organizations` table). The
workspace is the billing + invite + grouping unit; every project belongs to an
org (`projects.org_id`). **Tenant isolation is enforced at the database layer** —
the org boundary is wired into `user_has_project_access` (and therefore every
project-scoped RLS policy), into `create_project`, into storage upload paths,
and into the vendor / user-profile reads — so one tenant can never read
another's data. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md#multi-tenancy--billing).

## Workflow (the moat)

The detailing/submittal flow has 8 **derived** workflow stages (7 stored sheet
stages). **Submittals are the source of truth** for workflow status; drawings
are document artifacts. See `docs/architecture/drawing-workflow-dual-source.md`.

```
Not Started → IFA → OFA → BFA → R&R → OFS → IFC → Released for Fab
```

New users are walked through this flow by a data-driven **Getting Started**
checklist on the project Dashboard that tracks the project's real progress
(upload drawings → create a submittal → raise RFIs → release for fab) and
deep-links to each step. It's separate from the data-setup onboarding
(`OrgOnboarding` first-run org wizard; `Onboarding` project create/import/seed).

See [`ARCHITECTURE.md`](./ARCHITECTURE.md#domain-workflow) for the full glossary
and the status×ball-in-court → stage mapping.

## Local development

Requires Node 20+.

```bash
npm ci
npm run dev
```

`npm ci` is the reproducible install path for the committed lockfile. Use
`npm install` only when intentionally changing dependency metadata.

Create `.env.local` with the two required variables:

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Do **not** put provider API keys in `VITE_*` browser variables — all LLM and
billing secrets live server-side in the Edge Functions' environment.

## Scripts

| Command                | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                      |
| `npm run build`        | Production build to `dist/`                    |
| `npm run preview`      | Serve the built bundle locally                 |
| `npm run lint`         | ESLint (quiet — warnings suppressed)           |
| `npm run lint:fix`     | ESLint with autofix                            |
| `npm run typecheck`    | `tsc --noEmit` against `tsconfig.json` (TS)    |
| `npm run typecheck:js` | `tsc --noEmit` against `jsconfig.json` (JS/JSX)|
| `npm run typecheck:strict` | strictNullChecks ratchet — all `.ts/.tsx` except the grandfathered list |
| `npm run typecheck:noimplicitany` | noImplicitAny ratchet — all `.ts/.tsx` except the grandfathered list |
| `npm test`             | Vitest run (unit + jsdom integration tests)    |
| `npm run test:watch`   | Vitest in watch mode                           |
| `npm run supabase:drift` | Compare remote Supabase schema vs migrations (skips without token / `ALLOW_SKIP=1`) |
| `npm run supabase:delete-deprecated-fns` | Dry-run delete of retired Edge Functions (`DRY_RUN=0` to apply) |

## Layout

```
src/
  boot/          app bootstrap (AppProviders, AuthenticatedApp, AppRoutes, gates)
  pages/         route-level screens (~75)
  components/    feature-scoped UI (drawings/, financials/, viewer3d/, settings/, …)
  hooks/         TanStack Query hooks + CRUD wrappers
  api/           Supabase client (entities/auth/integrations/functions) + storage helpers
  lib/           shared utilities, AuthContext, billing/, org/, ifc/, payapp/, backcharge/, field/
  services/      deterministic domain engines (costRollup, marginRiskEngine, …)
  utils/         shared deterministic helpers, including the typed PCC scoring engine
supabase/
  migrations/    ordered SQL migrations (timestamped `YYYYMMDDhhmmss_name.sql`)
  functions/     Edge Functions (llm-proxy, email-ingest, email-send,
                 project-export, stripe-billing, …)
public/          static assets, web-ifc wasm, pdf workers
```

## Database migrations

Migrations live in `supabase/migrations/` (timestamped
`YYYYMMDDhhmmss_name.sql` — the history was **re-baselined** on 2026-06-20 and
~190 legacy migrations are archived in `supabase/migrations_archive/`, so
inspect the directory rather than assuming a number; 123 files as of
2026-09-22). After a migration that changes the exposed schema, the SQL ends
with `NOTIFY pgrst, 'reload schema'`.

**Do not apply migrations with `supabase db push` or the Supabase MCP
`apply_migration`.** This Supabase project is shared with a sibling app, so the
remote ledger carries versions this repo does not own (42 of 130 as of
2026-09-22, catalogued in `supabase/production-ownership-manifest.json`) and the
CLI refuses; `apply_migration` stamps its own apply-time version, which is how
the ledger drifted in the first place. Migrations here are applied and stamped
by hand, and the committed filename **must** be the stamped ledger version.
`Supabase drift check` compares the two on every branch, so a stamp whose file
is unmerged turns `main` and every open PR red. Read the full procedure in
[`CLAUDE.md`](./CLAUDE.md) before applying anything.

## Auth, roles & tenancy

Three role layers:

- **Global**: `user_profiles.role` (`'admin' | 'user'`) — gates app-level admin
  routes (e.g. `/FeatureFlagsAdmin`).
- **Org**: `organization_members.role` (`'owner' | 'admin' | 'member'`) —
  governs billing, invites, and workspace membership. Helpers `user_is_org_member`,
  `user_org_role_at_least`.
- **Per-project**: `user_projects.role` (`'owner' | 'admin' | 'pm' | 'field' |
  'viewer'`) — governs project data + actions. `'owner'` ≡ `'admin'` (level 3).
  Helpers `user_has_project_access` (now **org-aware**), `get_my_project_role`,
  `user_has_project_role_at_least`.

Front-end: `useAuth()` (user + global role), `useOrg()` (current workspace +
role), `useProjectRole(projectId)`, `usePermissions().can()`. Member management:
**OrgMembers** (`/OrgMembers` — workspace team + tokenized invites) and
**ProjectMembers** (per-project access).

**Account security.** Self-serve **password reset** ("Forgot password?" →
emailed link → `/update-password`, gated at top precedence for the recovery
session) and **change password** (Settings → Profile → Security). Optional
**TOTP MFA** — enroll in Settings → Security; an aal1 session with a verified
factor is gated to a step-up challenge before entering the app. All via the
Supabase Auth API in `AuthContext`.

## Personal settings

**Settings** is the signed-in user's personalization center. Preferences sync
through the user's Supabase profile metadata and apply across the app: system,
light, or dark theme; accent, font scale, contrast, motion, table density;
date/time, number, currency, and measurement formats; sidebar mode, recents,
keyboard hints, project-number visibility, and in-app alert/quiet-hour rules.

The **My Workspace** tab adds Project Manager, Field, Fabrication, and Executive
presets with a review-before-apply summary, plus server-backed favorite modules
and projects. **Reset & Portability** can export a versioned, allowlisted JSON
preference file, validate an import before applying it, or restore individual
sections or all defaults with a typed confirmation. These settings are
presentation-only and never grant
roles, permissions, project access, or other authorization.

## Billing & plans

Free / Pro / Business tiers (`src/lib/billing/plans.ts`). `organizations.plan`
is the entitlement anchor — **only the Stripe webhook (service role) can change
it** (a DB trigger blocks the client). Plan limits (projects, members) are
enforced server-side in `create_project` and `accept_invitation`. Billing page
at `/Billing` (`stripe-billing` Edge Function → Stripe Checkout / Portal).

## Data export

**Settings → System → Export Data** produces a per-tenant JSON backup of every
project the caller can access — fetched through the RLS-scoped, audit-logged
`project-export` Edge Function and bundled client-side (`src/lib/workspaceExport.ts`).

**Right-to-erasure (GDPR/CCPA).** An owner-only "Danger Zone → Delete workspace"
action (Team page) permanently erases an organization — DB rows via the
`hard_delete_organization` RPC (with an append-only `account_deletions` audit that
survives the wipe), Storage objects, and orphaned auth users via the
`account-delete` Edge Function. Gated behind the **`account_deletion`** feature
flag (off by default) and a type-the-name confirmation.

## Testing

The Phase 0 closure baseline is 251 Vitest files and 2,968 tests: pure-helper
suites (default `node` env) plus jsdom integration tests
(`// @vitest-environment jsdom`) that drive real components/import flows with the
Supabase client mocked. Playwright smoke and fab-release gate specs are available
under `e2e/`, but remain opt-in and nonblocking until dedicated test fixtures are
configured. Counts change as tested helper modules are added; run `npm test --
--run` for the current total (710 files / 6,835 tests as of 2026-09-22).

## CI/CD

`.github/workflows/ci.yml` runs on configured push branches and pull requests
targeting the supported bases. The `ci` job is lint, four typecheck gates (TS,
JS/JSX, the **strictNullChecks** ratchet, and the **noImplicitAny** ratchet),
Vitest, and a production build — all blocking. Three more jobs run alongside it
and **also gate the deploy**: `secret-scan` (gitleaks), `supabase-drift` (the
production ledger against `supabase/migrations/`), and `edge-typecheck` (a Deno
check over the released Edge Functions). Both `deploy-cloudflare` and
`preview-cloudflare` declare `needs: [ci, secret-scan, supabase-drift,
edge-typecheck]`, so a red drift check or a failing Edge Function blocks the web
deploy. A post-deploy health check follows. An advisory `dependency-audit` job
(`npm audit`, non-blocking) and an opt-in post-deploy Playwright smoke round it
out. A concurrency group cancels redundant runs without interrupting a
production deploy.

Three more workflows live beside it: `storage-backup.yml` (nightly Storage
backup), `supabase-deploy-reviewed.yml` (manual, reviewed Edge Function deploy
for `llm-proxy`, `project-export` and `stripe-billing`), and
`supabase-retire-deprecated.yml`.

## Deployment

Feature work lands on a feature branch and is reviewed through a pull request. A
push to **`main`** runs `ci`, `secret-scan`, `supabase-drift` and
`edge-typecheck`; **only if all four pass** does the deploy job publish the
static-asset Cloudflare Worker configured in `wrangler.jsonc`. A red run cannot
deploy — production stays on the last good build. The GitHub Action is the sole
production path; Cloudflare's own Workers Builds git integration must stay
disconnected, because it would deploy on push with no gate. Rollback is
`wrangler rollback <version-id>`, not a redeploy. Remaining gap: no
branch-protection required check (repo plan), so red/unreviewed commits can
still land on `main` even though they cannot deploy.
[`CLAUDE.md`](./CLAUDE.md) documents the full workflow + git-safety rules.

**Edge Functions** deploy separately from the web app. The reviewed path is the
manual `supabase-deploy-reviewed.yml` workflow (`llm-proxy`, `project-export`,
`stripe-billing`); others go via `supabase functions deploy`. Nine functions are
live in production as of 2026-09-22: `llm-proxy`, `email-ingest`, `email-send`,
`stripe-billing`, `project-export`, `health`, `command-center-read`,
`command-center-session-handoff`, `account-delete`. The repo also carries
`staging-e2e-bootstrap` (staging only) and `legacy-app-files-copy` (retired from
production 2026-09-21). Every previously deprecated function — `sharepoint-proxy`,
`bluebeam-proxy`, `stripe-setup`, `stripe-webhook`, `stripe-worker`, `sheets-api`
— has been deleted.

**Staging.** Rebuilt 2026-09-21 on a persistent Supabase branch
(`ndyfjffsulfbwpmwdmic`) behind the `steelbuild-pro-staging` Worker, deployed by
the `deploy-staging-cloudflare` job from the `staging` branch. It holds no
production data, Auth users, secrets or stored objects. Read-only and
disposable-mutation E2E jobs run against it. Details, including what the
schema restore did and did not cover, are in
[`docs/runbooks/staging-setup.md`](./docs/runbooks/staging-setup.md).

**Ops.** A public, DB-aware healthcheck (`GET /functions/v1/health` → 200
`{status:ok,db:ok}` / 503 when Postgres is unreachable) is the uptime-monitor
target. Enterprise-readiness remediation status + owner action list live in
[`ENTERPRISE_READINESS_AUDIT.md`](./ENTERPRISE_READINESS_AUDIT.md),
[`docs/runbooks/owner-checklist.md`](./docs/runbooks/owner-checklist.md), and the
Tier 1 split matrix
[`docs/runbooks/tier1-enterprise-status.md`](./docs/runbooks/tier1-enterprise-status.md)
(code-complete vs owner-only: PITR, Stripe Tax dashboard, branch protection, …).
The broader 2026-09-21 production-readiness audit — security, tenancy, data
correctness, performance, release process and store readiness, with a §9
reconciliation against current `main` — is
[`docs/audits/PRODUCTION_READINESS_AUDIT_2026-09-21.md`](./docs/audits/PRODUCTION_READINESS_AUDIT_2026-09-21.md).

## Mobile (iOS / Android)

**The product ships as a web app today.** Neither store build exists yet.

- **iOS** — Capacitor 8 is wired up in `capacitor.config.ts` (appId
  `com.steelbuildpro.app`, `webDir: dist`) with the `app`, `status-bar`,
  `splash-screen`, `keyboard`, `haptics`, `camera`, `share` and `preferences`
  plugins installed, plus `cap:add:ios` / `cap:sync` / `cap:open` scripts. **No
  `ios/` project is committed** — it is generated on a Mac by `npm run
  cap:add:ios`, and everything after that (signing, capabilities, archive,
  App Store Connect) requires Xcode and cannot run in CI/Linux. The runbook is
  [`docs/app-store/SUBMISSION.md`](./docs/app-store/SUBMISSION.md); known gaps
  are MOB-1 … MOB-10 in the production-readiness audit.
- **Android / Google Play** — **no platform exists**: `@capacitor/android` is
  not a dependency and there is no `android/` directory. Play submission is a
  from-scratch task, not a configuration change.

## Error monitoring

Sentry is initialised in `src/instrument.js` (imported first in `main.jsx`):
error capture + performance tracing + **masked** session replay (`maskAllText` +
`blockAllMedia`, so replays never expose readable project/financial content).
DSN from `VITE_SENTRY_DSN` with a baked-in fallback. `src/lib/telemetry.js` stays
a local-only ring buffer (`window.__sbpErrorLog`); `llm_telemetry` is the
separate LLM-spend table.

## Feature flags

`feature_flags` in Supabase is the only runtime authority. Every production flag
must exist in the typed catalog at `src/config/featureFlags.ts` and the catalog
seed migration. Admin UI is at `/FeatureFlagsAdmin`; global enablement and
administrator-managed per-user overrides are environment state, not committed
personal data. The retired `command_ui` presentation flag is no longer consumed
by runtime code. The eight remaining operational flags are read server-side via:

```js
import { useFlag, useAllFlags } from "@/hooks/useFeatureFlag";
const show3dViewer = useFlag("viewer_3d");
```

Per-user overrides use `feature_flags.user_overrides` as a jsonb map and must not
contain personal email addresses in source-controlled seeds.

**Module scope-cut gates** (nav + route): deprioritized modules (Cost, advanced
Reports/Portfolio, Procurement, Risk, Quality suite extras, Resources, Closeout,
Email Inbox, Integrations, …) are hidden and deep-link-blocked unless their
`module_*` flag is on. Core steel workflow (Dashboard, Detailing Control Center,
RFIs, Work Packages / Piece Register / Fab, Schedule, Field, Projects, Settings)
stays always on. Config: `src/config/moduleGating.js` + `useModuleAccess`.

## Notes on viewers

- **3D**: a self-hosted IFC viewer (`web-ifc` + `three`) lazy-loaded into the
  Detailing Control Center's "3D Model" tab behind the `viewer_3d` flag. The
  `web-ifc.wasm` is version-pinned and copied to `public/wasm/` by a Vite plugin
  on every build — a worker/package mismatch silently yields zero geometry. (The
  old `@thatopen/components` IFC/BIM stack was removed to shrink the bundle.)
  **Fab color mode** paints linked lots from `pieces.lifecycle_status` (Production /
  Logistics / fab-release invalidate `canonical-pieces-3d`). Measure snap targets
  **1/16″**. Zoom/orbit do not "run out of gas" (unbounded camera).
- **PDF**: `src/pages/DrawingViewer.jsx` defaults to a browser-native `<iframe>`;
  a pdf.js canvas mode is available via the toolbar toggle. Multi-sheet PDFs rely
  on correct `drawings.pdf_page`.

## Product surfaces (recent)

- **Drawing Register** — flat Doc Control sheet table with **set name filter** /
  grouping (Detailing Control Center).
- **Document Control** (`/DocumentControl`) — read-only intake desk: drop a
  drawing PDF and get its title block, its place in the project's whole live
  register, what changed against the sheet of record, seal / signature and
  approval findings, and a database-ready JSON payload. Writes nothing;
  extraction runs in the browser. The engine is `src/lib/docControl/`, which the
  revision-upload wizard also renders — the difference is register scope ("is
  this sheet in THIS set" vs "anywhere on this job").
- **Detailing event glue** — Create submittal from package (`?targetSetId=`),
  revision **Attach / Not now** confirm, status → BIC/dates **suggest strip**
  (`src/lib/submittalLinkGlue.ts`).
- **Piece Register** — Overview / Register / **Board** (WP drag-assign columns) /
  Imports / Lots & links / Production / Logistics / Settings. Lifecycle writes
  refresh 3D Fab colors.
- **Theme** — SteelBuild Dark uses **opaque** panel tokens (`--sbd-bg-panel*`)
  and `.sbp-opaque-popout` for menus (no frosted glass wash-out on selects).
- **Signup** — Terms/Privacy clickwrap required before account creation.

## Where to find things

- **Architecture + decisions** → [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Known issues + remediation** → [`TECH_DEBT.md`](./TECH_DEBT.md)
- **Production-readiness audit (2026-09-21)** → [`docs/audits/PRODUCTION_READINESS_AUDIT_2026-09-21.md`](./docs/audits/PRODUCTION_READINESS_AUDIT_2026-09-21.md)
- **App Store submission runbook** → [`docs/app-store/SUBMISSION.md`](./docs/app-store/SUBMISSION.md)
- **Enterprise Tier 1 status** → [`docs/runbooks/tier1-enterprise-status.md`](./docs/runbooks/tier1-enterprise-status.md)
- **Agent / deploy conventions** → [`CLAUDE.md`](./CLAUDE.md) · concurrent claims → [`AGENT_CLAIMS.md`](./AGENT_CLAIMS.md)
- **Drawing/submittal stage glossary** → [`ARCHITECTURE.md#domain-workflow`](./ARCHITECTURE.md#domain-workflow)
- **Agent session memory** → [`.claude/agent-memory/construction-pm-dev/MEMORY.md`](./.claude/agent-memory/construction-pm-dev/MEMORY.md)
