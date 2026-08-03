# SteelBuild Planner Core Control System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the separate SteelBuild Planner PWA shell and its authenticated cross-project action, schedule, gate, calendar, archive, export, audit, and offline-safe core workflows.

**Architecture:** Add a second Vite application under `planner/` with a separate `dist-planner/` build, manifest, and service worker. Reuse SteelBuild Pro's Supabase client, authentication provider, organization/project contexts, generated database types, RLS, and deterministic helpers while keeping Planner routing and UI independent.

**Tech Stack:** React 18, TypeScript, Vite 6, React Router 6, TanStack Query 5, Supabase JS 2, Vitest 4, Testing Library, CSS modules/tokens, IndexedDB, service workers.

## Global Constraints

- Canonical implementation repository: `C:\dev\SteelBuild-Pro-Rev.2`.
- Implement in a dedicated `codex/steelbuild-planner-pwa` branch/worktree based on current `origin/main`; do not modify the dirty primary checkout.
- Claim Planner files in `AGENT_CLAIMS.md` before code edits, following the repository protocol.
- Do not create commits, push, deploy, or apply remote migrations without explicit user authorization.
- The Planner uses the existing Supabase auth, MFA, organization membership, project access, and RLS boundary.
- The browser receives only the Supabase URL and anon key; never add service-role credentials.
- Use `user_has_project_role_at_least(project_id, 'field')` for Planner write floors.
- No delete workflow exists in the Planner; records are archived.
- New records, date changes, ownership changes, bulk completion, archive, and source-link changes require an online connection.
- Critical date updates use expected-`updated_at` matching and reject stale writes.
- The approved reference is desktop-first, register-dense, light-canvas command UI with dark navy top/sidebar chrome.
- Mobile preserves table semantics through horizontal scrolling and sticky context; do not replace registers with unrelated card grids.
- Keep functions/components focused and use `@/` for shared SteelBuild imports and `@planner/` for Planner-local imports.
- Run targeted tests after every task and the complete repository gates before handoff.

---

## File structure

```text
planner/
├── index.html                         # Planner HTML entry and metadata
├── tsconfig.json                      # Planner TypeScript boundary
├── vite.config.ts                     # Independent build and aliases
├── public/
│   ├── manifest.webmanifest           # Separate install identity
│   ├── planner-icon.svg               # App icon
│   ├── planner-icon-maskable.svg      # Maskable icon
│   └── sw.js                          # Static shell caching only
└── src/
    ├── main.tsx                       # React entry
    ├── app/PlannerApp.tsx             # Provider/auth composition
    ├── app/PlannerRoutes.tsx          # Planner route table
    ├── app/PlannerAuthGate.tsx        # Existing auth + org boundary adapter
    ├── components/shell/PlannerShell.tsx
    ├── components/shell/plannerNav.ts
    ├── components/register/RegisterToolbar.tsx
    ├── components/register/ActionRegister.tsx
    ├── components/register/registerColumns.ts
    ├── components/feedback/ConnectivityBanner.tsx
    ├── domain/plannerActions.ts        # Pure gate/filter/sort logic
    ├── domain/plannerCalendar.ts       # Action/task event mapping
    ├── data/actionRepository.ts        # Action CRUD/concurrency/bulk operations
    ├── data/scheduleRepository.ts      # Narrow schedule create/update reads
    ├── data/auditRepository.ts         # Immutable event reads
    ├── data/plannerTypes.ts            # Migration-aware Planner types
    ├── offline/plannerSnapshots.ts     # User/org IndexedDB snapshots
    ├── offline/plannerOutbox.ts        # Narrow permitted offline operations
    ├── pages/CommandCenterPage.tsx
    ├── pages/MyDayPage.tsx
    ├── pages/CalendarPage.tsx
    ├── pages/TaskRegisterPage.tsx
    ├── pages/WaitingOnPage.tsx
    ├── pages/Gate48HourPage.tsx
    ├── pages/Lookahead10DayPage.tsx
    ├── pages/MilestonesPage.tsx
    ├── pages/ArchivePage.tsx
    └── styles/planner.css
supabase/
├── migrations/20260802090000_planner_action_control.sql
└── migrations/__tests__/plannerActionControl.test.js
src/types/supabase.ts                    # Regenerated/updated DB contract
package.json                             # Planner scripts
vercel.planner.json                      # Separate deployment configuration
docs/runbooks/planner-pwa.md             # Build/deploy/rollback instructions
```

