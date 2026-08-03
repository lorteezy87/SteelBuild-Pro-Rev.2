# SteelBuild Planner Operational Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable structural-steel readiness controls to the separate Planner PWA so project teams can see and update what is blocking drawings, changes, RFIs, fabrication, delivery, and field execution.

**Architecture:** Keep authoritative workflow status in each existing SteelBuild source table and project the records into a shared Planner readiness model. Store only the six execution checks that do not already have an authoritative source in `schedule_task_readiness`. Route every permitted write through Supabase RLS, validate linked project/source identity, and append immutable audit events.

**Tech Stack:** React 18, TypeScript, Vite 6, TanStack Query 5, Supabase JS 2, PostgreSQL/RLS, Vitest 4, Testing Library, Playwright.

## Global Constraints

- Execute after the Core Control System plan in the same isolated `codex/steelbuild-planner-pwa` worktree.
- Do not change authoritative RFI, submittal, drawing, change-order, fabrication, delivery, or field status semantics.
- Planner readiness pages may update only fields explicitly allowed by their source adapter.
- Never infer approval, release, compliance, or contractual status from notes or AI output.
- Every readiness item must retain its project, source table, source ID, current revision/status, owner when available, due/required date, blocker reason, and deep link.
- Use explicit `not_started`, `blocked`, `at_risk`, `ready`, and `not_applicable` display states. Adapters must map source states deterministically.
- Planner write access uses the existing project membership/RLS rules with a minimum `field` role; approval/release transitions retain any stricter source-table rule.
- Offline mode is read-only for source-system readiness. Only the six schedule-task readiness checks may queue offline, and conflicts fail visibly.
- No deletes. Schedule readiness rows use soft archive only when the parent task is archived.
- Use the approved navy-shell, light-canvas, dense-register visual language across all pages.
- Do not commit, push, deploy, or apply remote migrations without explicit user authorization.

---

## File structure

```text
planner/src/
├── components/readiness/
│   ├── ReadinessRegister.tsx
│   ├── ReadinessSummary.tsx
│   ├── ReadinessStateBadge.tsx
│   ├── ReadinessDetailDrawer.tsx
│   └── ExecutionChecklist.tsx
├── data/
│   ├── readinessRepository.ts
│   ├── sourceReadinessAdapters.ts
│   └── meetingRepository.ts
├── domain/
│   ├── readiness.ts
│   └── readinessSourcePolicy.ts
├── pages/
│   ├── DrawingSubmittalReadinessPage.tsx
│   ├── ChangeOrderReadinessPage.tsx
│   ├── RfiReadinessPage.tsx
│   ├── FabricationReadinessPage.tsx
│   ├── DeliveryReadinessPage.tsx
│   ├── FieldReadinessPage.tsx
│   ├── MeetingsPage.tsx
│   ├── ProjectsPage.tsx
│   ├── ReportsPage.tsx
│   └── SettingsPage.tsx
└── __tests__/
    ├── readiness.test.ts
    ├── sourceReadinessAdapters.test.ts
    ├── readinessRepository.test.ts
    └── readinessPages.test.tsx
supabase/
├── migrations/20260802091000_schedule_task_readiness.sql
└── migrations/__tests__/scheduleTaskReadiness.test.js
e2e/planner/readiness.spec.ts
```

---

### Task 1: Add the schedule execution-readiness contract

**Files:**
- Create: `supabase/migrations/20260802091000_schedule_task_readiness.sql`
- Create: `supabase/migrations/__tests__/scheduleTaskReadiness.test.js`
- Modify: `src/types/supabase.ts`

- [ ] **Write a failing static migration contract test**

```js
it('protects schedule readiness by project membership and immutable identity', () => {
  const sql = readMigration('20260802091000_schedule_task_readiness.sql')
  expect(sql).toMatch(/create table[^;]+schedule_task_readiness/is)
  expect(sql).toContain("user_has_project_role_at_least(project_id, 'field')")
  expect(sql).toMatch(/unique\s*\(schedule_task_id\)/i)
  expect(sql).toMatch(/check\s*\(readiness_state in \('not_started','blocked','at_risk','ready','not_applicable'\)\)/i)
})
```

