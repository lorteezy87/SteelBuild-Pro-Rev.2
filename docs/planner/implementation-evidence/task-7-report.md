# Task 7 report — Planner Task Register workflows

## Result

Implemented operational Task Register and Archive workflows without migrations, deletes, commits, pushes, deployments, or fake-success paths.

- `NewTaskDialog` creates validated Operational Actions or Schedule Activities through the Task 5 repositories. It uses native controls (no `form` or Radix Dialog), requires an explicit record kind, trims text, omits empty nullable fields, validates source/status/priority allowlists and schedule date order, validates canonical phases at module load and at submit time, and blocks creation while offline.
- `ActionEditorDrawer` supports edit, immutable history display, archive-only removal, online guards for date/owner/source/archive changes, and explicit confirmation before date or owner changes. Optimistic-lock conflicts show current/proposed values and require a fresh confirmation before retry.
- `TaskRegisterPage` uses the real reactive `useOrg().currentOrg.id` in `['planner-actions', orgId, filters]`; queries are disabled until the org resolves. It fans out only the existing project-scoped Task 5 repository reads across authorized projects. Mutations retain user input on error and invalidate only Planner action/audit/calendar query families.
- Bulk completion remains repository fail-closed; the UI groups selected rows by project and stops when any repository result is ineligible.
- CSV export uses the stable visible register column order and escapes commas, quotes, and newlines; it excludes IDs and audit/internal payloads.
- Archive is a readable route; archiving sets `archived_at` through the repository and never deletes a record.

## TDD evidence

### RED

Before implementation, the Task 7 focused run failed as expected because `NewTaskDialog`, `ActionEditorDrawer`, and `exportActionsCsv` did not exist.

### GREEN

The requested focused command now passes:

`npx vitest run planner/src/features/actions planner/src/pages/__tests__/TaskRegisterPage.test.tsx`

Result: 3 files / 6 tests passed. The contracts cover record-kind fields, offline creation blocking, date confirmation before repository save, conflict re-confirmation, CSV escaping, and org-specific action query keys.

## Validation

Passed:

- `npx vitest run planner/src/features/actions planner/src/pages/__tests__/TaskRegisterPage.test.tsx`
- `npm run test:planner` — 12 files / 55 tests passed.
- `npm run typecheck:planner`
- `npm run build:planner`
- `git diff --check`

Planner build passed with Vite's existing >500 kB chunk-size advisory; the main bundle is 526.18 kB minified. The static Task 7 scan found no `form`, Radix Dialog, explicit `any`, or `.delete(` use.

## Runtime limits and follow-up

- No authenticated browser CRUD was run because the local environment has no `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`; credentials were not fabricated.
- The register reads use a per-authorized-project fan-out because Task 5 deliberately exposes only `listPlannerActions(projectId)`; no broad raw-Supabase query or new repository API was introduced.
- `PlannerRoutes` lazy-loads Task Register/Archive so ordinary Planner routes do not initialize the shared database client merely by importing those workflow modules.
- The worktree had unrelated pre-existing modified root files, untracked Planner work, and migrations. They were preserved. No files were staged or committed.

## Fix Round 1 — conflict truthfulness, fail-closed scope, CSV safety, and modal access

### Changes

- On an optimistic-lock conflict, the editor reads the current row through the existing project-scoped action repository path before showing a conflict. It labels that fetched row as server/current, keeps the user's proposed input, uses the fetched `updated_at` on retry, and requires another date/owner confirmation.
- Bulk completion now rejects every multi-project selection before a repository mutation is prepared. Single-project responses report completed, failed, ineligible, rollback-attempt, and rollback-failure counts without claiming that nothing changed.
- CSV cells neutralize spreadsheet formulas after leading whitespace/control characters before CSV quoting.
- Task Register and Archive fan-out only projects whose `org_id` matches the reactive current organization. Both remain disabled before org resolution. Archive empty text only renders for a successful zero-row result.
- New Task and Action Editor focus their initial controls, trap Tab/Shift+Tab, close on safe Escape, and restore the opener. Date confirmation is portaled to `document.body`; the underlying editor is hidden from the accessibility tree while confirmation is active.

