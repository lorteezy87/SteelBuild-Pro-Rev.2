# Task 2 — Planner action-control schema report

## Status

Implemented locally only. The migration was not applied to Supabase, and no files were staged, committed, pushed, or deployed.

## Files changed

- `supabase/migrations/20260802090000_planner_action_control.sql`
- `supabase/migrations/__tests__/plannerActionControl.test.js`
- `src/types/supabase.ts` (only `action_items` and new `planner_action_events` contracts)

## TDD evidence

### RED

Command:

```powershell
npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js
```

Result: failed as expected before the migration existed.

```text
Error: ENOENT: no such file or directory, open
'C:\\dev\\sbp-steelbuild-planner-pwa\\supabase\\migrations\\20260802090000_planner_action_control.sql'
```

### GREEN

Command:

```powershell
npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js
```

Result: passed — 1 test file, 1 test.

## Typecheck evidence

Command:

```powershell
npm run typecheck
```

Result: passed (`tsc -p ./tsconfig.json` exited 0).

## Implementation and self-review

- Added all ten nullable action-control columns and the constrained source entity type.
- Added `planner_action_events` with project FK, event payloads, and a project/occurred-at index.
- Added a pre-write action trigger that stamps `completed_at` for `Complete`, `Resolved`, and `Closed`, and clears it on reopening. `archived_at` is a separate non-destructive attribute; the migration never converts archival into a delete.
- Added separate `AFTER INSERT OR UPDATE` triggers for `action_items` and `schedule_tasks`; captured payloads are limited to operational Planner fields.
- Event insertion is confined to `record_planner_action_event()`, a `SECURITY DEFINER` trigger function with `search_path = public, pg_temp`; its actor lookup uses `(SELECT auth.uid())` and enforces the `field` role floor for user-initiated writes.
- Enabled RLS on the new event table. Authenticated reads require `user_has_project_access(project_id)`; browser roles have SELECT only, while update and delete privileges are explicitly revoked.
- Added immutable-row guard triggers for update/delete plus revoked direct execution of all trigger functions.
- Updated generated types with matching nullability and relationships: `action_items.assigned_user_id -> user_profiles` and `planner_action_events.project_id -> projects`.
- `git diff --check` produced no whitespace errors for the owned changes. The repository has unrelated pre-existing edits in `.gitignore`, `package.json`, and `planner/`; they were not modified by this task.

## Concerns / follow-up

- The migration is intentionally un-applied, so runtime trigger/RLS behavior still needs validation in a local or review database before deployment.
- Existing `action_items` and `schedule_tasks` RLS policies already impose the same `field` write floor; this migration relies on those established policies while separately protecting the new event table.

## Fix Round 1

### Review fixes

- Removed the prior `service_role` blanket grant. `planner_action_events` now grants only SELECT to `authenticated` and `service_role`, then explicitly revokes INSERT, UPDATE, and DELETE from `PUBLIC`, `anon`, `authenticated`, and `service_role`. The security-definer trigger function remains the application write path.
- Replaced the source-type `ADD CONSTRAINT` statement with a `pg_constraint` / `conrelid` catalog guard so reruns do not fail after a partial/manual application.
- Added `DROP POLICY IF EXISTS planner_action_events_select ON public.planner_action_events` immediately before the select-policy creation.
- Strengthened the migration contract test for the exact allowlist, replay guards, secured event writer/search path, field-role check, project-access read policy, service-role write revokes, separate triggers, and immutable update/delete guard.

### RED

After adding the new assertions before changing the migration:

```powershell
npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js
```

Result: failed as expected — 3 of 4 tests failed, specifically for the missing `pg_constraint` guard, missing service-role write revoke, and missing policy drop/recreate guard.

### GREEN

Commands:

```powershell
npx vitest run supabase/migrations/__tests__/plannerActionControl.test.js
npm run typecheck
git diff --check
```

Result: all passed. Focused Vitest: 1 file, 4 tests. Typecheck exited 0. `git diff --check` exited 0; it emitted only existing line-ending warnings for unrelated `.gitignore`, `package.json`, and the edited generated type file.