- [ ] **Run it and verify it fails because the migration is absent**

Run: `npx vitest run supabase/migrations/__tests__/scheduleTaskReadiness.test.js`

- [ ] **Create the table, indexes, timestamps, and RLS policies**

```sql
create table public.schedule_task_readiness (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  schedule_task_id uuid not null references public.schedule_tasks(id) on delete cascade,
  readiness_state text not null default 'not_started'
    check (readiness_state in ('not_started','blocked','at_risk','ready','not_applicable')),
  materials_ready boolean not null default false,
  drawings_ready boolean not null default false,
  access_ready boolean not null default false,
  crew_ready boolean not null default false,
  tools_ready boolean not null default false,
  prior_work_ready boolean not null default false,
  blocker_reason text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_task_id)
);
```

The migration must add a trigger that rejects a `project_id` different from the linked `schedule_tasks.project_id`, apply the repository's timestamp trigger pattern, enable RLS, permit project-member reads, and restrict insert/update to `user_has_project_role_at_least(project_id, 'field')`. Add a planner audit event for every changed check/state without copying sensitive free text into event metadata.

- [ ] **Update the generated database contract using the repository's established type-generation shape**

Add `schedule_task_readiness` row/insert/update/relationship types and do not hand-wave fields as `any`.

- [ ] **Run the focused migration tests**

Run: `npx vitest run supabase/migrations/__tests__/scheduleTaskReadiness.test.js supabase/migrations/__tests__/plannerActionControl.test.js`

---

### Task 2: Build deterministic readiness projections and source policies

**Files:**
- Create: `planner/src/domain/readiness.ts`
- Create: `planner/src/domain/readinessSourcePolicy.ts`
- Create: `planner/src/data/sourceReadinessAdapters.ts`
- Create: `planner/src/__tests__/readiness.test.ts`
- Create: `planner/src/__tests__/sourceReadinessAdapters.test.ts`

- [ ] **Write failing tests for source mapping and precedence**

```ts
it('keeps a released drawing blocked when a later required revision is outstanding', () => {
  expect(mapDrawingReadiness({
    currentRevision: 'C',
    requiredRevision: 'D',
    approvalStatus: 'approved',
    releaseStatus: 'released',
  }).state).toBe('blocked')
})

it('never maps an unapproved change order to ready', () => {
  expect(mapChangeOrderReadiness({ status: 'pending', impactDate: '2026-08-05' }).state)
    .not.toBe('ready')
})
```

- [ ] **Run the tests and verify missing adapters fail**

Run: `npx vitest run planner/src/__tests__/readiness.test.ts planner/src/__tests__/sourceReadinessAdapters.test.ts`

- [ ] **Define the normalized read model**

```ts
export type ReadinessState = 'not_started' | 'blocked' | 'at_risk' | 'ready' | 'not_applicable'

export interface ReadinessItem {
  id: string
  projectId: string
  sourceKind: 'drawing' | 'submittal' | 'change_order' | 'rfi' | 'fabrication' | 'delivery' | 'field'
  sourceId: string
  title: string
  state: ReadinessState
  sourceStatus: string
  revision: string | null
  ownerName: string | null
  requiredDate: string | null
  blockerReason: string | null
  deepLink: string
  updatedAt: string
}
```

- [ ] **Implement source-specific allowlists and pure adapters**

The policy module must enumerate readable tables and writable fields. The exact initial writable surface is:

```ts
export const readinessWritePolicy = {
  drawing: [],
  submittal: [],
  change_order: [],
  rfi: ['assigned_to', 'due_date'],
  fabrication: ['assigned_to'],
  delivery: ['assigned_to'],
  field: ['assigned_to'],
} as const
```

Status/release/approval fields remain source-workflow-only. Adapters use authoritative status, revision, dates, and explicit blockers; they do not parse notes to invent state.

- [ ] **Cover all readiness domains with fixtures based on actual repository table fields**

If the current schema uses different table or column names, update adapters and tests to match repository evidence and record the mapping in `docs/runbooks/planner-pwa.md`.

- [ ] **Run the focused tests**

