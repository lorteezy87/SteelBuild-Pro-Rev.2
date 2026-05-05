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
                  │  Anthropic Claude API  │
                  │  (LLM via edge fn)     │
                  └────────────────────────┘

         Hosting: Vercel auto-deploys from codex/base44-deploy-nick
```

There is no separate backend service. The app is a SPA that talks
directly to Supabase with the publishable anon key, with security
enforced by Postgres Row-Level Security and Edge Functions for
operations that need server-side compute (LLM calls, scheduled jobs).

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

`supabase/migrations/NNN_name.sql`. Numbered sequentially. Apply via
the Supabase dashboard SQL editor or the Supabase MCP. After a
migration that adds columns, the code calls
`NOTIFY pgrst, 'reload schema'` so PostgREST picks up the change.

### Edge Functions

`supabase/functions/`:
- `llm-proxy` — server-side Anthropic Claude calls. The browser never
  sees the API key.
- `schedule-assistant` — schedule-related LLM tasks

### Storage

Supabase Storage `uploads/` bucket holds drawing PDFs, photos, IFC
files, etc. URL lifecycle is signed-URL based (short-lived); the app
re-resolves on use. Client-side cap: 32 MB per upload.

---

## Background jobs

### AI extraction reconciler

`reconcile_stuck_extractions()` Postgres function flips drawings stuck
in `ai_extraction_status='Extracting'` for >5 min back to `'Failed'`.
Currently NOT scheduled (pg_cron extension is available on Supabase
but not installed on this project) — see TECH_DEBT.md for the wiring
options (install pg_cron OR run from a scheduled edge function).

### Trigger functions

- `enforce_drawing_set_unlock_role` — BEFORE UPDATE on `drawing_sets`,
  raises 42501 if non-admin tries to flip `is_locked` true → false
- `update_updated_at` — generic timestamp trigger, used on most
  entity tables

---

## CI/CD

### Continuous integration

`.github/workflows/ci.yml` runs on every push to feature/main/deploy
branches and every PR:

1. ESLint (errors block, warnings allowed)
2. TypeScript (currently non-blocking — types stale, see TECH_DEBT.md)
3. Vitest (488+ tests)
4. Production Vite build

Concurrency group cancels redundant runs on rapid iteration.

### Deployment

Vercel auto-deploys from `codex/base44-deploy-nick`. Workflow:

1. Develop on a `claude/<slug>` feature branch
2. Push commits + PR if collaborating
3. Merge into `codex/base44-deploy-nick` (Vercel builds + deploys)
4. Verify on the live URL

`CLAUDE.md` documents the auto-deploy command sequence used by
agent-driven development.

---

## Testing

### Unit / integration

Vitest. 488+ tests across pure helpers (`drawingHub`, `submittalStageMapping`,
`projectMetrics`, `submittalAnalytics`, `pdfSheetExtractor`, etc.) and
some hook-level tests via mocked supabase calls.

```
npm test               # one-shot run
npm run test:watch     # watch mode
```

### What's not tested yet

- Component rendering (no React Testing Library setup yet)
- E2E flows (no Playwright / Cypress)
- Visual regression

Priorities for the next test sprint: RTL component tests for
Layout, Drawings, Submittals, DrawingViewer, ModelViewer.

---

## Performance posture

### What's done

- Every route is `React.lazy` → small initial bundle
- TanStack Query caches with sensible staleTimes (60s on dashboards,
  30s on list views)
- ThumbnailFilmstrip caches pdfjs documents by storage path so
  multi-sheet PDFs parse once, not once per sheet
- IFC tile streaming via @thatopen/components keeps memory bounded for
  large models
- Refetch-on-window-focus disabled for ModelViewer's workPackages
  query (was thrashing the color-update effect)

### What's not done

- No Lighthouse CI / performance budgets in the build
- No bundle-size budgets
- No Sentry or PostHog instrumentation
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

public/             Static assets including thatopen/fragments-worker.mjs
```

---

## Decision log (recent material decisions)

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

### 2026-04 — No offline support

Considered for field users. Rejected per user direction. Responsive
web on mobile/tablet is the mobile strategy.

---

## What's still open

See [`TECH_DEBT.md`](./TECH_DEBT.md) for the running list and
[`CLAUDE.md`](./CLAUDE.md) for agent-driven development conventions.

Major remaining buckets:

- RBAC Phase C — per-project member-management admin UI
- Sentry / PostHog instrumentation
- TypeScript expansion across pages
- A11y audit pass
- RTL component tests
- Mobile responsive (Sprint 5)
- Email notifications (Sprint 3, blocked on email-provider pick)
