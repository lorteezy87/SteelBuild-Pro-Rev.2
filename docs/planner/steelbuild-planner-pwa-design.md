# SteelBuild Planner PWA Design Specification

**Date:** 2026-08-02
**Status:** Approved design; awaiting written-spec review
**Product:** SteelBuild Planner — Construction Action & Lookahead Control
**Implementation repository:** `C:\dev\SteelBuild-Pro-Rev.2`

## 1. Objective

Build a separate, installable Progressive Web App that matches the approved SteelBuild Planner reference: a desktop-first operational control system with a permanent navigation pane, dense cross-project action registers, lookahead gates, readiness modules, bulk actions, filtering, exports, audit history, and responsive access.

The Planner shares SteelBuild Pro's existing Supabase authentication, organization and project membership, database records, row-level security, generated database types, and deterministic construction-domain rules. It does not create a parallel project-management database.

## 2. Product principles

- Register-first: dense, sortable tables are the primary operating surface.
- Cross-project: authorized users can work across all projects they can access.
- Action-oriented: every task answers what must happen, by when, who owns it, and what it affects.
- Source-linked: RFIs, submittals, drawings, change orders, releases, deliveries, and schedule activities retain their own authoritative status.
- Human-controlled: the Planner does not automatically approve, close, reschedule, or modify project-critical records.
- Auditable: material changes record actor, time, previous state, and resulting state.
- Failure-visible: partial load, offline, conflict, and synchronization states remain explicit.

## 3. Scope

### 3.1 Included

- Existing SteelBuild Pro email/password authentication, recovery, and TOTP MFA.
- Existing organization and project access enforced by Supabase RLS.
- Separate PWA shell, manifest, icons, service worker, deployment, and install identity.
- Command Center, My Day, Calendar, Task Register, Waiting On.
- 48-Hour Gate, 10-Day Lookahead, Milestones.
- Drawing/Submittal, Change Order, RFI, Fabrication, Delivery, and Field Readiness.
- Meetings, Projects, Reports, Archive, and Planner Settings.
- Cross-project search, filters, selection, eligible bulk completion, and CSV export.
- Operational action creation and editing.
- Schedule activity creation and controlled editing.
- Explicit date-change confirmation.
- Last-synchronized offline snapshots and a narrow offline mutation queue.
- Immutable audit history for Planner changes.
- Desktop, tablet, and usable mobile-responsive layouts.

### 3.2 Not included in the first release

- Deleting records from the Planner.
- Offline creation of new actions or schedule activities.
- Offline date or ownership changes.
- Automatic approval, closure, schedule commitment, or contractual status changes.
- Reimplementation of SteelBuild Pro's full Gantt, drawing viewer, document management, financials, or administrative modules.
- A second authentication system or privileged browser credentials.
- Migration of AppDeploy-hosted Planner records into Supabase unless a separate migration request supplies an export and mapping approval.

## 4. Architecture

The Planner will be a second Vite application inside the SteelBuild Pro repository and a second Vercel project built from the same repository root.

```text
SteelBuild-Pro-Rev.2
├── src/                         Existing SteelBuild Pro application and shared modules
├── planner/
│   ├── index.html
│   ├── src/                     Planner-only shell, routes, components, repositories
│   ├── public/                  Planner manifest, icons, service worker
│   └── vite.config.ts
├── dist/                        Existing SteelBuild Pro build output
└── dist-planner/                Planner build output
```

The implementation uses the `planner/` source root and `dist-planner/` build output shown above. The separation contract is:

- Planner has its own application entry point and route tree.
- Planner produces an independent build artifact.
- Planner imports shared Supabase, generated types, date helpers, permissions, and deterministic domain logic from the existing repository.
- Planner does not import the full SteelBuild Pro application shell or its route registry.
- Planner-specific UI and state do not become dependencies of the full application.

The default production hostname is `planner.steelbuild-pro.com`. Until DNS is configured, the Vercel production alias is the canonical deployment target. Both origins must be configured as permitted Supabase authentication redirect URLs.

