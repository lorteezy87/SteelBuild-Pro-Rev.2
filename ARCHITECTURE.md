# SteelBuild Pro — Architecture

This document captures the major architectural decisions and the system
shape of SteelBuild Pro. Read this before making structural changes;
update it when you do.

For the running list of known issues, see [`TECH_DEBT.md`](./TECH_DEBT.md).

---

## System overview

```
                 ┌──────────────────────────┐
                 │     Browser (React)      │
                 │  Vite + TanStack Query   │
                 └────────────┬─────────────┘
                              │ HTTPS (REST + RPC)
                              ▼
              ┌───────────────────────────────────┐
              │    Supabase                       │
              │  ┌───────────┐ ┌────────────────┐ │
              │  │ Postgres  │ │ Auth (gotrue)  │ │
              │  │ + RLS     │ │ session JWTs   │ │
              │  │ + RPC     │ │                │ │
              │  └───────────┘ └────────────────┘ │
              │  ┌───────────┐ ┌────────────────┐ │
              │  │ Storage   │ │ Edge Functions │ │
              │  │ (uploads) │ │ (llm-proxy)    │ │
              │  └───────────┘ └────────────────┘ │
              └────────────────┬──────────────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │  LLM provider (OpenAI) │
                  │  Stripe (billing)      │
                  │  — via Edge Functions  │
                  └────────────────────────┘

         Hosting: Vercel auto-deploys from main → steelbuild-pro.com
```

There is no separate backend service. The app is a SPA that talks
directly to Supabase with the publishable anon key, with security
enforced by Postgres Row-Level Security and Edge Functions for
operations that need server-side compute (LLM calls, billing,
data export, scheduled jobs). It is **multi-tenant**: each company is an
`organizations` row (a "workspace"), and every project belongs to one org.

---

## Auth & authorization

### Auth

- Supabase Auth (gotrue) for login, password reset, JWT sessions
- A `LocalLoginForm` shim exists for environments without auth
  configured (set `VITE_SUPABASE_URL` to point at a real project to
  use real auth)
- Session is stored in localStorage by Supabase; access tokens are
  attached to every PostgREST and RPC request automatically

### Authorization (RBAC, post-Phase-B)

Two layers of role:

1. **Global system role** — `user_profiles.role`
   - Values: `'admin' | 'user'`
   - Set by direct DB write (no UI yet); used by `<AdminRoute>` to
     gate admin-only pages
   - `nickl@shsteelaz.com` is the bootstrap system admin

2. **Per-project role** — `user_projects.role`
   - Values: `'owner' | 'admin' | 'pm' | 'field' | 'viewer'`
   - `'owner'` is treated as a synonym for `'admin'` (level 3) in all
     helpers, so the existing 15 owner rows keep full access
   - Set per (user, project) pair in `user_projects`

The DB-side level table:

```
viewer = 0   ←─ read-only access
field  = 1   ←─ can mark progress, upload photos
pm     = 2   ←─ can edit drawings, submittals, schedule
admin  = 3   ←─ can lock/unlock, void signoffs, delete sets
owner  = 3   ←─ same as admin (legacy synonym)
```

### RLS helpers (Postgres functions, all SECURITY DEFINER)

- `user_has_project_access(project_id)` — boolean: does the current
  user have ANY role on the project?
- `get_my_project_role(project_id)` — text: returns the current user's
  role on the project, or NULL if not a member
- `user_has_project_role(project_id, role)` — boolean: exact match
- `user_has_project_role_at_least(project_id, min_role)` — boolean:
  current role ≥ min_role per the level table above
- `user_is_project_admin(project_id)` — boolean: shorthand for `_at_least(_, 'admin')`

### Sensitive operations (admin-only at the DB layer)

- `drawing_sets` DELETE
- `drawing_sets.is_locked` true → false transition (BEFORE UPDATE
  trigger `enforce_drawing_set_unlock_role`)
- `drawing_signoffs` UPDATE that flips `is_voided` → must be admin OR
  the original signer (`stamped_by_id = auth.uid()`)