Run: `npx vitest run planner/src/__tests__/readiness.test.ts planner/src/__tests__/sourceReadinessAdapters.test.ts`

---

### Task 3: Add the readiness repository and conflict-safe execution checklist

**Files:**
- Create: `planner/src/data/readinessRepository.ts`
- Create: `planner/src/__tests__/readinessRepository.test.ts`
- Modify: `planner/src/offline/plannerOutbox.ts`
- Modify: `planner/src/offline/plannerSnapshots.ts`

- [ ] **Write failing repository tests**

```ts
it('rejects a schedule checklist update when updated_at is stale', async () => {
  mockSingleResult(null)
  await expect(updateExecutionReadiness(client, {
    id: 'ready-1',
    expectedUpdatedAt: '2026-08-02T12:00:00Z',
    patch: { materials_ready: true },
  })).rejects.toMatchObject({ code: 'PLANNER_CONFLICT' })
})

it('does not expose approval fields through source updates', () => {
  expect(() => sanitizeReadinessPatch('rfi', { status: 'closed' } as never)).toThrow()
})
```

- [ ] **Run them and verify the repository is missing**

Run: `npx vitest run planner/src/__tests__/readinessRepository.test.ts`

- [ ] **Implement project-scoped reads and fail-closed mutations**

Use `.eq('project_id', projectId)` on all reads even though RLS remains authoritative. Update checks with both `.eq('id', id)` and `.eq('updated_at', expectedUpdatedAt)`, request the returned row, and throw `PLANNER_CONFLICT` when no row is returned.

- [ ] **Limit offline writes to checklist patches**

Queue only boolean check changes plus expected `updated_at`. Do not queue blocker text, source-record mutations, owner changes, approvals, releases, dates, or state changes. Scope snapshots and outbox entries by both authenticated user ID and organization ID; purge on sign-out or organization switch.

- [ ] **Run focused tests**

Run: `npx vitest run planner/src/__tests__/readinessRepository.test.ts planner/src/__tests__/plannerOutbox.test.ts`

---

### Task 4: Build the six operational readiness pages and detail workflow

**Files:**
- Create: `planner/src/components/readiness/ReadinessRegister.tsx`
- Create: `planner/src/components/readiness/ReadinessSummary.tsx`
- Create: `planner/src/components/readiness/ReadinessStateBadge.tsx`
- Create: `planner/src/components/readiness/ReadinessDetailDrawer.tsx`
- Create: `planner/src/components/readiness/ExecutionChecklist.tsx`
- Create: `planner/src/pages/DrawingSubmittalReadinessPage.tsx`
- Create: `planner/src/pages/ChangeOrderReadinessPage.tsx`
- Create: `planner/src/pages/RfiReadinessPage.tsx`
- Create: `planner/src/pages/FabricationReadinessPage.tsx`
- Create: `planner/src/pages/DeliveryReadinessPage.tsx`
- Create: `planner/src/pages/FieldReadinessPage.tsx`
- Create: `planner/src/__tests__/readinessPages.test.tsx`
- Modify: `planner/src/app/PlannerRoutes.tsx`
- Modify: `planner/src/components/shell/plannerNav.ts`
- Modify: `planner/src/styles/planner.css`

- [ ] **Write a failing page contract test**

```tsx
it.each([
  ['/readiness/drawings', 'Drawing / Submittal Readiness'],
  ['/readiness/change-orders', 'Change Order Readiness'],
  ['/readiness/rfis', 'RFI Readiness'],
  ['/readiness/fabrication', 'Fabrication Readiness'],
  ['/readiness/delivery', 'Delivery Readiness'],
  ['/readiness/field', 'Field Readiness'],
])('renders the project-scoped readiness register at %s', async (path, title) => {
  renderPlannerAt(path)
  expect(await screen.findByRole('heading', { name: title })).toBeVisible()
  expect(screen.getByRole('table')).toHaveAttribute('aria-label', title)
})
```

- [ ] **Run it and verify the routes are absent**

Run: `npx vitest run planner/src/__tests__/readinessPages.test.tsx`

- [ ] **Implement the shared dense register**

