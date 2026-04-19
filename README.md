# SteelBuild Pro

A real-time project management platform purpose-built for structural steel
contractors — tracking drawings, submittals, RFIs, fabrication, deliveries,
change orders, costs, and field operations from detailing through closeout.

## Stack

- **Frontend**: Vite + React 18, Tailwind CSS, shadcn/radix UI primitives,
  TanStack Query, React Router, Recharts, react-leaflet
- **3D / 2D viewers**: `@thatopen/components` v3 (IFC/fragments) and pdf.js
- **Data**: Supabase (Postgres + RLS + Storage + Auth + Edge Functions)
- **Hosting**: Vercel (auto-deploys from `codex/base44-deploy-nick`)
- **LLM**: Anthropic Claude via the `llm-proxy` Supabase Edge Function

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
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

## Scripts

| Command              | What it does                                 |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the Vite dev server                    |
| `npm run build`      | Production build to `dist/`                  |
| `npm run preview`    | Serve the built bundle locally               |
| `npm run lint`       | ESLint (quiet — warnings suppressed)         |
| `npm run lint:fix`   | ESLint with autofix                          |
| `npm run typecheck`  | `tsc --noEmit` against `jsconfig.json`       |
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
  migrations/    ordered SQL migrations (`NNN_name.sql`)
  functions/     Supabase Edge Function source (currently: llm-proxy)
public/          static assets, wasm, pdf/fragments workers
```

## Database migrations

Migrations live in `supabase/migrations/` and are applied via the Supabase
dashboard SQL editor or the Supabase MCP/CLI. After applying a migration
that adds columns, the code calls `NOTIFY pgrst, 'reload schema'` so
PostgREST picks up the change without a restart.

## Deployment

- Feature work lands on a `claude/*` branch.
- Deploys go out via merge into `codex/base44-deploy-nick`, which Vercel
  auto-builds and publishes. `CLAUDE.md` documents the full auto-deploy
  workflow.

## Notes on third-party viewers

- `src/pages/ModelViewer.jsx` uses `@thatopen/components` v3.4.0.
  `FragmentsManager.init()` requires a worker URL — we serve it from
  `public/thatopen/fragments-worker.mjs`. If you upgrade
  `@thatopen/fragments`, re-copy
  `node_modules/@thatopen/fragments/dist/Worker/worker.mjs` there.
- `src/pages/DrawingViewer.jsx` defaults to a browser-native `<iframe>`
  for reliability; pdf.js canvas mode is available via the toolbar
  toggle for cases that need it.