- Writes to `drawing_zones`, `drawing_links`, `drawing_zone_dependencies`,
  and `drawings.markup` while the parent set is locked → admin only
  (helpers `set_for_drawing_is_locked`, `set_for_zone_is_locked` walk
  the FK chain when the row doesn't have project_id directly)

### Front-end role plumbing

- `useAuth()` (`src/lib/AuthContext.tsx`) — current user + session,
  reads `user_profiles.role` for the global flag
- `useProjectRole(projectId)` (`src/hooks/useProjectRole.ts`) — calls
  `get_my_project_role` RPC, TanStack-cached 5min
- `useAppSecurity()` (`src/components/shared/useAppSecurity.jsx`) —
  composes both: `isAdmin` is true if either (global role === admin)
  OR (project role ≥ admin for the active project). Falls back to
  legacy localStorage roles only when there's no active project (login
  chrome, settings).

---

## Multi-tenancy & billing

SteelBuild Pro is a multi-tenant SaaS. A company signs up, creates a
**workspace** (`organizations`), and works inside it; the workspace is the
billing + invite + grouping unit.

### Tenancy model

| Table | Purpose |
|---|---|
| `organizations` | The workspace. `plan` is the billing/entitlement anchor; `stripe_*` columns track the subscription. |
| `organization_members` | (user, org) membership + role (`owner`/`admin`/`member`). |
| `organization_invitations` | Tokenized email invites (14-day expiry); accepted via `accept_invitation()`. |
| `projects.org_id` | Every project belongs to exactly one org (NOT NULL). |

Front-end: `OrgProvider` / `useOrg()` resolve the active workspace (fail-open so
a transient fetch error never strands a member), `OrgOnboarding` is the
create-workspace / accept-invite gate above the app, and `OrgMembers`
(`/OrgMembers`) manages the team + invites. A brand-new workspace is routed into
the first-run **Onboarding** wizard.

### Data isolation (the org boundary)

`user_projects` remains authoritative for *which* member sees *which* project's
data and at what role — but the **org boundary is enforced underneath it**.
`user_has_project_access(project_id)` (the chokepoint for ~70 project-scoped RLS
policies) now requires the caller to be a member of the project's org;
`create_project()` rejects a client-supplied `org_id` the caller isn't a member
of; `vendors` and `user_profiles` reads are org-scoped; and Storage uploads are
written under an `<org_id>/uploads/...` path that storage RLS gates by org
membership (legacy flat `uploads/...` files are grandfathered to the founding
org via `founding_org_id()`). Net: one tenant can never read another's rows or
files. See migrations `20260615000000`–`20260616000000`.

### Billing

Stripe subscription plans (Free / Pro / Business; `src/lib/billing/plans.ts`,
`usePlan()`). `organizations.plan` is the only definition of entitlement and is
**tamper-proof** — a `BEFORE UPDATE` trigger blocks the client from changing the
billing columns; only the Stripe webhook (service role) can. Plan **limits**
(projects, members) are enforced server-side in `create_project()` and
`accept_invitation()` via `plan_project_limit()` / `plan_member_limit()`. The
`/Billing` page calls the `stripe-billing` Edge Function for Checkout + Portal;
price ids live in the function's env, so the client only ever passes a plan key.

---

## Domain workflow

The detailing/submittal workflow is the heart of the app. Stages
(corrected May 2026, migration 077):

```
┌─ Not Started
│
├─ IFA  In For Approval         (internal prep — Detailer → S&H → GC)
├─ OFA  Out For Approval        (with EOR / AOR / Architect)
├─ BFA  Back From Approval      (returned with AAN / Approved / R&R)
├─ OFS  Out For Scrub           (post-approval cleanup; detailer
│                                addresses EOR comments)
├─ IFC  Issued For Construction (S&H sends record copy to GC)
└─ Released for Fab             (S&H internal release to fab shop)
```

R&R (Revise and Resubmit / Rejected) outcomes loop back to IFA.

