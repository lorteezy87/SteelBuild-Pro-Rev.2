# SteelBuild Pro — App Recreation Prompt

Use the prompt below as a single self-contained brief to recreate this application from scratch. It captures the product purpose, tech stack, data model, navigation, and feature surface of SteelBuild Pro Rev.2.

---

## PROMPT

Build **SteelBuild Pro**, an enterprise-grade web application for steel construction and fabrication management. It is a single-page React app that gives general contractors, steel fabricators, structural engineers, and project managers a unified workspace covering the entire project lifecycle: pre-construction planning, BIM coordination, RFI workflow, drawing/document control, fabrication and procurement, scheduling, field operations, cost control, quality/safety, and closeout.

### 1. Tech stack (use exactly these)

- **Build tool**: Vite 6 + `@vitejs/plugin-react`, plus `vite-plugin-wasm` and `vite-plugin-top-level-await` (needed for `web-ifc`). ESM-only (`"type": "module"`).
- **Framework**: React 18 + React Router v6 (lazy-loaded routes with `Suspense` + error boundaries).
- **Language**: JavaScript with `jsconfig.json` for path aliasing (`@/*` → `src/*`); use `tsc --noEmit` against the jsconfig for typecheck.
- **Styling**: Tailwind CSS 3 + `tailwindcss-animate`, layered on top of a custom design-token CSS system (`src/styles/tokens.css`, `base.css`, `components.css`, `animations.css`, `responsive.css`, `tailwind-compat.css`). Dark/light mode with an "executive gold" accent (`#C89B20`). Density toggle (compact / normal / comfortable) wired through a `data-density` attribute on `<html>`.
- **UI primitives**: shadcn/ui on top of the full Radix UI suite (Accordion, AlertDialog, Dialog, DropdownMenu, Popover, Select, Tabs, Tooltip, Toast, Switch, etc.). Icons via `lucide-react`. Toasts via `sonner` + `react-hot-toast`. Animations via `framer-motion`.
- **Data layer**: Supabase JS client (`@supabase/supabase-js`) for PostgreSQL CRUD, auth, storage, and (optionally) Edge Functions. TanStack React Query v5 for server cache, with `useQuery` / `useMutation` patterns and per-entity stale times.
- **Forms & validation**: `react-hook-form` + `@hookform/resolvers` + `zod` schemas (kept in `src/config/schemas.js`).
- **3D / BIM**: `@thatopen/components` v3.4 + `@thatopen/components-front` + `@thatopen/fragments` v3.4 + `three` v0.182 + `web-ifc` v0.0.77 + `camera-controls`. The fragments worker must be served from `public/thatopen/fragments-worker.mjs` and passed to `FragmentsManager.init()` — do not rely on dynamic imports. Exclude `web-ifc` from Vite pre-bundling.
- **PDF**: `pdfjs-dist` v4 for canvas rendering, plus a default `<iframe>` viewer toggle for reliability. `jspdf` + `html2canvas` for client-side PDF/transmittal/report export.
- **Charts**: `recharts` for cost dashboards, KPIs, health scores.
- **Maps**: `react-leaflet` for site/location features.
- **Rich text**: `react-quill` for notes/RFIs.
- **Drag & drop**: `@hello-pangea/dnd` for kanban / list reordering.
- **Misc**: `date-fns` (preferred) and `moment` (legacy), `lodash`, `clsx` + `tailwind-merge` + `class-variance-authority`, `cmdk` (command palette), `vaul` (drawers), `embla-carousel-react`, `canvas-confetti`, `input-otp`, `next-themes`, `react-day-picker`, `react-resizable-panels`, `react-markdown`.
- **Testing**: Vitest + a `vitest.setup.js`; tests live in `src/__tests__/`.
- **Lint**: ESLint 9 flat config with `eslint-plugin-react`, `react-hooks`, `react-refresh`, `unused-imports`.
- **Deploy**: Vercel (`vercel.json`) building from `dist/`.

### 2. Environment variables

Required in `.env.local`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable anon key>
```

Optional:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...   # only if calling the LLM client-side; prefer a Supabase Edge Function
```