## 5. Visual and interaction system

The approved reference is the canonical layout direction.

### 5.1 Shell

- Dark navy top bar with SteelBuild Planner identity and current user/date context.
- Permanent dark left navigation pane on desktop.
- Light gray application canvas with white register surfaces.
- Compact control typography and dense row spacing.
- Blue/teal primary actions and links.
- Amber gate-focus banners.
- Pale red and pale amber row backgrounds for overdue/critical and at-risk records.
- Compact outlined row-action icons.
- Desktop is the canonical experience; tablet preserves the navigation rail where space permits.
- Mobile collapses navigation into a drawer and converts the register into a horizontally scrollable, sticky-key-column table. It does not replace the table with unrelated cards.

### 5.2 Navigation

Planner:

- Command Center
- My Day
- Calendar
- Task Register
- Waiting On

Lookaheads:

- 48-Hour Gate
- 10-Day Lookahead
- Milestones

Operations:

- Drawing / Submittal Readiness
- Change Order Readiness
- RFI Readiness
- Fabrication Readiness
- Delivery Readiness
- Field Readiness
- Meetings

Management:

- Projects
- Reports
- Archive
- Settings

### 5.3 Shared register toolbar

- New Task
- Complete Selected, enabled only when every selected record is eligible
- Export
- Expandable filters
- Project selector, including All Projects
- Status selector
- Workstream, owner, waiting-on, priority, and date filters where applicable
- Search across task title, project, workstream, owner, waiting-on party, and linked-record identifiers

### 5.4 Shared register behavior

- Sticky column headers.
- Stable server-side or bounded client-side sorting using existing entity limits.
- Row selection with visible selected count.
- Column visibility preferences stored per user.
- Row click opens a detail drawer; explicit icons provide edit, history, and archive actions.
- No destructive delete action.
- Empty, loading, partial-error, offline, and no-results states are visually distinct.

## 6. Data ownership and mapping

| Planner surface | Authoritative SteelBuild source |
|---|---|
| Task Register, Waiting On, 48-Hour Gate, 10-Day Lookahead | `action_items` |
| My Day and Calendar | `action_items` and `schedule_tasks` |
| Milestones | `schedule_tasks` where `is_milestone = true` or `milestone = true` |
| Drawing/Submittal Readiness | `drawing_sets`, drawings, and `submittals` |
| Change Order Readiness | `change_orders` and existing authorization/status fields |
| RFI Readiness | `rfis` |
| Fabrication Readiness | work packages, releases, pieces, and schedule activities |
| Delivery Readiness | `deliveries` |
| Field Readiness | schedule activities, blockers, crews, and `schedule_task_readiness` |
| Projects and reporting | existing projects and organization-scoped aggregates |

Readiness modules reuse existing status mappings and deterministic SteelBuild helpers. The Planner must not invent a second definition of approved drawings, answered RFIs, authorized change orders, released fabrication work, delivered loads, or schedule completion.

## 7. Database changes

### 7.1 Extend `action_items`

Add explicit operational columns:

- `workstream text`
- `action_date date`
- `follow_up_date date`
- `impact_date date`
- `waiting_on text`
- `assigned_user_id uuid` referencing the server-authoritative user profile record when assignment is internal
- `source_entity_type text`
- `source_entity_id uuid`
- `completed_at timestamptz`
- `archived_at timestamptz`

Existing `due_date` is the Planner's Required date. Existing `assigned_to` remains the display/fallback assignment for external parties and legacy rows. `source_entity_type` is constrained to `rfi`, `submittal`, `drawing_set`, `change_order`, `work_package`, `delivery`, `schedule_task`, or `meeting`. Source links are navigational; changing an action does not alter the source record.

### 7.2 Add `schedule_task_readiness`

One row per schedule activity:

- `schedule_task_id uuid primary key` referencing `schedule_tasks(id)` with cascade delete
- `project_id uuid not null` referencing `projects(id)`
- `materials_ready boolean not null default false`
- `drawings_ready boolean not null default false`
- `access_ready boolean not null default false`
- `crew_ready boolean not null default false`
- `tools_ready boolean not null default false`
- `prior_work_ready boolean not null default false`
- `notes text`
- `updated_by uuid`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

The duplicated `project_id` supports efficient project RLS and must match the referenced schedule activity. A database trigger rejects mismatches.

### 7.3 Add immutable `planner_action_events`

- `id uuid primary key`
- `project_id uuid not null`
- `entity_type text not null`
- `entity_id uuid not null`
- `event_type text not null`
- `before_state jsonb`
- `after_state jsonb`
- `actor_user_id uuid`
- `occurred_at timestamptz not null default now()`

Database triggers write events for Planner-relevant changes to `action_items`, `schedule_tasks`, and `schedule_task_readiness`. Authenticated clients may select authorized events but may not update or delete them.

### 7.4 RLS and permissions

- Select policies reuse `user_has_project_access(project_id)`.
- Planner writes require `user_has_project_role_at_least(project_id, 'field')`, matching the existing field/schedule write floor.
- Viewer/read-only roles cannot create, edit, complete, archive, or reschedule.
- Cross-project screens issue ordinary RLS-scoped queries; the client never supplies an organization-wide bypass.
- Database constraints and RLS remain authoritative even when UI controls are disabled.

## 8. Gate and register rules

All date comparisons use Phoenix-local calendar dates, consistent with the application's operating timezone.

### 8.1 48-Hour Gate

Include non-complete, non-cancelled, non-archived actions when any of these dates is on or before Phoenix today plus two calendar days:

- Required (`due_date`)
- Follow-up
- Impact

Overdue records remain included until completed, cancelled, resolved, closed, or archived.

### 8.2 10-Day Lookahead

Use the same eligibility rules with a ten-calendar-day horizon. The default view groups by project and workstream while preserving sortable register columns.

### 8.3 My Day

Include actions assigned to the signed-in user and schedule activities assigned through crew/resource fields when they are overdue, active today, required today, or have follow-up today.

### 8.4 Waiting On

Include non-terminal, non-archived actions with a non-empty `waiting_on` value. Default sorting is earliest Required date, then highest priority.

### 8.5 Milestones

Read schedule milestones directly. Planner changes to milestone dates use the controlled schedule-date update workflow and never bypass schedule constraints.

## 9. Core workflows

### 9.1 Sign in

The Planner uses existing Supabase credentials, recovery, and MFA. A valid user without an organization sees the existing organization-onboarding boundary or an explicit instruction to complete onboarding in SteelBuild Pro. A user without project access receives no project data.

### 9.2 Create task

The New Task dialog requires a record kind:

- Operational Action, stored in `action_items`.
- Schedule Activity, stored in `schedule_tasks`.

Operational Action fields: project, title, description, priority, status, workstream, action date, follow-up date, Required date, impact date, assigned user/display owner, waiting-on party, category, optional work package, and optional source link.

Schedule Activity fields reuse SteelBuild's existing schedule-task validation and include project, name, phase, start/end dates, status, priority, crew/resource, notes, and optional parent activity.

Creation requires an online connection in the first release.

### 9.3 Edit action

- Non-date fields save after validation.
- Date changes show old and new values and require confirmation.
- Completion sets terminal status and `completed_at` in the same mutation.
- Reopening clears `completed_at` and records an audit event.
- Archive sets `archived_at`; archived rows remain accessible through Archive.

### 9.4 Edit schedule activity

- Planner may change name, dates, phase, crew/resource, notes, status, progress, and readiness.
- Date changes require confirmation and optimistic-concurrency validation.
- Parent summary tasks and dependency-driven changes continue using existing schedule services and database rules.
- Planner provides no delete action.

### 9.5 Bulk completion

- The server receives explicit selected action IDs.
- Every row must be authorized, non-terminal, non-archived, and completion-eligible.
- If any row is ineligible, the operation fails closed and reports which rows require attention.
- Successful completion records one audit event per action.