### Workflow source of truth

**Submittals are the source of truth for workflow status.** Drawings
are document artifacts. Both `drawings.stage` and
`drawing_sets.set_approval_status` are deprecated for workflow
rollups — read `submittals.status` + `submittals.ball_in_court` and
map via `submittalStatusToStage(status, bic, approved_date)` (see
[`src/lib/submittalStageMapping.js`](src/lib/submittalStageMapping.js)).

The mapping uses ball-in-court class to discriminate phases:

```
Detailer-class  (Detailer / S&H / Contractor / Subcontractor)  → IFA / OFS
Approver-class  (EOR / Architect / AOR)                        → OFA / BFA
Downstream-class (GC / Owner)                                  → IFC
```

### Auto-lock on approval

When a submittal transitions to a terminal-approved status (`Approved`,
`Approved as Noted`, `Released for Fabrication`), every linked drawing
set is auto-locked from edits. This is implemented in
`useSubmittals.ts` `lockLinkedSetsIfApproved` — the lock primitive
(`drawingHub/setLock.lockSet`) is unchanged; only the trigger path
moved from `set_approval_status='approved'` (legacy, document-side) to
submittal terminal status (workflow-side).

---

## Data model

### Core entity tables

| Table | Purpose |
|---|---|
| `projects` | Top-level project record |
| `user_projects` | Membership + role per (user, project) |
| `user_profiles` | Global role + display info per auth user |
| `drawings` | Per-sheet record (one row per sheet) |
| `drawing_sets` | Package container (one upload = one set) |
| `drawing_revisions` | Per-version history of a drawing |
| `drawing_zones` | User-drawn rectangles/polygons on PDFs |
| `drawing_signoffs` | Approval stamps (admin or signer can void) |
| `submittals` | Workflow record — what was sent, to whom, status |
| `submittal_rounds` | Per-round transmittal history |
| `submittal_sheet_responses` | Per-sheet response within a round |
| `comments` | Polymorphic — used by RFIs, submittals, drawings |
| `feature_flags` | Lightweight flag system w/ per-email overrides |
| `organizations` / `organization_members` / `organization_invitations` | Multi-tenant workspace, membership, invites (see above) |

Beyond the moat, the schema spans the broader steel workflow: `rfis`,
`change_orders`, `work_packages`, `schedule_tasks`, cost (`sov_items` /
`cost_codes` / `expenses`), `deliveries`, QA (`inspections` /
`quality_control_records`), field (`punchlist_items` / `daily_logs` / `photos`),
`pay_applications` (AIA G702/G703), `backcharges` / `tm_tickets`, and production
+ 3D (`piece_production`, `model_registry`, `model_elements`).

### Soft deletes

Most tables have an `is_deleted` boolean. Entity clients filter them
out by default. Restores are possible by toggling the flag.

### Audit trails

- `drawing_activity` — append-only log of drawing-level state changes
- `drawing_zone_activity` — append-only log of zone-level changes
- Both have `event_type` CHECK constraints; not free-text.

---

## Frontend organization

### Routing

`src/config/routes.js` is the single registry. Every page is
`React.lazy` so the initial bundle is small. Admin-only routes wrap
with `<AdminRoute>` (checks `user_profiles.role === 'admin'`).

### State management

- **Server state** — TanStack Query (React Query). One query per
  entity, with predictable `queryKey` shape `["entity-name", projectId]`.
  Cache invalidation via `qc.invalidateQueries({ queryKey: ... })`
  after writes.
- **Client state** — `useState` / `useReducer` per component. Cross-page
  context only via `useProjectContext` (the active project) and
  `useAuth` / `useAppSecurity` (user + role).
- **Form state** — `react-hook-form` for complex forms; plain `useState`
  for simple ones. Validation via `zod` schemas in `src/services/validation.ts`.

### Style system

- `src/styles/tokens.css` defines CSS custom properties: `--accent`,
  `--bg-surface`, `--text-primary`, `--font-mono`, etc.