### TDD evidence

The first Fix Round 1 run failed as expected for absent formula neutralization, absent current-row conflict fetch, and absent modal focus behavior. A second RED run failed for the new page-level bulk and archive-state helpers. After implementation, the focused Fix Round 1 suite passed 5 files / 14 tests.

### Validation

- Exact original focused command: 3 files / 10 tests passed.
- Fix Round 1 focused suite: 5 files / 14 tests passed.
- Full Planner suite: 14 files / 63 tests passed.
- `npm run typecheck:planner`, `npm run build:planner`, `git diff --check`, and a temporary Planner-scoped ESLint configuration all passed.

The Vite bundle advisory remains the existing >500 kB advisory (526.19 kB main bundle). No authenticated browser CRUD could be run because the local Supabase environment remains intentionally unconfigured.

## Fix Round 2 — dirty-field rebasing and export fidelity

### Changes

- Action conflict retry now preserves the set of fields the user actually changed from the opened record. After fetching a fresh row, retry sends only those dirty fields with the fresh `updated_at`; unrelated concurrent server fields are omitted and therefore preserved.
- Archive conflicts now use the same fresh-row read, label actual current state, and expose an archive-only retry with a new explicit confirmation. The archive retry never invokes the save mutation.
- Bulk result text reports net completed (completed IDs excluding every rollback attempt), successful rollbacks, rollback failures, and final-state uncertainty. Fully rolled-back rows are never reported as completed.
- CSV export reads raw nullable register values instead of display values: null exports as empty, whitespace is retained, formula-risk values receive an apostrophe before the entire raw cell, then normal CSV quoting is applied.

### TDD and validation

- RED: dirty-field rebase, archive-only conflict retry, net bulk state, and raw CSV fidelity contracts failed before implementation.
- GREEN: expanded focused contracts passed 4 files / 16 tests.
- Original focused command passed 3 files / 12 tests.
- Full Planner suite passed 14 files / 66 tests.
- `npm run typecheck:planner`, `npm run build:planner`, temporary scoped ESLint, and `git diff --check` passed.

The only build note remains Vite's existing 526.19 kB chunk-size advisory. Authenticated browser CRUD remains unverified because no local Supabase environment was created.

## Fix Round 3 — save-conflict baseline rebase

### Changes

- Save-conflict recovery now treats the fetched server row as the editor's new baseline. It overlays only the fields the user changed before the conflict, preserves that original dirty-field set, and retains all untouched concurrent server values in the form.
- Date/owner confirmation is now derived exclusively from fields that are still user-dirty. A concurrent server-side date or owner update that the user did not edit is not presented as the user's proposed change and does not trigger confirmation on retry.
- Archive recovery remains archive-only and continues to use the fetched row's `updated_at` without rebasing an editor save.

### TDD and validation

- RED: the new title-only conflict test failed before the change because the stale required date (`2026-08-03`) remained in the editor instead of the fetched server date (`2026-08-08`).
- GREEN: the regression verifies that a user title change plus concurrent server date/owner updates displays the server date and owner, bypasses date/owner confirmation, and retries with `{ title: "User title" }` plus the fresh `updated_at`.
- Exact original focused command passed: 3 files / 13 tests.
- Expanded focused suite passed: 4 files / 17 tests.
- Full Planner suite passed: 14 files / 67 tests.
- `npm run typecheck:planner`, `npm run build:planner`, temporary scoped ESLint, and `git diff --check` passed.

The Vite build continues to report only its existing 526.19 kB main-chunk advisory. Authenticated browser CRUD remains unverified because no local Supabase environment was created. No git or deployment action was performed.