### 9.6 Readiness review

- Readiness modules show source records and the exact missing condition.
- Users can open the authoritative SteelBuild record or create/link an operational action.
- Only the six schedule execution readiness checks write to `schedule_task_readiness`.
- Readiness changes never approve or close the linked business record.

## 10. Concurrency and conflict handling

Planner repositories include the row's last observed `updated_at` in critical updates. Updates match both `id` and expected `updated_at`.

If the row changed after it was loaded:

- The mutation does not overwrite the current server row.
- The detail drawer shows the user's proposed values beside the latest server values.
- The user may refresh, discard, or deliberately reapply permitted fields.
- Date and ownership changes always require a new confirmation after refresh.

## 11. Offline and PWA behavior

### 11.1 Installation

- Dedicated manifest identity and icons.
- `display: standalone`.
- App shortcuts to My Day, Task Register, and 48-Hour Gate when supported.
- Independent service-worker scope for the Planner origin.

### 11.2 Service worker

- Network-first HTML navigations with cached-shell fallback.
- Cache-first hashed static assets with background revalidation.
- Never cache Supabase auth, REST, realtime, or storage responses in the service worker.
- Service-worker registration runs only in approved production/staging hosts, not local Vite development or protected previews.

### 11.3 Offline data

- IndexedDB stores the last successful snapshots needed for visible registers.
- Snapshot keys include user ID and organization ID.
- Every offline screen shows last-synchronized time.
- Logout or user change clears snapshots, query caches, and pending operations before another user's data can render.

### 11.4 Offline writes

Queue only:

- Action status/progress changes that do not alter dates or ownership.
- Schedule progress changes.
- Schedule-task readiness toggles and readiness notes.

New records, date changes, ownership changes, bulk completion, archive, and source-link changes require an online connection in the first release. Queued operations remain visibly pending until Supabase confirms them. Replays are idempotent and ordered.

## 12. Error handling

- Authentication failures return to the sign-in boundary without exposing project data.
- Module queries fail independently and render scoped retry controls.
- A persistent connectivity indicator distinguishes online, offline, syncing, and sync-failed states.
- Failed mutations keep the editor open and preserve user input.
- Partial bulk failures are not reported as success.
- Export failures leave register state unchanged and report the error.
- Unexpected errors use the existing telemetry path without including sensitive record contents.

## 13. Reporting and export

CSV export uses the currently authorized and filtered register data with stable column order. Exports include visible operational fields and linked-record references but exclude internal metadata, hidden authorization fields, and audit before/after payloads.

Reports in the first release provide:

- Open actions by project and workstream.
- Overdue and next-ten-day actions.
- Waiting-on aging.
- Completion trend.
- Readiness exceptions by operational lane.

## 14. Accessibility and responsiveness

- Full keyboard navigation for sidebar, toolbar, registers, selection, drawers, and dialogs.
- Visible focus indicators.
- Semantic table headers and row selection labels.
- Status and priority never rely on color alone.
- Minimum touch targets on tablet/mobile.
- Horizontal table scrolling preserves sticky task/project context.
- Reduced-motion preference is respected.
- Color contrast meets WCAG AA for normal text and controls.

## 15. Validation strategy

### 15.1 Unit tests

- Phoenix date boundaries for 48-hour and 10-day gates.
- Overdue inclusion and terminal-status exclusion.
- My Day ownership/date selection.
- Waiting On eligibility and sort order.
- Readiness percentage and missing-condition derivation.
- Filter, search, priority, and row-color derivation.
- Update payload validation and date-change detection.
- Conflict comparison and offline-queue eligibility.

### 15.2 Component tests

- Shared register toolbar, row selection, bulk-action eligibility, and empty/error/offline states.
- New Task record-kind flow.
- Action detail drawer and date confirmation.
- Conflict-resolution display.
- Readiness toggles and pending-sync indicators.
- Viewer-role disabled behavior.

### 15.3 Database tests