---

### Task 1: Scaffold the independent Planner build and install identity

**Files:**
- Create: `planner/index.html`
- Create: `planner/tsconfig.json`
- Create: `planner/vite.config.ts`
- Create: `planner/src/main.tsx`
- Create: `planner/src/app/PlannerApp.tsx`
- Create: `planner/src/styles/planner.css`
- Create: `planner/public/manifest.webmanifest`
- Create: `planner/public/planner-icon.svg`
- Create: `planner/public/planner-icon-maskable.svg`
- Modify: `package.json`
- Test: `planner/src/app/__tests__/PlannerApp.test.tsx`

**Interfaces:**
- Consumes: shared `@/lib/supabase`, `@/lib/query-client`, and React dependencies from the root package.
- Produces: `PlannerApp`, `npm run dev:planner`, `npm run build:planner`, `npm run typecheck:planner`, and `npm run test:planner`.

- [ ] **Step 1: Add a failing boot test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PlannerApp from "../PlannerApp";

describe("PlannerApp", () => {
  it("renders the SteelBuild Planner identity", () => {
    render(<PlannerApp />);
    expect(screen.getByText("STEELBUILD-PLANNER")).toBeInTheDocument();
    expect(screen.getByText("Construction Action & Lookahead Control")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the boot test and verify it fails because the Planner app does not exist**

Run: `npx vitest run planner/src/app/__tests__/PlannerApp.test.tsx`
Expected: FAIL resolving `../PlannerApp`.

- [ ] **Step 3: Add the Vite/TypeScript boundary**

```ts
// planner/vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const plannerRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: plannerRoot,
  publicDir: path.resolve(plannerRoot, "public"),
  resolve: {
    alias: {
      "@planner": path.resolve(plannerRoot, "src"),
      "@": path.resolve(plannerRoot, "../src"),
    },
  },
  plugins: [react()],
  build: { outDir: path.resolve(plannerRoot, "../dist-planner"), emptyOutDir: true },
});
```

```json
// package.json scripts additions
{
  "dev:planner": "vite --config planner/vite.config.ts",
  "build:planner": "vite build --config planner/vite.config.ts",
  "typecheck:planner": "tsc -p planner/tsconfig.json",
  "test:planner": "vitest run planner/src"
}
```

- [ ] **Step 4: Implement the minimal app entry and approved identity**

```tsx
// planner/src/app/PlannerApp.tsx
export default function PlannerApp() {
  return (
    <div className="planner-app">
      <header className="planner-brand">
        <strong>STEELBUILD-PLANNER</strong>
        <span>Construction Action &amp; Lookahead Control</span>
      </header>
    </div>
  );
}
```

- [ ] **Step 5: Add the dedicated manifest and HTML metadata**

```json
{
  "id": "/",
  "name": "SteelBuild Planner",
  "short_name": "SB Planner",
  "description": "Construction Action & Lookahead Control",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#eef3f7",
  "theme_color": "#0b1721",
  "categories": ["business", "productivity", "construction"],
  "icons": [
    { "src": "/planner-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "/planner-icon-maskable.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 6: Run focused checks**

Run: `npm run test:planner -- --run planner/src/app/__tests__/PlannerApp.test.tsx`
Expected: PASS.
Run: `npm run typecheck:planner`
Expected: PASS.
Run: `npm run build:planner`
Expected: `dist-planner/index.html` and hashed assets created.

- [ ] **Step 7: Record the validation results without committing**

Do not stage or commit. Add the exact commands/results to the working handoff notes.

---

### Task 2: Add the action-control schema, immutable audit trail, and RLS

**Files:**
- Create: `supabase/migrations/20260802090000_planner_action_control.sql`
- Create: `supabase/migrations/__tests__/plannerActionControl.test.js`
- Modify: `src/types/supabase.ts`

**Interfaces:**
- Consumes: existing `action_items`, `schedule_tasks`, `user_profiles`, `projects`, `user_has_project_access`, and `user_has_project_role_at_least`.
- Produces: Planner operational columns, `planner_action_events`, audit triggers, archive semantics, and typed rows.

- [ ] **Step 1: Write the failing migration contract test**

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../20260802090000_planner_action_control.sql", import.meta.url),
  "utf8",
);

describe("planner action control migration", () => {
  it("adds explicit control fields and immutable audit events", () => {
    for (const column of ["workstream", "action_date", "follow_up_date", "impact_date", "waiting_on", "assigned_user_id", "source_entity_type", "source_entity_id", "completed_at", "archived_at"]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}`, "i"));
    }
    expect(sql).toMatch(/create table if not exists public\.planner_action_events/i);
    expect(sql).toMatch(/user_has_project_role_at_least[\s\S]*'field'/i);
    expect(sql).toMatch(/revoke[\s\S]+update[\s\S]+planner_action_events/i);
    expect(sql).toMatch(/revoke[\s\S]+delete[\s\S]+planner_action_events/i);
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails because the migration is absent**

Run: `npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js`
Expected: FAIL reading the migration.

- [ ] **Step 3: Implement the schema migration**

```sql
alter table public.action_items
  add column if not exists workstream text,
  add column if not exists action_date date,
  add column if not exists follow_up_date date,
  add column if not exists impact_date date,
  add column if not exists waiting_on text,
  add column if not exists assigned_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists source_entity_type text,
  add column if not exists source_entity_id uuid,
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.action_items
  add constraint action_items_source_entity_type_check
  check (source_entity_type is null or source_entity_type in (
    'rfi','submittal','drawing_set','change_order','work_package','delivery','schedule_task','meeting'
  ));

create table if not exists public.planner_action_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  before_state jsonb,
  after_state jsonb,
  actor_user_id uuid,
  occurred_at timestamptz not null default now()
);
```

Implement separate `after insert or update` triggers for `action_items` and `schedule_tasks`. Store only Planner-relevant fields in before/after payloads. Enable RLS; select uses `user_has_project_access(project_id)`. Trigger insertion runs through a narrowly scoped security-definer function with fixed `search_path = public, pg_temp`. Revoke client update/delete on `planner_action_events`.

- [ ] **Step 4: Add completion/archive invariants**

Use a trigger so terminal completion sets `completed_at` when absent, reopening clears it, and `archived_at` never implies deletion. Reject direct changes to audit rows.

- [ ] **Step 5: Update the generated TypeScript contract for the migration fields**

Update `action_items.Row`, `.Insert`, and `.Update`; add `planner_action_events` Row/Insert/Update and relationship metadata. Keep field nullability identical to SQL. Do not alter unrelated generated table types.

- [ ] **Step 6: Run focused checks**

Run: `npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS or report only pre-existing errors outside changed files.

- [ ] **Step 7: Record validation without applying the migration remotely or committing**

Do not run `supabase db push`, apply production changes, stage, or commit.

---

### Task 3: Implement deterministic gate, filter, sort, and calendar logic

**Files:**
- Create: `planner/src/data/plannerTypes.ts`
- Create: `planner/src/domain/plannerActions.ts`
- Create: `planner/src/domain/plannerCalendar.ts`
- Test: `planner/src/domain/__tests__/plannerActions.test.ts`
- Test: `planner/src/domain/__tests__/plannerCalendar.test.ts`

**Interfaces:**
- Produces: `PlannerAction`, `PlannerActionFilters`, `deriveGateRows`, `deriveMyDayRows`, `deriveWaitingOnRows`, `filterPlannerActions`, `sortPlannerActions`, and `buildPlannerCalendarEvents`.

- [ ] **Step 1: Write failing fixed-date gate tests**

```ts
import { describe, expect, it } from "vitest";
import { deriveGateRows } from "../plannerActions";

const base = { project_id: "p1", priority: "Medium", status: "Open", archived_at: null };

it("includes overdue and next-two-day actions in the 48-hour gate", () => {
  const rows = [
    { ...base, id: "overdue", due_date: "2026-08-01" },
    { ...base, id: "impact", due_date: null, impact_date: "2026-08-04" },
    { ...base, id: "later", due_date: "2026-08-05" },
  ];
  expect(deriveGateRows(rows, 2, "2026-08-02").map((row) => row.id)).toEqual(["overdue", "impact"]);
});

it("excludes terminal and archived actions", () => {
  const rows = [
    { ...base, id: "done", status: "Complete", due_date: "2026-08-02" },
    { ...base, id: "archived", archived_at: "2026-08-01T00:00:00Z", due_date: "2026-08-02" },
  ];
  expect(deriveGateRows(rows, 2, "2026-08-02")).toEqual([]);
});
```

- [ ] **Step 2: Run and verify failure because domain functions do not exist**

Run: `npx vitest run planner/src/domain/__tests__/plannerActions.test.ts`
Expected: FAIL resolving functions.

- [ ] **Step 3: Implement the exact gate boundary**

```ts
const TERMINAL = new Set(["Complete", "Cancelled", "Resolved", "Closed"]);

export function deriveGateRows(rows: PlannerAction[], horizonDays: number, todayIso: string): PlannerAction[] {
  const end = addCalendarDays(todayIso, horizonDays);
  return rows
    .filter((row) => !row.archived_at && !TERMINAL.has(row.status))
    .filter((row) => [row.due_date, row.follow_up_date, row.impact_date]
      .filter((value): value is string => Boolean(value))
      .some((value) => value <= end))
    .sort(comparePlannerActions);
}
```

Implement date-only helpers without `new Date("YYYY-MM-DD")` UTC drift. `deriveMyDayRows` selects current-user actions and assigned schedule tasks that are overdue, active, required, or followed up today. `deriveWaitingOnRows` requires non-empty `waiting_on` and sorts Required date then priority.

- [ ] **Step 4: Add filter/sort/search tests and implementation**

Test project, status, workstream, owner, waiting-on, priority, and free-text matching. Normalize text with `.trim().toLocaleLowerCase()` and never mutate input arrays.

- [ ] **Step 5: Add calendar mapping tests and implementation**

```ts
expect(buildPlannerCalendarEvents({ actions, scheduleTasks })).toContainEqual({
  id: "action:a1",
  kind: "action",
  title: "Release embeds",
  start: "2026-08-03",
  end: "2026-08-03",
  projectId: "p1",
  sourceId: "a1",
});
```

Actions use `action_date`, then `due_date`; schedule activities use start/end dates. Milestones are flagged explicitly.

- [ ] **Step 6: Run focused tests and Planner typecheck**

Run: `npx vitest run planner/src/domain/__tests__`
Expected: PASS.
Run: `npm run typecheck:planner`
Expected: PASS.

- [ ] **Step 7: Record validation without committing**

---

### Task 4: Reuse SteelBuild auth, MFA, organization, project, and query providers

**Files:**
- Create: `planner/src/app/PlannerAuthGate.tsx`
- Modify: `planner/src/app/PlannerApp.tsx`
- Create: `planner/src/app/__tests__/PlannerAuthGate.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth`, `OrgProvider`, `useOrg`, `ProjectProvider`, and `queryClientInstance` from the existing app.
- Produces: authenticated Planner children with the same identity and tenant boundary.

- [ ] **Step 1: Write failing auth-state tests**

Mock `useAuth` and `useOrg`. Assert loading renders `Loading SteelBuild Planner…`, auth-required renders the existing credential form adapter, MFA-required renders the existing MFA challenge, no-org renders an explicit SteelBuild onboarding link, and authorized state renders children.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run planner/src/app/__tests__/PlannerAuthGate.test.tsx`
Expected: FAIL resolving the gate.

- [ ] **Step 3: Implement provider composition**

```tsx
export default function PlannerApp() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <BrowserRouter>
        <AuthProvider>
          <PlannerAuthGate />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

Inside the authorized gate, mount `OrgProvider`, then `ProjectProvider`, then `PlannerRoutes`. Reuse the existing password and MFA operations rather than adding a second auth service.

- [ ] **Step 4: Add tenant-cache clearing verification**

Mock an identity change and assert the shared auth provider clears React Query plus keys prefixed `sbp:planner:`. Add Planner cleanup through a narrow exported callback rather than duplicating the auth listener.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run planner/src/app/__tests__/PlannerAuthGate.test.tsx`
Expected: PASS.
Run: `npm run typecheck:planner`
Expected: PASS.

- [ ] **Step 6: Record validation without committing**

---

### Task 5: Implement action/schedule repositories with concurrency and fail-closed bulk completion

**Files:**
- Create: `planner/src/data/actionRepository.ts`
- Create: `planner/src/data/scheduleRepository.ts`
- Create: `planner/src/data/auditRepository.ts`
- Test: `planner/src/data/__tests__/actionRepository.test.ts`
- Test: `planner/src/data/__tests__/scheduleRepository.test.ts`

**Interfaces:**
- Produces: `listPlannerActions`, `createPlannerAction`, `updatePlannerAction`, `completePlannerActions`, `archivePlannerAction`, `listPlannerAuditEvents`, `createScheduleActivity`, and `updateScheduleActivity`.

- [ ] **Step 1: Write failing concurrency tests**

Mock the Supabase chain and assert `updatePlannerAction(id, patch, expectedUpdatedAt)` applies both `.eq("id", id)` and `.eq("updated_at", expectedUpdatedAt)`, requests one returned row, and throws `PlannerConflictError` when no row matches.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run planner/src/data/__tests__/actionRepository.test.ts`
Expected: FAIL resolving repository functions.

- [ ] **Step 3: Implement repository result types**

```ts
export class PlannerConflictError extends Error {
  constructor(public readonly entityId: string) {
    super("This record changed after you opened it.");
    this.name = "PlannerConflictError";
  }
}

export type UpdatePlannerActionArgs = {
  id: string;
  expectedUpdatedAt: string;
  patch: PlannerActionUpdate;
};
```

Use the shared `supabase` client. Select only register/detail columns. Every cross-project query remains ordinary RLS-scoped Supabase access.

- [ ] **Step 4: Implement create/update/archive**

Validate source type allowlist, terminal status, and online-only fields before issuing writes. Archive writes `archived_at` and never calls delete.

- [ ] **Step 5: Write and implement fail-closed bulk completion**

Fetch the selected IDs first. Require exact cardinality and verify every row is authorized by the query result, non-terminal, non-archived, and has a non-empty title. If any row fails, return `{ ok:false, ineligible:[...] }` without issuing updates. Otherwise update each action with `status:"Complete"` and `completed_at` through bounded batch processing.

- [ ] **Step 6: Implement narrow schedule writes**

`createScheduleActivity` sends the existing required schedule fields and project ID. `updateScheduleActivity` accepts only name, start/end, phase, crew/resource, notes, status, and progress; it performs expected-`updated_at` matching. Parent/dependency changes remain outside the Planner repository.

- [ ] **Step 7: Run repository tests and typecheck**

Run: `npx vitest run planner/src/data/__tests__`
Expected: PASS.
Run: `npm run typecheck:planner`
Expected: PASS.

- [ ] **Step 8: Record validation without committing**

---

### Task 6: Build the reference-aligned shell, shared toolbar, and action register

**Files:**
- Create: `planner/src/app/PlannerRoutes.tsx`
- Create: `planner/src/components/shell/plannerNav.ts`
- Create: `planner/src/components/shell/PlannerShell.tsx`
- Create: `planner/src/components/register/RegisterToolbar.tsx`
- Create: `planner/src/components/register/ActionRegister.tsx`
- Create: `planner/src/components/register/registerColumns.ts`
- Modify: `planner/src/styles/planner.css`
- Test: `planner/src/components/register/__tests__/ActionRegister.test.tsx`
- Test: `planner/src/components/shell/__tests__/PlannerShell.test.tsx`

**Interfaces:**
- Consumes: `PlannerAction`, filters, selection, and callbacks.
- Produces: canonical shell and reusable register used by all core pages.

- [ ] **Step 1: Write failing shell/navigation tests**

Assert every approved navigation label is present, the current route is marked `aria-current="page"`, and the brand/subtitle match the reference.

- [ ] **Step 2: Write failing register tests**

Render three actions. Assert sticky headers for Priority, Project, Action, Workstream, Action Date, Follow-Up, Required, Impact, Waiting On, Status; selection count; accessible row checkbox labels; critical/high/normal text; and disabled Complete Selected when an archived/terminal row is selected.

- [ ] **Step 3: Run and verify failures**

Run: `npx vitest run planner/src/components`
Expected: FAIL resolving new components.

- [ ] **Step 4: Implement navigation config and shell**

```ts
export const PLANNER_NAV_GROUPS = [
  { label: "Planner", items: ["Command Center", "My Day", "Calendar", "Task Register", "Waiting On"] },
  { label: "Lookaheads", items: ["48-Hour Gate", "10-Day Lookahead", "Milestones"] },
  { label: "Operations", items: ["Drawing / Submittal Readiness", "Change Order Readiness", "RFI Readiness", "Fabrication Readiness", "Delivery Readiness", "Field Readiness", "Meetings"] },
  { label: "Management", items: ["Projects", "Reports", "Archive", "Settings"] },
] as const;
```

- [ ] **Step 5: Implement the shared toolbar and register**

Use native semantic controls, stable column definitions, CSS `position: sticky`, and explicit action buttons. Preserve table markup at all breakpoints. Row tints derive from pure domain helpers and still render priority/status text.

- [ ] **Step 6: Implement the exact reference token system**

Define CSS variables for `--planner-navy:#0b1721`, `--planner-rail:#0d1b26`, `--planner-canvas:#eef3f7`, `--planner-link:#207798`, `--planner-warning:#e6a13d`, `--planner-risk-bg:#fff1f1`, and `--planner-watch-bg:#fff9e9`. Avoid main-app dark tokens inside the light command canvas.

- [ ] **Step 7: Run component tests at desktop and narrow container widths**

Run: `npx vitest run planner/src/components`
Expected: PASS.
Run: `npm run typecheck:planner`
Expected: PASS.

- [ ] **Step 8: Record validation without committing**

---

### Task 7: Implement Task Register creation/editing, history, archive, export, and bulk completion

**Files:**
- Create: `planner/src/features/actions/ActionEditorDrawer.tsx`
- Create: `planner/src/features/actions/NewTaskDialog.tsx`
- Create: `planner/src/features/actions/DateChangeConfirmation.tsx`
- Create: `planner/src/features/actions/ConflictResolutionPanel.tsx`
- Create: `planner/src/features/actions/exportActionsCsv.ts`
- Create: `planner/src/pages/TaskRegisterPage.tsx`
- Create: `planner/src/pages/ArchivePage.tsx`
- Test: `planner/src/features/actions/__tests__/NewTaskDialog.test.tsx`
- Test: `planner/src/features/actions/__tests__/ActionEditorDrawer.test.tsx`
- Test: `planner/src/pages/__tests__/TaskRegisterPage.test.tsx`

**Interfaces:**
- Consumes: repositories and shared register.
- Produces: working operational action/schedule activity workflows.

- [ ] **Step 1: Write failing New Task tests**

Assert record kind is required, Operational Action shows project/title/priority/status/workstream/action/follow-up/Required/impact/owner/waiting-on/source fields, Schedule Activity shows schedule fields, and submission is blocked while offline.

- [ ] **Step 2: Write failing date confirmation/conflict tests**

Change Required date from `2026-08-03` to `2026-08-05`; assert save does not call repository until confirmation displays both dates. Mock `PlannerConflictError`; assert server/current and proposed values render and date changes require a fresh confirmation.

- [ ] **Step 3: Run and verify failures**

Run: `npx vitest run planner/src/features/actions planner/src/pages/__tests__/TaskRegisterPage.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement form schemas and payload mapping**

Use explicit TypeScript validation functions; trim text; require project/title; enforce status/priority/source allowlists; validate date ordering for schedule activities; omit empty optional fields instead of sending empty strings where columns are nullable.

- [ ] **Step 5: Implement Task Register queries and mutations**

Use TanStack Query with keys `['planner-actions', orgId, filters]`. Keep user input on mutation errors. Invalidate only Planner action/audit/calendar keys after success.

- [ ] **Step 6: Implement history and archive**

History reads immutable `planner_action_events`. Archive requires confirmation, writes `archived_at`, and moves the row to Archive without deletion.

- [ ] **Step 7: Implement CSV export**

Export the authorized filtered rows in the stable reference column order. Escape commas, quotes, and newlines. Exclude internal metadata and audit payloads.

- [ ] **Step 8: Run focused tests**

Run: `npx vitest run planner/src/features/actions planner/src/pages/__tests__/TaskRegisterPage.test.tsx`
Expected: PASS.

- [ ] **Step 9: Record validation without committing**

---

### Task 8: Implement Command Center, My Day, Calendar, Waiting On, gates, and milestones

**Files:**
- Create: `planner/src/pages/CommandCenterPage.tsx`
- Create: `planner/src/pages/MyDayPage.tsx`
- Create: `planner/src/pages/CalendarPage.tsx`
- Create: `planner/src/pages/WaitingOnPage.tsx`
- Create: `planner/src/pages/Gate48HourPage.tsx`
- Create: `planner/src/pages/Lookahead10DayPage.tsx`
- Create: `planner/src/pages/MilestonesPage.tsx`
- Test: `planner/src/pages/__tests__/CoreQueues.test.tsx`

**Interfaces:**
- Consumes: shared action/schedule queries, pure derivation helpers, and canonical register.
- Produces: approved core navigation destinations with live data.

- [ ] **Step 1: Write failing queue-page tests**

Use fixed `todayIso="2026-08-02"`. Verify the 48-Hour page includes overdue through August 4, the 10-Day page through August 12, Waiting On requires a party, My Day selects the signed-in user, and Milestones only shows milestone schedule activities.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run planner/src/pages/__tests__/CoreQueues.test.tsx`
Expected: FAIL resolving pages.

- [ ] **Step 3: Implement gate pages with shared register**

48-Hour Gate renders the exact focus banner: `Gate focus: approvals, VIFs, releases, loads, site readiness, ownership and decisions needed within 48 hours.` Both gates expose consistent filters and record counts.

- [ ] **Step 4: Implement My Day, Waiting On, and Milestones**

Use pure derivation functions; do not create separate stored gate rows. Each page keeps row actions consistent with Task Register.

- [ ] **Step 5: Implement Calendar and Command Center**

Calendar combines action and schedule events without modifying source records. Command Center summarizes overdue, due today, next 48 hours, waiting on, milestones, and workstream/project counts and links each metric to its filtered register.

- [ ] **Step 6: Run page tests and typecheck**

Run: `npx vitest run planner/src/pages/__tests__/CoreQueues.test.tsx`
Expected: PASS.
Run: `npm run typecheck:planner`
Expected: PASS.

- [ ] **Step 7: Record validation without committing**

---

### Task 9: Add offline snapshots, narrow outbox, service worker, and connectivity UI

**Files:**
- Create: `planner/src/offline/plannerSnapshots.ts`
- Create: `planner/src/offline/plannerOutbox.ts`
- Create: `planner/src/offline/PlannerOfflineProvider.tsx`
- Create: `planner/src/components/feedback/ConnectivityBanner.tsx`
- Create: `planner/public/sw.js`
- Modify: `planner/src/main.tsx`
- Test: `planner/src/offline/__tests__/plannerSnapshots.test.ts`
- Test: `planner/src/offline/__tests__/plannerOutbox.test.ts`
- Test: `planner/src/components/feedback/__tests__/ConnectivityBanner.test.tsx`

**Interfaces:**
- Produces: snapshot read/write/clear, queue eligibility, replay, pending status, and static-shell caching.

- [ ] **Step 1: Write failing tenant-partition and queue-eligibility tests**

Assert snapshot keys contain both user and organization IDs. Assert only action status/progress, schedule progress, and readiness operations are queueable. Date, owner, create, archive, source-link, and bulk-complete operations must return `false` from `isOfflineQueueable`.

- [ ] **Step 2: Run and verify failures**

Run: `npx vitest run planner/src/offline`
Expected: FAIL resolving modules.

- [ ] **Step 3: Implement IndexedDB snapshot storage**

Expose `savePlannerSnapshot(scope, key, rows, syncedAt)`, `loadPlannerSnapshot`, and `clearPlannerTenantState(userId?)`. Never store auth tokens. The UI labels snapshots `Last synced <time>`.

- [ ] **Step 4: Implement ordered idempotent replay**

Each operation contains `id`, `kind`, `entityId`, `projectId`, `payload`, and `queuedAt`. Replay in order; stop on auth/permission/conflict errors; retry transient network errors later; remove only confirmed operations.

- [ ] **Step 5: Implement static-shell service worker**

Use network-first navigation and cache-first hashed same-origin assets. Explicitly bypass cross-origin Supabase and same-origin `/api/` requests. Register only in production and approved staging/production hostnames.

- [ ] **Step 6: Implement connectivity UI and identity cleanup**

Display Online, Offline—cached data, Syncing N changes, or Sync failed. On logout/user change clear snapshots, outbox, and Planner query keys before another identity renders.

- [ ] **Step 7: Run offline tests and build**

Run: `npx vitest run planner/src/offline planner/src/components/feedback`
Expected: PASS.
Run: `npm run build:planner`
Expected: PASS with manifest and service worker copied.

- [ ] **Step 8: Record validation without committing**

---

### Task 10: Add deployment configuration, runbook, browser tests, and full core validation

**Files:**
- Create: `vercel.planner.json`
- Create: `docs/runbooks/planner-pwa.md`
- Create: `e2e/planner-core.spec.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: reproducible staging/production build, owner checklist, and end-to-end verification.

- [ ] **Step 1: Write the failing Planner E2E contract**

Cover authenticated fixtures for sign-in boundary, Task Register load, New Task, date confirmation, 48-Hour Gate, filters, bulk completion, archive, and logout cache clearing. Use mocked/local Supabase responses unless a dedicated authenticated staging account is explicitly provided.

- [ ] **Step 2: Add Vercel configuration**

Set build command `npm run build:planner`, output `dist-planner`, immutable hashed-asset headers, security headers matching the main app, and SPA rewrites that exclude assets and service-worker files.

- [ ] **Step 3: Write the runbook**

Document local commands, required browser-safe env values, Supabase redirect URL owner steps, Vercel project setup, staging/production PWA checks, service-worker cache-version rules, migration order, rollback, and the explicit prohibition on service-role keys.

- [ ] **Step 4: Run the complete core gate**

Run in order:

```text
npm run test:planner
npm run typecheck:planner
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm test
npm run build
npm run build:planner
```

Expected: every command passes. If a full-repository failure is pre-existing, capture the exact command/output and prove all Planner-focused checks pass; do not claim the full gate passed.

- [ ] **Step 5: Run browser/PWA verification**

Verify the accepted desktop viewport first, then tablet and mobile. Verify install manifest, service-worker registration on a built preview, offline shell load, cached snapshot labeling, core click paths, keyboard navigation, and no console errors.

- [ ] **Step 6: Perform visual fidelity review**

Compare the accepted reference and final browser screenshot with `view_image`. Record at least five comparison points: shell geometry, navigation density, toolbar copy/order, table columns/row density, palette/risk tints, typography, and responsive behavior. Fix every material mismatch before handoff.

- [ ] **Step 7: Record final validation and stop before commit/deploy**

Summarize files changed, validations, remaining limitations, migration/deployment owner steps, and unrelated repository state. Do not stage, commit, push, apply remote migrations, or deploy without explicit user authorization.