- `src/components/design-system/` — shared primitives (CommandBar,
  KpiTile, PhaseChevron, Button, BulkActionBar)
- Inline styles + token references for everything else. **NOT Tailwind**
  despite the README mentioning it — see TECH_DEBT.md for the migration
  posture (we recommend NOT migrating; the token system works and is
  consistent).

### Feature flags

- `useFlag(key)` returns boolean. `useAllFlags()` returns Map.
- Per-email overrides via `feature_flags.user_overrides` jsonb map
- Admin UI at `/FeatureFlagsAdmin` for toggling and override management

---

## Backend (Supabase) organization

### Migrations

`supabase/migrations/` — mixed legacy `NNN_name.sql` and timestamped
`YYYYMMDDhhmmss_name.sql` (**170 as of this writing**; inspect the directory for
the latest, don't assume a number). Apply live via the Supabase MCP
(`apply_migration`) and commit the same SQL so repo history matches the
database. A migration that changes the exposed schema ends with
`NOTIFY pgrst, 'reload schema'`.

### Edge Functions

`supabase/functions/` (deploy via Supabase MCP `deploy_edge_function` or
`supabase functions deploy`):

- `llm-proxy` — the LLM gateway. Holds the only provider API key; all model
  calls route here. Does its own JWT verification (deploy `--no-verify-jwt`).
- `schedule-assistant` — schedule chat/tooling; routes model turns through `llm-proxy`.
- `email-ingest` — inbound email → staged project records (Power Automate path).
- `email-send` — outbound email compose/reply pipeline.
- `project-export` — RLS-scoped, audited per-project data export (powers the
  workspace backup; see Data export).
- `stripe-billing` / `stripe-setup` / `stripe-webhook` / `stripe-worker` —
  subscription checkout, portal, and webhook handling.
- `_shared/` — CORS + helpers.
- `sharepoint-proxy`, `bluebeam-proxy` — **deprecated** integrations; still
  deployed but no longer client-invoked (slated for `functions delete`).

### Storage

The `app-files` Supabase Storage bucket holds drawing PDFs, photos, IFC models
(gzipped), etc.; `email-attachments` is a separate project-scoped bucket. URL
lifecycle is signed-URL based (short-lived); the app re-resolves on use via
`resolveFileUrl` / `getSignedUrl`. Bucket file-size limit is 50 MB (large IFC
models are gzipped on upload to fit + speed downloads). **Tenant-isolated**: new
uploads are written under `<org_id>/uploads/...` and storage RLS gates reads by
org membership; legacy flat `uploads/...` objects are grandfathered to the
founding org. UPDATE/DELETE are owner-scoped.

---

## Background jobs

### AI extraction reconciler

`reconcile_stuck_extractions()` Postgres function flips drawings stuck
in `ai_extraction_status='Extracting'` for >5 min back to `'Failed'`.
Scheduled every 5 minutes via `pg_cron` (migration `20260516003546`).

### Trigger functions

- `enforce_drawing_set_unlock_role` — BEFORE UPDATE on `drawing_sets`,
  raises 42501 if non-admin tries to flip `is_locked` true → false
- `update_updated_at` — generic timestamp trigger, used on most
  entity tables

---

## LLM gateway

All LLM-backed features (drawing analysis, revision compare, sheet
extraction, RFI/shipping-ticket import, photo OCR, drawing-link
suggestions) route through a single Supabase edge function called
`llm-proxy`. The gateway is the only component that holds vendor API
keys; the browser never touches Anthropic / OpenAI keys directly.

### Phase 1 — what shipped

**Routing.** Callers pass an optional `useCase` field; the function
looks it up against a routing table to pick a `(provider, model)`
pair. Explicit `provider`/`model` in the body still take precedence,
so legacy callers that hard-coded `provider: "openai"` continue to
work unchanged.

| use case                  | provider  | model              | called from                                      |
|---------------------------|-----------|--------------------|--------------------------------------------------|
| `general` (default)       | anthropic | claude-sonnet-4-5  | catch-all for ad-hoc `InvokeLLM` calls            |
| `drawing-analysis`        | openai    | gpt-4o-mini        | `src/lib/analyzeDrawing.js`                       |
| `revision-compare`        | openai    | gpt-4o-mini        | `src/lib/compareRevisions.js`                     |
| `sheet-extraction`        | openai    | gpt-4o-mini        | `src/lib/pdfSheetExtractor.js` (via `InvokeLLM`)  |
| `drawing-link-suggest`    | openai    | gpt-4o-mini        | `src/lib/drawingHub/aiSuggest.js`                 |
| `shipping-ticket-import`  | openai    | gpt-4o-mini        | `src/lib/importShippingTicket.js`                 |
| `rfi-log-import`          | openai    | gpt-4o-mini        | `src/lib/importRfiLog.js`                         |
| `photo-ocr`               | openai    | gpt-4o-mini        | `src/components/ocr/FileUploadWithOCR.jsx`        |
| `schedule-assist`         | anthropic | claude-sonnet-4-5  | (NOT WIRED IN PHASE 1 — see TECH_DEBT.md)         |

The Phase 1 routing intentionally **mirrors current production
defaults**. We did not silently switch any caller to a new provider;
Phase 2 will use telemetry to make informed switches.

> **Since Phase 1:** the default provider is OpenAI (`gpt-4o` / `gpt-4o-mini`);
> the AI **Revision Intelligence** line replaced the old `analyzeDrawing.js` /
> `compareRevisions.js` with `src/lib/revisionSnapshotDiff.js` (per-sheet diff,
> useCase `revision-compare`) feeding `drawing_revision_deltas`, a package-level
> Revision Impact Report, and one-click Create-RFI-from-delta. The gateway
> pattern is unchanged — only the routing rows + callers evolved.

**Telemetry.** Every call writes one row to `public.llm_telemetry`
(success or failure):

| column        | type           | source                                                          |
|---------------|----------------|-----------------------------------------------------------------|
| `use_case`    | text           | request body (`general` if omitted)                             |
| `provider`    | text           | resolved (explicit override OR router target)                   |
| `model`       | text           | resolved                                                        |
| `user_id`     | uuid           | from the JWT — function authenticates before dispatching        |
| `project_id`  | uuid           | request body (`null` when caller doesn't know)                  |
| `input_tokens`| integer        | provider response usage (Anthropic `input_tokens`, OpenAI `prompt_tokens`) |
| `output_tokens`| integer       | provider response usage (`output_tokens` / `completion_tokens`) |
| `cost_usd`    | numeric(12,6)  | `computeCostUsd(provider, model, in, out)` — null if unknown    |
| `latency_ms`  | integer        | `performance.now()` delta around the provider call              |
| `success`     | boolean        | true iff provider returned 2xx                                  |
| `error_kind`  | text           | `rate_limit`, `auth_error`, `upstream_5xx`, `parse_error`, …    |
| `metadata`    | jsonb          | freeform (`{ explicit_provider, had_tools, status, … }`)        |

RLS allows SELECT only to `user_profiles.role = 'admin'`. Inserts go
through the service role from inside the edge function so RLS doesn't
block them.

**Wire format.** The response envelope `{ text, content, tool_use,
raw, protocol_version }` is **unchanged** from v7. The internal
`LLMResponse` shape in `providers/types.ts` carries token counts and
cost data that the dispatcher uses for telemetry but never returns to
the caller.

### File layout

```
supabase/functions/llm-proxy/
├── index.ts             — auth, dispatch, telemetry, wire-format translation
├── router.ts            — ROUTING_TABLE + getProviderForUseCase()
└── providers/
    ├── types.ts         — LLMRequest, LLMResponse, LLMError, ProviderClient
    ├── cost.ts          — rate card + computeCostUsd()
    ├── anthropic.ts     — Anthropic Messages API client
    └── openai.ts        — OpenAI Chat Completions client (with content adapters)
```

### Adding a new provider (Phase 2)

1. Add `providers/<vendor>.ts` exporting a `ProviderClient`. Re-use
   the Anthropic/OpenAI files as templates — both adapt their vendor
   API to the canonical Anthropic-style request shape and return the
   internal `LLMResponse` shape. Throw `LLMError` for non-2xx so the
   dispatcher can surface the correct HTTP status.
2. Add the rate-card row to `providers/cost.ts` and update the source
   comment with the date you fetched the prices.
3. Register the client in `PROVIDER_REGISTRY` inside `index.ts`.
4. Add or change the routing rows in `router.ts` for the use cases
   you want to migrate.
5. Add a router test pinning the new routing decisions before
   deploying.

### Deploy

The edge function is **deployed manually** via:

```
supabase functions deploy llm-proxy --no-verify-jwt
```

The `--no-verify-jwt` flag is required — `llm-proxy` does its own JWT
verification against `/auth/v1/user` (so it can attribute telemetry to
the calling user) instead of relying on Supabase's gateway check.

The migration that creates `llm_telemetry` is `081_llm_telemetry.sql`.

---

## CI/CD

### Continuous integration

`.github/workflows/ci.yml` runs on every push to feature/main/deploy
branches and every PR:

1. ESLint (errors block, warnings allowed)
2. TypeScript — both `typecheck` (TS) and `typecheck:js` (JS/JSX), blocking
3. Vitest (~1,250 tests)
4. Production Vite build

Concurrency group cancels redundant runs on rapid iteration.

### Deployment

Vercel auto-deploys from `main`. Workflow:

1. Develop on a `claude/<slug>` feature branch
2. Push commits + PR if collaborating
3. Merge into `main` (Vercel builds + deploys)
4. Verify on the live URL

`CLAUDE.md` documents the auto-deploy command sequence used by
agent-driven development.

---

## Testing

### Unit / integration

Vitest. ~1,250 tests across pure helpers (`drawingHub`, `submittalStageMapping`,
`costRollup`, `projectKpis`, `payapp`, `backcharge`, `pdfSheetExtractor`, etc.),
hook-level tests, and jsdom integration tests that drive real components +
import flows with the Supabase client mocked.

```
npm test               # one-shot run
npm run test:watch     # watch mode
```

### Component rendering (RTL)

Component-level smoke tests live in `src/__tests__/components/` and
use React Testing Library + jsdom. The **default vitest environment is
still `node`** (it keeps the pure-helper suite fast and avoids loading
jsdom for tests that don't need it). Component tests opt into jsdom
with a per-file pragma at the top of the file:

```jsx
// @vitest-environment jsdom
```

Setup:

- `src/setupTests.ts` — runs after `vitest.setup.js`. Imports
  `@testing-library/jest-dom/vitest` matchers, registers an
  `afterEach(cleanup)` for unmounting, and polyfills the three
  globals jsdom doesn't ship (`matchMedia`, `ResizeObserver`,
  `IntersectionObserver`) so radix / recharts / charts don't
  crash on first render.
- Both setup files are wired into `vite.config.js`. The polyfill
  block in `setupTests.ts` is guarded by `typeof window !== "undefined"`
  so loading it under the default node env is a no-op.

Pattern (see `Layout.test.jsx`, `Drawings.test.jsx`,
`Submittals.test.jsx` for live examples):

1. `vi.mock("@/api/supabaseClient", ...)` — provide the named `entities`
   surface as a Proxy whose entity clients resolve to empty arrays / nulls
   (plus `resolveFileUrl` where the component needs it). No network.
2. `vi.mock("@/lib/supabase", ...)` — stub `auth.getSession`,
   `auth.onAuthStateChange`, `from()` chains, `rpc()`.
3. Render the real component inside `MemoryRouter` +
   `QueryClientProvider`. For project-scoped pages, wrap in
   `<ProjectContext.Provider value={...}>` directly with a
   synthetic project rather than mounting `ProjectProvider`
   (avoids the provider's network fetch).
4. Assert on user-visible strings — the CommandBar title, an
   empty-state message, an accessibility affordance.

The point of these tests is proof-of-life: render the real component
without throwing. They are not a substitute for unit tests of pure
logic — they prove that the test infrastructure works on real
production code paths and catch the kind of "import broke at module
load" regression that pure-helper tests miss.

### What's not tested yet

- E2E flows (no Playwright / Cypress)
- Visual regression
- Most page-level components beyond the three smoke targets above

Priorities for the next test sprint: extend RTL coverage to
DrawingViewer and ModelViewer, then add interaction tests
(`@testing-library/user-event`) for the most-trafficked flows.

---

## Performance posture

### What's done

- Every route is `React.lazy` → small initial bundle
- TanStack Query caches with sensible staleTimes (60s on dashboards,
  30s on list views)
- ThumbnailFilmstrip caches pdfjs documents by storage path so
  multi-sheet PDFs parse once, not once per sheet
- The self-hosted IFC viewer (web-ifc + three) is lazy-loaded so the
  ~3.6 MB wasm + three never touch the main bundle; it renders structural
  members only (~5× fewer draw calls on big models)
- Large IFC models are gzipped on upload (e.g. 52 MB → ~7 MB)
- Sentry error + performance monitoring with masked session replay

### What's not done

- No Lighthouse CI / performance budgets in the build
- No bundle-size budgets
- Large-project virtualization / server-side filtering still partial
- No code splitting beyond per-route lazy chunks

Track all of these in TECH_DEBT.md.

---

## File structure cheat sheet

```
src/
  api/              Supabase client + entity client factory
  components/
    drawings/       Drawings page UI + modals + viewer subcomponents
    submittals/     Submittals page UI + bulk modals + round timeline
    schedule/       Schedule page UI + Gantt + helpers
    workpackages/   Work packages UI
    dashboard/      Portfolio + drilldown views
    commandcenter/  CommandCenter (action feed, today/week, drawer)
    shared/         Cross-feature primitives (ErrorBoundary, etc.)
    design-system/  Atomic UI primitives (CommandBar, KpiTile, etc.)
  config/           routes.js + moduleRegistry.js (nav)
  hooks/            useDrawings, useSubmittals, useFeatureFlag,
                    useProjectRole, useDrawingViewerState, etc.
  lib/              drawingHub/ (entity-style CRUD wrappers per submodule),
                    submittalStageMapping.js, exports/, etc.
  pages/            Top-level page components, mostly thin orchestrators
  services/         Cross-cutting service helpers — validation,
                    cacheRegistry, scheduleCascade, workflowEngine,
                    permissions
  styles/           tokens.css + global.css
  types/            Generated supabase types + a few hand-written types
  utils/            Pure helpers (batchProcess, formatters, etc.)

supabase/
  migrations/       NNN_name.sql, applied in order
  functions/        Edge function source

public/             Static assets including web-ifc wasm (public/wasm/) + pdf workers
```

---

## Decision log (recent material decisions)

### 2026-06 — Multi-tenant SaaS (monetization)

The product was turned into a sellable multi-tenant SaaS. We added an
org/workspace tenancy layer (`organizations` + members + invites), Stripe
subscription billing with a tamper-proof `org.plan` anchor + server-side limit
enforcement, self-serve signup + a first-run onboarding wizard, per-tenant data
export, and — critically — wired the **org boundary into the RLS layer** so
tenants are isolated at the database, not just behind feature gates.
`user_projects` stays authoritative for project-level role; org membership is the
gate beneath it. See the Multi-tenancy & billing section.

### 2026-06 — Self-hosted IFC viewer (dropped @thatopen)

The `@thatopen/components` IFC/BIM stack was removed (it bloated the bundle by
~7 MB across chunks). The Detailing Control Center's 3D tab now uses a
self-hosted `web-ifc` (wasm) + `three.js` viewer, lazy-loaded behind the
`viewer_3d` flag, with the wasm version-pinned + copied to `public/wasm/` by a
Vite plugin. Fab status is colored per piece from `model_elements`.

### 2026-06 — AI Revision Intelligence (the differentiator)

Per-sheet AI semantic diff of drawing revisions (`revisionSnapshotDiff.js` →
`llm-proxy` `revision-compare` → `drawing_revision_deltas`), a package-level
Revision Impact Report, and one-click Create-RFI-from-delta. Behind the
`revision_ai_diff` flag.

### 2026-05 — Submittals as workflow source of truth (Sprint 2)

We split workflow concerns from document concerns. Drawings are now
purely document artifacts; submittals own status / ball-in-court /
rounds. UI rollups read from submittals via
`submittalPipelineRollupFromSubmittals` and `derivedSetStage`.
Document-side fields like `drawings.stage` and
`drawing_sets.set_approval_status` are deprecated but preserved for
back-compat. Migration 074 created 51 LEGACY-* submittals from the
existing `set_approval_status` data so the new code path has full
coverage.

### 2026-05 — DB-enforced RBAC (RBAC Phase B)

Roles moved from localStorage-only to `user_projects.role` with DB-side
SECURITY DEFINER helpers and RLS on sensitive ops (lock/unlock,
signoff void, set delete, lock-bypass writes). LocalStorage roles
remain only as a legacy fallback for pre-auth screens. See the auth
section above for details.

### 2026-05 — Stage workflow correction (Migration 077)

The 7-stage flow was originally modeled with the wrong terminology
(OFS = Out For Shop, FFF = Final For Fab). Migration 077 corrected
this to: Not Started → IFA → OFA → BFA → OFS (Out For Scrub) → IFC →
Released for Fab. BFS and FFF were dropped from the schema; 3 legacy
FFF rows were backfilled to IFC.

### 2026-05 — Skip Tailwind migration

The user's enterprise-readiness roadmap suggested converting inline
styles to Tailwind. We pushed back: the existing token-based system
(CSS custom properties + design-system primitives) is internally
consistent, and a full Tailwind migration is months of churn for no
runtime benefit. Use Tailwind for new components if desired but
DON'T do a wholesale migration.

### 2026-05 — No LaunchDarkly

Considered for feature flags. Rejected: $$$, designed for multi-tenant
SaaS with non-engineers managing rollouts. Built a homegrown
`feature_flags` Supabase table instead — admin UI at
`/FeatureFlagsAdmin`, ~30 min to build, zero ongoing cost. See
`src/hooks/useFeatureFlag.ts`.

### 2026-04 — Supabase Auth (not Clerk/Auth0)

Stayed on Supabase Auth. The user explicitly chose this over a
hosted auth provider. SSO/SAML is achievable via Supabase's auth
providers when needed; not yet wired.

### 2026-04 — No offline support (later partially reversed)

Originally rejected; responsive web was the mobile strategy. **Update
(2026-06):** Field Today gained an offline outbox for field *capture* —
idempotent progress writes plus dedup-safe punch/photo creates (localStorage +
IndexedDB, `client_op_id` keys) — so flaky-connection field work isn't lost. A
full PWA / service-worker cold-start cache is still out of scope.

---

## What's still open

See [`TECH_DEBT.md`](./TECH_DEBT.md) for the running list and
[`CLAUDE.md`](./CLAUDE.md) for agent-driven development conventions.

Major remaining buckets:

- **TypeScript expansion** — still ~86% JS; convert incrementally (services/ is
  fully typed; shared-infra-first ordering).
- **Legal** — ToS / privacy / DPA pages to back the self-serve signup.
- **Storage backfill** — migrate the ~770 legacy flat `uploads/...` objects to
  org-prefixed paths (grandfathered for now).
- **Full-browser E2E** — jsdom integration tests exist; no signed-in Playwright
  flow yet (no self-signup test user).
- A11y audit pass; mobile/iPad polish on core workflows.
- Large-project performance (virtualization, server-side filtering).
