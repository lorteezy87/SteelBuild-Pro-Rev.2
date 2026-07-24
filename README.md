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
  React Router, Recharts, react-leaflet. Styling via CSS custom-property tokens
  (`src/styles/tokens.css`, the "SteelBuild Dark" system) + a small
  design-system module — **NOT Tailwind**.
- **Viewers**: a **self-hosted IFC viewer** (`web-ifc` wasm + `three.js`,
  lazy-loaded) for the Detailing Control Center's 3D tab; `pdf.js` for drawings.
- **Data**: Supabase (Postgres + RLS + Storage + Auth + Edge Functions).
- **Hosting**: Vercel. Production deploys are **CI-gated** — a push to `main`
  runs `.github/workflows/ci.yml` (lint + TS/JS typechecks + strictNullChecks +
  noImplicitAny + Vitest + production build) and only a green run triggers the
  gated `deploy` job. Vercel's own git auto-deploy is **OFF**
  (`vercel.json` → `git.deploymentEnabled.main: false`), so a red push cannot
  reach <https://steelbuild-pro.com> (Vercel project `steelbuildpro-og`).
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

The detailing/submittal flow has 7 stages. **Submittals are the source of truth**
for workflow status; drawings are document artifacts.

```
Not Started → IFA → OFA → BFA → OFS → IFC → Released for Fab
                              ↑
                              └─ R&R loops back to IFA
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
supabase/
  migrations/    ordered SQL migrations (timestamped `YYYYMMDDhhmmss_name.sql`)
  functions/     Edge Functions (llm-proxy, email-ingest, email-send,
                 project-export, stripe-billing, …)
public/          static assets, web-ifc wasm, pdf workers
```

## Database migrations

Migrations live in `supabase/migrations/` (mixed legacy `NNN_name.sql` and
timestamped `YYYYMMDDhhmmss_name.sql` — the history was **re-baselined** (29
active files; ~190 legacy migrations archived), so inspect the directory for the
latest rather than assuming a number). Apply live changes via
the Supabase MCP (`apply_migration`) and commit the same SQL so repo history
matches the database. After a migration that changes the exposed schema, the SQL
ends with `NOTIFY pgrst, 'reload schema'`.

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
--run` for the current total.

## CI/CD

`.github/workflows/ci.yml` runs on configured push branches and pull requests
targeting the supported bases: lint, four typecheck gates
(TS, JS/JSX, the **strictNullChecks** ratchet, and the **noImplicitAny**
ratchet), Vitest, and a production build — all blocking. Only a green `ci` job
lets the gated `deploy` job publish to Vercel, followed by a post-deploy health
check. An advisory `dependency-audit` job (`npm audit`, non-blocking) and an
opt-in post-deploy Playwright smoke round it out. A concurrency group cancels
redundant runs (but never a `main`/`staging` run mid-deploy).

## Deployment

Feature work lands on a feature branch and is reviewed through a pull request. A
push to **`main`** runs the `ci` job; **only if it passes**
does the `deploy` job ship the prebuilt output to Vercel
(`vercel pull/build/deploy --prebuilt --prod`). A red run cannot deploy —
production stays on the last good build. Vercel's git auto-deploy is disabled
(`vercel.json`), so the GitHub Action is the sole production path. Remaining gap:
no branch-protection required check (repo plan), so red/unreviewed commits can
still land on `main` even though they cannot deploy. [`CLAUDE.md`](./CLAUDE.md)
documents the full workflow + git-safety rules. Edge Functions deploy separately
(Supabase MCP `deploy_edge_function` or `supabase functions deploy`).

**Staging.** A pre-production environment (separate Vercel project + separate
Supabase project) deploys from the **`staging`** branch via the guarded
`deploy-staging` job, reusing the same `ci` gate as prod. Rehearse migrations,
edge-function changes, and destructive features (e.g. erasure) here before prod.
Setup + promotion flow: [`docs/runbooks/staging-setup.md`](./docs/runbooks/staging-setup.md).

**Ops.** A public, DB-aware healthcheck (`GET /functions/v1/health` → 200
`{status:ok,db:ok}` / 503 when Postgres is unreachable) is the uptime-monitor
target. Enterprise-readiness remediation status + owner action list live in
[`ENTERPRISE_READINESS_AUDIT.md`](./ENTERPRISE_READINESS_AUDIT.md) and
[`docs/runbooks/owner-checklist.md`](./docs/runbooks/owner-checklist.md).

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

## Notes on viewers

- **3D**: a self-hosted IFC viewer (`web-ifc` + `three`) lazy-loaded into the
  Detailing Control Center's "3D Model" tab behind the `viewer_3d` flag. The
  `web-ifc.wasm` is version-pinned and copied to `public/wasm/` by a Vite plugin
  on every build — a worker/package mismatch silently yields zero geometry. (The
  old `@thatopen/components` IFC/BIM stack was removed to shrink the bundle.)
- **PDF**: `src/pages/DrawingViewer.jsx` defaults to a browser-native `<iframe>`;
  a pdf.js canvas mode is available via the toolbar toggle. Multi-sheet PDFs rely
  on correct `drawings.pdf_page`.

## Where to find things

- **Architecture + decisions** → [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Known issues + remediation** → [`TECH_DEBT.md`](./TECH_DEBT.md)
- **Agent / deploy conventions** → [`CLAUDE.md`](./CLAUDE.md)
- **Drawing/submittal stage glossary** → [`ARCHITECTURE.md#domain-workflow`](./ARCHITECTURE.md#domain-workflow)