- RLS isolation by organization/project and project role.
- Viewer write rejection.
- Readiness project/task mismatch rejection.
- Immutable audit events.
- Completion timestamps and archive behavior.
- Optimistic-concurrency update behavior.

### 15.4 Browser and PWA tests

- Sign in, MFA boundary, project loading, and sign out.
- Create and edit operational action.
- Create and reschedule schedule activity with confirmation.
- Complete selected actions.
- Filter/search/export.
- Navigate every sidebar module.
- Load cached shell and snapshots offline.
- Queue and replay permitted offline changes.
- Clear tenant state on logout/account change.
- Desktop reference viewport, tablet, and mobile-responsive verification.
- Manifest, service worker, installability, and production build checks.

### 15.5 Repository quality gates

- Targeted Vitest files during development.
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:js`
- `npm run typecheck:strict`
- `npm run typecheck:noimplicitany`
- `npm test`
- Existing SteelBuild Pro production build.
- Planner production build.

## 16. Delivery sequence

### Increment 1: Core control system

- Separate build and PWA shell.
- Shared authentication, organization, project, and RLS boundary.
- Action-item migration, audit events, and Planner repositories.
- Command Center, My Day, Calendar, Task Register, Waiting On.
- 48-Hour Gate, 10-Day Lookahead, Milestones.
- Search, filters, selection, bulk completion, export, archive.
- Offline shell, snapshots, and allowed mutation queue.

### Increment 2: Operational readiness

- `schedule_task_readiness` migration.
- Drawing/Submittal, Change Order, RFI, Fabrication, Delivery, and Field Readiness.
- Meetings, Projects, Reports, and Settings.
- Responsive/mobile refinements and complete browser/PWA validation.

Both increments must preserve existing SteelBuild Pro behavior and pass the repository quality gates before deployment.

## 17. Deployment and owner-controlled configuration

Engineering deliverables:

- Planner build and Vercel configuration.
- Required migrations and RLS policies.
- Environment-variable documentation.
- Staging and production installability checks.
- Deployment runbook and rollback notes.

Owner-controlled configuration:

- Add the Planner staging and production origins to Supabase Auth redirect URLs.
- Create or approve the Vercel Planner project and environment values.
- Configure `planner.steelbuild-pro.com` DNS when ready.

The absence of the custom domain does not block implementation or validation on the Vercel production alias.

## 18. Acceptance criteria

The product is ready for release when:

- The deployed Planner is separately installable and opens in standalone mode.
- Existing SteelBuild users sign in through the existing Supabase auth/MFA boundary.
- Users see only organizations and projects allowed by RLS.
- The shell and registers match the approved reference direction at the canonical desktop viewport.
- Task Register, My Day, Calendar, Waiting On, 48-Hour Gate, 10-Day Lookahead, and Milestones use live SteelBuild data.
- New operational actions and schedule activities persist to their authoritative tables.
- Date changes require confirmation and reject stale writes.
- Bulk completion fails closed on ineligible rows.
- Readiness modules explain missing conditions without modifying authoritative source statuses.
- Audit history captures Planner-relevant changes and cannot be edited by clients.
- Offline shell/snapshot behavior and permitted queue replay are verified.
- Logout/account change clears cached tenant data.
- Desktop, tablet, and mobile-responsive browser workflows pass.
- Required repository quality gates and both production builds pass.
- No unresolved material visual mismatch remains against the approved design concept and reference.

## 19. Risks and mitigations

- **Cross-project query volume:** use bounded queries, indexed dates/status/project fields, and paginated registers.
- **Status-semantic drift:** reuse existing deterministic helpers rather than redefining source readiness.
- **Stale offline data:** display synchronization time and pending state; never imply cached data is current.
- **Concurrent edits:** use expected-`updated_at` matching and explicit conflict resolution.
- **Shared-module coupling:** import narrow data/domain modules, not the full SteelBuild application shell.
- **Sensitive browser storage:** partition by user/org and clear all tenant state during identity changes.
- **Current repository has unrelated work:** implement in a dedicated branch/worktree, claim files before edits, and preserve existing changes.
