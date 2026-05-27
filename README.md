# SteelBuild Pro

A real-time project management platform purpose-built for structural steel
contractors — tracking drawings, submittals, RFIs, fabrication, deliveries,
change orders, costs, and field operations from detailing through closeout.

> **Reading order for new contributors:**
> 1. This README — get it running locally
> 2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the system shape, auth, RBAC, workflow concepts
> 3. [`TECH_DEBT.md`](./TECH_DEBT.md) — known issues + remediation paths
> 4. [`CLAUDE.md`](./CLAUDE.md) — agent-driven development conventions (deploy flow, branch model)

## Stack

- **Frontend**: Vite + React 18, shadcn/radix UI primitives, TanStack Query,
  React Router, Recharts, react-leaflet. Style via CSS custom-property tokens
  (`src/styles/tokens.css`) + a small design-system module — NOT Tailwind.
- **3D / 2D viewers**: `@thatopen/components` v3.4.x (IFC/fragments) and pdf.js
- **Data**: Supabase (Postgres + RLS + Storage + Auth + Edge Functions)
- **Hosting**: Vercel (auto-deploys from `codex/base44-deploy-nick`)
- **LLM**: Anthropic Claude via the `llm-proxy` Supabase Edge Function

## Workflow

The detailing/submittal flow has 7 stages. Submittals are the source of truth
for workflow status; drawings are document artifacts.

```
Not Started → IFA → OFA → BFA → OFS → IFC → Released for Fab
                              ↑
                              └─ R&R loops back to IFA
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md#domain-workflow) for the full
glossary and the status×ball-in-court → stage mapping.

## Local development

Requires Node 20+.

```bash
npm install
npm run dev
```

Create `.env.local` with the two required variables:

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Optional — falls back to direct Anthropic calls if the `llm-proxy` edge
function is unavailable:

```env
Do not put provider API keys in VITE_* browser environment variables.
```

## Scripts

| Command              | What it does                                 |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the Vite dev server                    |
| `npm run build`      | Production build to `dist/`                  |
| `npm run preview`    | Serve the built bundle locally               |
| `npm run lint`       | ESLint (quiet — warnings suppressed)         |
| `npm run lint:fix`   | ESLint with autofix                          |
| `npm run typecheck`  | `tsc --noEmit` against `tsconfig.json` (TS)  |
| `npm run typecheck:js` | `tsc --noEmit` against `jsconfig.json` (JS/JSX) |
| `npm test`           | Vitest run (unit tests)                      |
| `npm run test:watch` | Vitest in watch mode                         |

## Layout

```
src/
  pages/         route-level screens
  components/    feature-scoped UI (drawings/, financials/, dms/, …)
  hooks/         TanStack Query hooks + CRUD wrappers
  api/           Supabase client + storage helpers
  lib/           shared utilities, auth context, query client
supabase/
  migrations/    ordered SQL migrations (timestamped `YYYYMMDDhhmmss_name.sql`)
  functions/     Edge Functions (llm-proxy, schedule-assistant, email-ingest, sharepoint-proxy)
public/          static assets, wasm, pdf/fragments workers
```

## Database migrations

Migrations live in `supabase/migrations/` and are applied via the Supabase
dashboard SQL editor or the Supabase MCP/CLI. After applying a migration
that adds columns, the code calls `NOTIFY pgrst, 'reload schema'` so
PostgREST picks up the change without a restart.

Migration filenames switched from `NNN_name.sql` to timestamped
`YYYYMMDDhhmmss_name.sql`; inspect the directory for the current latest
rather than assuming a number (105 migrations as of this writing, latest
`20260517004000_wp_production_backbone.sql`). See
[`ARCHITECTURE.md`](./ARCHITECTURE.md#auth--authorization) for the RBAC
model.

## Auth & roles

Two role layers (post-Phase-B):

- **Global**: `user_profiles.role` (`'admin' | 'user'`) gates `<AdminRoute>`-wrapped pages
- **Per-project**: `user_projects.role` (`'owner' | 'admin' | 'pm' | 'field' | 'viewer'`)
  gates lock/unlock, signoff voids, deletes, and lock-bypass writes — enforced
  at the DB layer via RLS + a BEFORE-UPDATE trigger

`'owner'` is treated as a synonym for `'admin'` (level 3) in all helpers.

Front-end:
- `useAuth()` for the current user + global role
- `useProjectRole(projectId)` for per-project role
- `useAppSecurity().isAdmin` is the composed gate (global admin OR per-project admin)

Today the only way to edit `user_projects.role` is direct SQL — a
member-management admin UI is queued (RBAC Phase C).

## Testing

- Unit / pure-helper tests via Vitest — 488+ tests as of this writing
- `npm test` runs once; `npm run test:watch` for development
- No component-rendering or E2E tests yet (TECH_DEBT.md tracks this)

## CI/CD

- `.github/workflows/ci.yml` runs on every push / PR: lint, typecheck (TS +
  JS/JSX), Vitest, production build — all blocking
- Concurrency group cancels redundant runs on rapid iteration

## Deployment

- Feature work lands on a `claude/*` branch.
- Deploys go out via merge into `codex/base44-deploy-nick`, which Vercel
  auto-builds and publishes. [`CLAUDE.md`](./CLAUDE.md) documents the full
  auto-deploy workflow.

## Error monitoring

Sentry (`@sentry/react`) is initialised in `src/instrument.js` (imported first
in `main.jsx`): error capture + performance tracing + **masked** session replay
(`maskAllText` + `blockAllMedia`, so replays never expose readable
project/financial content). DSN comes from `VITE_SENTRY_DSN` with a baked-in
public project DSN fallback, so it works out of the box; both ErrorBoundaries
report React render errors via `Sentry.captureException`. `src/lib/telemetry.js`
stays a local-only ring buffer (`window.__sbpErrorLog`).

## Feature flags

Lightweight homegrown system (`feature_flags` Supabase table). Admin UI at
`/FeatureFlagsAdmin`. Read flags via:

```js
import { useFlag, useAllFlags } from "@/hooks/useFeatureFlag";

const isNewDashboard = useFlag("new_dashboard");
```

Per-email overrides supported via `feature_flags.user_overrides` jsonb map.
See [`ARCHITECTURE.md`](./ARCHITECTURE.md#feature-flags) for usage.

## Notes on third-party viewers

- `src/components/portfolio/PortfolioBimViewer.jsx` is the remaining
  `@thatopen/components` (IFC/BIM) consumer — the standalone `ModelViewer`
  page was removed. `@thatopen/fragments` needs a worker served from
  `public/thatopen/fragments-worker.mjs`; if you upgrade the package,
  **re-copy** `node_modules/@thatopen/fragments/dist/Worker/worker.mjs`
  to that public path, or a runtime/package mismatch silently yields
  zero geometry on IFC load.
- `src/pages/DrawingViewer.jsx` defaults to a browser-native `<iframe>`
  for reliability; pdf.js canvas mode is available via the toolbar
  toggle for cases that need it.

## Where to find things

- **Architecture + decisions** → [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Known issues + remediation** → [`TECH_DEBT.md`](./TECH_DEBT.md)
- **Agent / deploy conventions** → [`CLAUDE.md`](./CLAUDE.md)
- **Error monitoring (Sentry)** → `src/instrument.js` + [`CLAUDE.md`](./CLAUDE.md) §11
- **Drawing/submittal stage glossary** → [`ARCHITECTURE.md#domain-workflow`](./ARCHITECTURE.md#domain-workflow)