All env access goes through `import.meta.env`.

### 3. Directory layout

```
src/
  api/
    supabaseClient.js        # entity CRUD adapter (see §6), file upload, auth helpers
    base44Client.js          # legacy Base44 shim (kept for compatibility)
  pages/                     # one file per route, ~56 pages (see §5)
  components/
    nav/                     # Sidebar, MobileDrawer, Breadcrumbs, ProjectPill, ModulesDropdown, GlobalSearch, QuickAddFab
    shared/                  # ProjectContext, hooks, reusable presentational pieces
    drawings/  rfis/  schedule/  fabrication/  cost/  field/  quality/  closeout/  ...
    ui/                      # shadcn/ui generated primitives
  config/
    moduleRegistry.js        # nav/module catalog (tab → pages)
    routes.js                # pure-data route labels + grouping metadata (no imports)
    schemas.js               # zod schemas
  lib/
    AuthContext.jsx
    supabase.js
    query-client.js
    utils.js
  hooks/                     # useDocumentTitle, useAlerts, useCrudMutation, useDebouncedValue, ...
  services/                  # auditLogger, workflowEngine, validation, permissions
  styles/                    # design tokens + Tailwind bridge (see §1)
  utils/                     # formatters, batch helpers, id/sequence helpers
  __tests__/                 # vitest specs
  App.jsx                    # router + providers + suspense shell
  Layout.jsx                 # top bar + sidebar + global modals
  main.jsx                   # ReactDOM root
public/
  thatopen/fragments-worker.mjs   # required by @thatopen/fragments
```

### 4. Providers & app shell

`App.jsx` wraps the router in (outer → inner): `QueryClientProvider` → `ThemeProvider` → `AuthProvider` → `ProjectProvider` → `BrowserRouter` → `Suspense` + `ErrorBoundary` → `Layout` → lazy-loaded routes. Add a `PageNotFound` fallback for unknown URLs.

`Layout.jsx` renders:

- **Top bar**: brand mark, global search trigger (Cmd/Ctrl+K opens a `cmdk` modal), density toggle, modules dropdown, notifications bell (driven by the `alerts` table), user menu with sign-out, and an active-project pill that opens a project switcher.
- **Sidebar** (desktop) / hamburger drawer (mobile) listing the modules from `moduleRegistry.js`.
- **Breadcrumbs** derived from the current route label.
- **Quick-add FAB** for creating RFIs / daily logs / photos from anywhere.
- A persistent error banner when the active project fails to load.
- Toaster outlets for `sonner` and `react-hot-toast`.

### 5. Modules, pages, and routes

Define the navigation in `src/config/moduleRegistry.js`. Top-level tabs and the pages that live under each:

- **DASHBOARD** — `Dashboard`
- **PCC** — `ProjectControlCenter`
- **PROJECTS** — `Projects`, `ExecutiveView`, `ProjectDetail`
- **RFIs** — `RFIs`, `RFIHub` (command center)
- **DRAWINGS** — `Drawings`, `DrawingViewer`, `Documents`
- **FABRICATION** — `WorkPackages`, `Constraints`, `FabRelease`, `Procurement`, `LookAheadSchedule`
- **DELIVERIES** — `Deliveries`
- **SCHEDULE** — `Schedule`, `GanttChart`
- **FIELD** — `DailyLogs`, `Photos`, `ProductionNotes`, `LEMs`
- **COST** — `Financials`, `CostDashboard`, `ChangeOrders`, `SOV`, `ContractManagement`, `Expenses`
- **RESOURCES** — `ResourceScheduling`, `ResourceManagement`
- **REPORTS** — `AIInsights` (Portfolio Overview), `JobStatusReport`, `AlertsCenter`, `Activity`, `Mitigations`
- **QUALITY** — `Inspections`, `Safety`, `Punchlist`, `QualityControl`
- **CLOSEOUT** — `ProjectCloseout`, `Warranty`, `ChangeRequests`
- **Standalone**: `AgentMemory`, `Alerts`, `DecisionLog`, `Contacts`, `ScopeExclusions`, `Settings`, `UsersManagement`, `ModelViewer` (3D/BIM)