Columns: state, project, source number, subject, revision/status, owner, required date, blocker, updated, and open-source action. Preserve a sticky header, keyboard focus, text labels in badges, horizontal scrolling under 1180px, and URL-backed search/project/state filters.

- [ ] **Implement the detail drawer**

The drawer shows source context, revision/status, dates, ownership, blockers, audit history, and an explicit `Open in SteelBuild Pro` deep link. Display only policy-allowed edits. For field execution rows, show the six-check checklist with verifier and timestamp. Require confirmation for date/owner changes and show conflicts without silently overwriting.

- [ ] **Implement readiness summaries without hiding exceptions**

Each page displays counts for blocked, at risk, ready, not started, and not applicable. Default sort places blocked first, then at risk, earliest required date, project number, and source number.

- [ ] **Run component and accessibility tests**

Run: `npx vitest run planner/src/__tests__/readinessPages.test.tsx`

---

### Task 5: Finish management pages, reports, and end-to-end readiness validation

**Files:**
- Create: `planner/src/data/meetingRepository.ts`
- Create: `planner/src/pages/MeetingsPage.tsx`
- Create: `planner/src/pages/ProjectsPage.tsx`
- Create: `planner/src/pages/ReportsPage.tsx`
- Create: `planner/src/pages/SettingsPage.tsx`
- Create: `e2e/planner/readiness.spec.ts`
- Modify: `planner/src/app/PlannerRoutes.tsx`
- Modify: `planner/src/components/shell/plannerNav.ts`
- Modify: `docs/runbooks/planner-pwa.md`

- [ ] **Write failing route and E2E scenarios**

Cover meetings, accessible projects, readiness CSV export, settings/about data, blocked-first filtering, source deep links, six-check updates, offline read-only source behavior, queued checklist replay, and a stale-write conflict.

```ts
test('field readiness records an explicit checklist verification', async ({ page }) => {
  await page.goto('/readiness/field')
  await page.getByRole('row', { name: /erect sequence 2/i }).click()
  await page.getByLabel('Materials ready').check()
  await page.getByRole('button', { name: 'Save readiness' }).click()
  await expect(page.getByText(/verified by/i)).toBeVisible()
})
```

- [ ] **Implement management pages using existing project and meeting access**

Projects lists only RLS-visible projects and links into filtered Planner views. Meetings shows meeting-linked action items and their unresolved follow-ups; it does not duplicate meeting-minutes editing. Reports exports the current authorized readiness result set to CSV with applied filters and generation timestamp. Settings shows install/offline information, version, organization, and data-retention behavior; it contains no security bypass or hidden administrative controls.

- [ ] **Document authoritative-source mappings and operational limits**

The runbook must name the repository-confirmed table/column mappings, read/write allowlists, migration order, independent build command, PWA origin, offline behavior, conflict recovery, rollback, and the fact that no remote migration/deployment was performed during local implementation.

- [ ] **Run all Planner unit tests and production build**

Run:

```powershell
npm run test:planner
npm run build:planner
```

- [ ] **Run the browser/PWA checks**

Run the Planner preview, execute `e2e/planner/readiness.spec.ts`, verify the manifest and service worker on the Planner origin, test desktop and 390px layouts, test keyboard navigation, and compare screenshots against the accepted dense command-layout reference.

- [ ] **Run repository-level validation**

Run the available lint/typecheck/build gates documented in `package.json`. Record exact pass/fail results and any unrelated pre-existing failures. Do not create a commit, push, deployment, or remote migration.

---

## Done criteria

- All six readiness domains derive deterministic state from repository-confirmed authoritative records.
- The schedule execution checklist is project-consistent, RLS-protected, conflict-safe, and audited.
- Approval/release/status authority remains in the source SteelBuild workflow.
- Blockers, owners, required dates, revisions, source context, and deep links are visible in dense, accessible registers.
- Offline behavior does not widen the write surface or silently overwrite conflicts.
- Meetings, Projects, Reports, and Settings are complete enough that every approved navigation item has a real route.
- Unit, migration, browser, accessibility, and PWA validation results are recorded honestly.
- No commit, push, deployment, or remote migration is performed without explicit authorization.
