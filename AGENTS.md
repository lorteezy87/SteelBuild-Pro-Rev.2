# Repository Guidelines

SteelBuild Pro is a Vite + React 18 + Supabase project-management app for structural steel fabricators and erectors. This file is the quick contributor guide; deeper context lives in `ARCHITECTURE.md`, `TECH_DEBT.md`, and the agent/deploy contract in `CLAUDE.md`.

## Project Structure & Module Organization
- `src/pages/` — route-level screens. The page registry source of truth is `src/config/routes.js` (`src/routes.js` is a back-compat re-export shim).
- `src/components/` — feature-scoped UI grouped by domain (`drawings/`, `submittals/`, `financials/`, `gantt/`, `schedule/`, …), plus `ui/` (radix/shadcn primitives), `design-system/`, and `shared/`.
- `src/services/` — deterministic domain engines: `marginRiskEngine`, `autoLinkEngine`, `constraintEngine`, `scheduleCascade`, `workflowEngine`, `permissions`, `validation`, `auditLogger`, `cacheRegistry`.
- `src/hooks/` — TanStack Query CRUD hooks; `src/api/` — Supabase client + storage; `src/lib/` — shared utilities and domain mapping (`submittalStageMapping.js`, `drawingSetOrdering.js`).
- `supabase/migrations/` — ordered SQL (mixed `NNN_name.sql` and `YYYYMMDD…` timestamps, ~170; inspect the dir, don't assume the latest). `supabase/functions/` — edge functions (`llm-proxy`, `schedule-assistant`, `email-ingest`, `email-send`, `project-export`, `stripe-billing`, …; `sharepoint-proxy`/`bluebeam-proxy` are deprecated).
- Import via the `@/*` alias (→ `src/`). **Multi-tenant:** each company is an `organizations` workspace and projects belong to an org. RBAC **and** the org boundary are enforced at the DB layer via RLS, not UI gates (`user_has_project_access` is org-aware; `useOrg()` exposes the active workspace).

## Build, Test, and Development Commands
- `npm run dev` — Vite dev server. `npm run build` — production build to `dist/`. `npm run preview` — serve the build.
- `npm run lint` (`eslint . --quiet`) / `npm run lint:fix`.
- `npm run typecheck` (TS via `tsconfig.json`) and `npm run typecheck:js` (JS/JSX via `jsconfig.json`) — both run in CI.
- `npm test` (`vitest run`); `npm run test:watch`. Single file: `npx vitest run src/services/__tests__/marginRiskEngine.test.js`.

## Coding Style & Naming Conventions
- ESLint flat config (`eslint.config.js`): `unused-imports` errors, unused vars warn (ignore `^_`); `src/lib`, `src/api`, and `src/components/ui` are lint-exempt. TypeScript is non-strict (`strict: false`, `allowJs`).
- Style with SteelBuild Dark CSS tokens (`src/styles/tokens.css`) and `.sbd-*` classes — Tailwind is compat-only, not the primary system.
- Name domain objects by business meaning (drawing set vs sheet vs submittal vs RFI); avoid `data`/`item`/`handler`.

## Testing Guidelines
Vitest defaults to the `node` environment for fast pure-helper tests; component tests opt into jsdom with a `// @vitest-environment jsdom` pragma. Mock the Supabase client — no test should hit the network. Prefer targeted tests for status mapping, permissions, and schedule/cost calculations.

## Refactoring large files
When thinning a big component, extract its pure logic **byte-identical** into a sibling `*Helpers`/`*Derive` module (or `format.ts`) with unit tests — the `useMemo` wrappers stay, deps unchanged. Self-contained interaction subsystems become custom hooks; pure data-display JSX becomes small presentational components. One concern per slice; run the full suite + build after each; commit per slice. Examples: `components/schedule/scheduleGanttHelpers.js` + `use{ColumnResize,GanttLayout,TaskBarDrag}`, `components/dashboard/portfolioDerive.js`, `lib/drawingUploadUtils.js`. See `CLAUDE.md` §2.5 and `ARCHITECTURE.md` decision log.

## Commit & Pull Request Guidelines
Use Conventional Commit prefixes seen in history: `feat:`, `fix:`, `docs:`, `refactor:`, `ui:`, `security:`. CI (`.github/workflows/ci.yml`) runs lint + both typechecks + Vitest + production build on every push/PR. Feature work lands on `claude/*` branches; deploys go through merge into `main`, which Vercel auto-publishes.
