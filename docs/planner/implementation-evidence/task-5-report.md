# Task 5 Report — Planner action, schedule, and audit repositories

## Result

Implemented the Planner repository boundary without modifying migrations, generated database types, shared clients, application routes, or existing Planner/domain work. No files were staged, committed, pushed, deployed, or migrated.

## Data and security behavior

- `actionRepository.ts` provides project-scoped action reads, allowlisted create/update fields, optimistic action updates, archive-only removal, and fail-closed bulk completion.
- `scheduleRepository.ts` provides narrow schedule create/update writes. It validates `PHASES` at module load and validates every supplied phase at runtime; parent and dependency fields are absent from the allowlist.
- `auditRepository.ts` provides project-scoped reads of immutable `planner_action_events`; it exposes no write or delete API.
- Every read carries an explicit `project_id` filter. The action update signature is the exact brief contract (`id`, `patch`, `expectedUpdatedAt`), so it relies on the existing RLS write policy for project authorization while matching the current row's `updated_at`.
- Action and schedule optimistic updates use `id` plus `updated_at`; schedule and archive updates also include `project_id`. A zero-row mutation throws `PlannerConflictError`.
- Create, action date/owner/source changes, archive, and bulk completion check browser online state before issuing a write.
- Bulk completion first fetches the selected IDs under `project_id`, requires exact cardinality, verifies each returned row belongs to that project and is non-terminal/non-archived/non-empty-title, and issues no writes when any row is ineligible. It processes writes in bounded 25-row batches. If a write batch has a conflict or database error, it returns per-row completion/failure/rollback results and attempts version-guarded compensation for rows already completed in that batch.

## TDD evidence

### RED 1 — missing repository boundary

Command:

```powershell
npx vitest run planner/src/data/__tests__/actionRepository.test.ts
```

Result: failed as expected before implementation because `@planner/data/actionRepository` did not exist.

```text
Error: Cannot find package '@planner/data/actionRepository'
```

### RED 2 — cross-project bulk response

After the base implementation was green, I added a contract proving a row returned with a different `project_id` must be treated as unauthorized. The focused action test failed as expected: it attempted a completion and returned a conflict rather than stopping before writes. The repository now compares returned rows to the requested project before any update.

```text
Expected ineligible: not_found_or_unauthorized
Received failed: conflict
```

### GREEN

Command:

```powershell
npm run test:planner -- --run planner/src/data/__tests__
```

Result:

```text
Test Files  6 passed (6)
Tests  40 passed (40)
```

The command uses the established Planner Vite configuration, which resolves the required `@planner/*` production import boundary.

## Validation

Commands run successfully:

```powershell
npm run test:planner -- --run planner/src/data/__tests__
npm run typecheck:planner
git diff --check
rg -n "\\bany\\b|\\.delete\\(" planner/src/data/actionRepository.ts planner/src/data/scheduleRepository.ts planner/src/data/auditRepository.ts planner/src/data/__tests__
```

Results:

- Planner repository tests: 6 files / 40 tests passed.
- Planner typecheck: passed with exit code 0.
- Diff whitespace check: passed. Git printed only pre-existing CRLF normalization warnings for unrelated modified files.
- Repository/test scan: no `any` or `.delete(` matches.

## Files changed

- `planner/src/data/actionRepository.ts`
- `planner/src/data/scheduleRepository.ts`
- `planner/src/data/auditRepository.ts`
- `planner/src/data/__tests__/actionRepository.test.ts`
- `planner/src/data/__tests__/scheduleRepository.test.ts`
- `.superpowers/sdd/steelbuild-planner-core-implementation-plan/task-5-report.md`

## Concerns and follow-up

- No schema/type mismatch required a workaround: the generated types already include Task 2's Planner action fields, audit table, and schedule fields.
- Supabase's dynamic narrow select string cannot infer a result shape from generated types. The repositories keep those narrow columns and use localized `unknown`-to-concrete result boundaries; no schema types were changed and no `any` was introduced.
- The worktree contains unrelated pre-existing modifications and untracked Planner/migration files. They were preserved and not staged.

## Fix Round 1 — exact bulk cardinality and narrow result types

### Changes made

- Bulk completion now requires all of the following before any update:
  - requested IDs are unique;
  - the returned row count equals the unique requested-ID count;
  - every requested ID has exactly one returned row; and
  - every returned ID belongs to the requested-ID set.
- Ineligible output now reports `duplicate_selection`, `duplicate_returned_row`, and `unexpected_returned_row` instead of allowing map/set collapsing to make an invalid response appear valid.
- Added `PlannerActionRecord`, `PlannerBulkCompletionCandidate`, `PlannerScheduleActivityRecord`, and `PlannerAuditEvent` as repository-specific, selected-column result types. Public repository return values no longer claim to be complete generated Supabase table rows.
- Replaced partial-row casts with terminal Supabase `.returns<T>()` result boundaries. The selected field tuples and exported `Pick` types share one source of truth.

### Test-first evidence

Added the duplicate requested-ID, duplicate returned-row, and extra returned-ID contracts before changing implementation.

The duplicate requested-ID contract already passed because Task 5's existing raw-selection check produced `duplicate_selection`. The two returned-row contracts failed as expected: the repository collapsed returned rows into a `Map`, attempted an update, and reported a later conflict. The failures showed no pre-write cardinality protection for duplicate/extra database results.

```text
Expected ineligible: duplicate_returned_row / unexpected_returned_row
Received failed: conflict
```

After implementation, every new cardinality contract passes and asserts zero update calls.

### Validation

Commands run successfully:

```powershell
npm run test:planner -- --run planner/src/data/__tests__
npm run test:planner
npm run typecheck:planner
git diff --check
```

Results:

- Focused repository tests: 6 files / 43 tests passed.
- Full Planner tests: 6 files / 43 tests passed.
- Planner typecheck: passed with exit code 0.
- Diff whitespace check: passed. Git printed only pre-existing CRLF normalization warnings for unrelated modified files.

### Fix Round 1 concerns

- Supabase `.returns<T>()` is type-only at runtime, so the test chain now mirrors that no-op client method. Runtime safety for bulk rows remains explicit: cardinality, ID-set, project, status, archive, and title checks occur before updates.
- No schema/type regeneration, commit, staging, push, deployment, or migration was performed.