Routes are defined declaratively in `src/routes.js` as pure data (label + group + path), and `App.jsx` lazy-loads the matching page component for each path. Approximately 56 routes total.

### 6. Data layer (Supabase) and entities

Build a thin CRUD adapter in `src/api/supabaseClient.js` that wraps `supabase.from(table)` with these conventions:

- Soft-delete: every list/filter call automatically excludes rows where `is_deleted = true`. Provide `softDelete(id)` that sets `is_deleted = true, deleted_at = now()`.
- Field aliasing: accept `created_date` / `updated_date` from callers and translate to `created_at` / `updated_at` in the DB (legacy compatibility).
- Filter helpers: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`.
- Atomic numbering: a Postgres RPC (e.g. `next_sequence(entity, project_id)`) for RFI #, drawing #, change order #, etc.
- Errors: throw structured errors carrying `{ table, op, code, message }` so React Query can surface them and the UI can show a friendly toast.
- File upload helpers backed by Supabase Storage buckets (`drawings`, `photos`, `documents`).

Create roughly these tables (PostgreSQL via Supabase):

- **Core**: `projects`, `user_profiles`, `cost_codes`, `activities`
- **Drawings/Docs**: `drawings`, `drawing_sets`, `uploaded_files`
- **RFIs**: `rfis`
- **Schedule**: `schedule_tasks`, `look_ahead`
- **Work**: `work_packages`, `scope_items`, `deliveries`
- **Fabrication / commercial**: `sov_items`, `change_orders`, `change_requests`, `constraints`
- **Field**: `daily_logs`, `photos`, `production_notes`, `meetings`
- **Quality / Safety**: `inspections`, `punchlist_items`, `quality_control_records`, `safety_incidents`
- **Closeout**: `project_closeout`, `warranties`
- **Finance**: `expenses`
- **Planning / PMA**: `pma_decisions`, `pma_assumptions`, `pma_audit_logs`, `mitigation_logs`, `mitigation_actions`
- **People**: `contacts`, `vendors`, `resources`
- **Alerts**: `alerts`

Every domain table has at minimum: `id (uuid)`, `project_id (uuid fk)`, `created_at`, `updated_at`, `created_by`, `is_deleted`, `deleted_at`. Add row-level security so users only see rows for projects they belong to.

### 7. Authentication

- Supabase Auth with email/password (`signInWithPassword`) and session refresh on app boot.
- A local sign-in form is the fallback when no session exists.
- After login, fetch the `user_profiles` row to get the server-authoritative `role` (`admin` or `user`) — never trust `user.user_metadata.role` alone.
- A `ProtectedRoute` component redirects unauthenticated users to `/login` and gates admin-only pages (e.g. `UsersManagement`).
- Expose `useAuth()` returning `{ user, profile, role, signIn, signOut, loading }`.

### 8. State management

- **React Context only** (no Redux/Zustand):
  - `AuthContext` — session + role
  - `ProjectContext` — active project, list of projects, loading state, persists `activeProjectId` and a `sbp_projects_cache` snapshot to `localStorage`
  - `ThemeContext` — dark/light mode, persists to `localStorage` as `sbp-theme`
- **TanStack React Query v5** for all server data. Configure `QueryClient` in `src/lib/query-client.js` with sensible defaults (5 min stale time for read-heavy lists, retry once, refetchOnWindowFocus off for tables). Use mutations with optimistic updates for kanban, RFI status changes, and punchlist toggles.

### 9. Feature requirements per module

Implement these features (page-by-page UI is up to you; the behavior is what matters):

- **Dashboard / PCC** — Portfolio KPIs, project health tiles, urgent RFIs, today's deliveries, schedule slips, cost variance, charted via recharts.
- **Projects** — List + create + ExecutiveView (high-level rollups, sparkline trends). `ProjectDetail` is a tabbed deep-dive.
- **RFIs / RFIHub** — RFI table with status pipeline (Open → Under Review → Answered → Closed), priority, ball-in-court, auto-numbering, bulk operations, rich-text body, attachments, kanban view via `@hello-pangea/dnd`.
- **Drawings / DrawingViewer / Documents** — Sheet register with discipline + revision filters, stage pipeline (Drafted → Approved → Published), approval workflow, transmittal export to PDF (`jspdf` + `html2canvas`). DrawingViewer defaults to native `<iframe>` PDF, with a toolbar toggle to switch to pdfjs canvas mode.
- **ModelViewer** — Loads IFC/GLTF via `@thatopen/components`. Initialize `FragmentsManager` with the worker URL from `/thatopen/fragments-worker.mjs`. Support tile streaming, member-type inference, color coding by status (e.g. fabricated / shipped / installed), section cuts, and element selection that cross-links to RFIs / drawings.
- **WorkPackages / Constraints / FabRelease / Procurement / LookAhead** — Constraint log, fab release tracker, procurement statuses, 3-week look-ahead grid.
- **Schedule / GanttChart** — Task list + interactive Gantt with drag-resize, dependencies, baseline vs actual.
- **Deliveries** — Calendar + list of inbound/outbound deliveries.
- **Field** — `DailyLogs` (weather, crew, narrative), `Photos` (upload + tag + OCR-ready captions), `ProductionNotes`, `LEMs` (Labor & Equipment Modeling).
- **Cost** — `Financials`, `CostDashboard` (recharts forecasting), `ChangeOrders`, `SOV` (schedule of values), `ContractManagement`, `Expenses`.
- **Resources** — `ResourceScheduling`, `ResourceManagement` (crew + equipment allocation).
- **Reports** — `AIInsights` (portfolio summary, optionally backed by Anthropic API via Supabase Edge Function), `JobStatusReport`, `AlertsCenter`, `Activity` feed, `Mitigations`.
- **Quality** — `Inspections`, `Safety` incidents, `Punchlist` (drag-and-drop kanban), `QualityControl`.
- **Closeout** — `ProjectCloseout` checklist, `Warranty` register, `ChangeRequests`.
- **Settings / UsersManagement** — Profile, theme, density, role/user admin, project membership.
- **Alerts** — Bell-driven notification center backed by the `alerts` table, with read/unread state and per-user filtering.

### 10. Cross-cutting requirements

- Lazy-load every page; show a Suspense skeleton.
- Wrap each route in an error boundary that reports to the `activities` table via a small `auditLogger` service.
- Every list view supports search, filter chips, column sorting, density-aware row heights, and CSV export.
- Every form is `react-hook-form` + `zod` + shadcn `Form` components, with inline validation and toast-on-save.
- Provide a `useCrudMutation` hook that wires React Query mutations to optimistic updates + invalidations + toast.
- Document titles update via a `useDocumentTitle` hook keyed off the route label.
- Keyboard shortcuts: Cmd/Ctrl+K opens global search; `/` focuses the page-level search; `g p` jumps to Projects, etc.
- All copy uses sentence case; numbers use locale formatting; dates use `date-fns`.
- Ship a Vitest suite covering the supabase adapter, auth context, `useCrudMutation`, and at least the RFI status transitions.

### 11. Build & scripts

`package.json` scripts:

```
dev         vite
build       vite build
preview     vite preview
lint        eslint . --quiet
lint:fix    eslint . --fix
typecheck   tsc -p ./jsconfig.json
test        vitest run
test:watch  vitest
```

Output goes to `dist/`. Vercel deploys from `dist/` on push.

### 12. Acceptance checklist

- `npm install && npm run build` exits clean with no warnings beyond the expected web-ifc/wasm chunks.
- Logging in with a Supabase test user lands on the Dashboard, with the active project pill populated from cache.
- Creating an RFI auto-assigns the next number, shows up in the kanban + table, and emits an entry in `activities`.
- Uploading an IFC into the ModelViewer renders fragments without console errors and selecting an element opens a side panel.
- Toggling dark mode and density both persist across reloads.
- Soft-deleting any record removes it from list views but leaves the row in the database.

Build the entire application end-to-end matching this brief.
