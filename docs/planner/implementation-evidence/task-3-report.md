# Task 3 Report — Planner deterministic domain logic

## Result

Implemented the Planner's pure, deterministic action-control and calendar derivations. The work is limited to the approved Planner type, domain, and domain-test files. No migrations, shared SteelBuild source, scripts, packages, commits, pushes, deployments, or remote actions were changed.

## TDD evidence

### 1. Fixed-date gate

RED command:

```powershell
npx vitest run planner/src/domain/__tests__/plannerActions.test.ts
```

RED result: failed as expected because `../plannerActions` did not exist:

```text
Error: Cannot find module '../plannerActions'
```

GREEN command:

```powershell
npx vitest run planner/src/domain/__tests__/plannerActions.test.ts
```

GREEN result: 1 passed file, 2 passed tests. The gate includes overdue and in-horizon due/follow-up/impact dates, while excluding terminal and archived actions.

### 2. My Day, waiting-on, filter, sort, and search

RED command:

```powershell
npx vitest run planner/src/domain/__tests__/plannerActions.test.ts
```

RED result: 5 expected failures, each caused by a missing exported function:

```text
TypeError: deriveMyDayRows is not a function
TypeError: deriveWaitingOnRows is not a function
TypeError: filterPlannerActions is not a function
TypeError: sortPlannerActions is not a function
```

GREEN command:

```powershell
npx vitest run planner/src/domain/__tests__/plannerActions.test.ts
```

GREEN result: 1 passed file, 7 passed tests. The tests cover current-user action/task selection for My Day, meaningful waiting-on values, project/status/workstream/owner/waiting-on/priority filters, normalized free-text search, deterministic sorting, and no mutation of the supplied arrays.

### 3. Calendar mapping

RED command:

```powershell
npx vitest run planner/src/domain/__tests__/plannerCalendar.test.ts
```

RED result: failed as expected because `../plannerCalendar` did not exist:

```text
Error: Cannot find module '../plannerCalendar'
```

GREEN command:

```powershell
npx vitest run planner/src/domain/__tests__/plannerCalendar.test.ts
```

GREEN result: 1 passed file, 2 passed tests. Actions use `action_date` before `due_date`; schedule activities keep their range; milestones are explicitly marked; terminal and archived rows are excluded.

### 4. Operational terminal/archive exclusion

RED command:

```powershell
npx vitest run planner/src/domain/__tests__/plannerActions.test.ts
```

RED result: failed as expected. The filter returned `matching`, `complete`, and `archived` when the test required only the open, unarchived action.

GREEN command:

```powershell
npx vitest run planner/src/domain/__tests__/plannerActions.test.ts
```

GREEN result: 1 passed file, 8 passed tests after applying the shared active-action exclusion at the start of the filter derivation.

## Final validation

Commands:

```powershell
npx vitest run planner/src/domain/__tests__
npm run typecheck:planner
git diff --check -- planner/src/data/plannerTypes.ts planner/src/domain/plannerActions.ts planner/src/domain/plannerCalendar.ts planner/src/domain/__tests__/plannerActions.test.ts planner/src/domain/__tests__/plannerCalendar.test.ts
```

Results:

```text
Vitest: 2 passed files, 10 passed tests
Planner typecheck: passed (tsc -p planner/tsconfig.json)
Diff check: passed with no whitespace errors
```

## Files changed

- `planner/src/data/plannerTypes.ts`
- `planner/src/domain/plannerActions.ts`
- `planner/src/domain/plannerCalendar.ts`
- `planner/src/domain/__tests__/plannerActions.test.ts`
- `planner/src/domain/__tests__/plannerCalendar.test.ts`
- `.superpowers/sdd/steelbuild-planner-core-implementation-plan/task-3-report.md`

## Self-review

- Date-only math parses `YYYY-MM-DD` into numeric local-date components and uses `setDate`; it does not call `new Date("YYYY-MM-DD")`, avoiding UTC date drift.
- Every exported derivation returns a new array. Sorting starts from a copied array, and filtering/mapping never writes input records.
- Terminal (`Complete`, `Cancelled`, `Resolved`, `Closed`) and archived actions are excluded consistently from operational derivations and calendar output. Terminal schedule tasks are likewise excluded from My Day and calendar output.
- Action ordering is required date, then priority, then id. Calendar ordering is start, end, kind, then source id. These tiebreakers make output stable.
- Planner-local production imports use the `@planner/*` boundary. The tests intentionally retain the brief's relative imports so the required direct `npx vitest run planner/src/domain/__tests__` command resolves without changing shared Vitest configuration. The type layer and domain modules contain no `any`.

## Concerns and follow-up

- `deriveMyDayRows` produces a typed discriminated union of action and schedule-task rows so a UI can render source-specific context without unsafe casts. The forthcoming UI task should retain that distinction rather than flattening the underlying records.
- No phase-facing schedule behavior was added in this task, so `PHASES` validation is not applicable.

## Fix Round 1

### Changes made

- Terminal status checks now normalize with `trim().toLocaleLowerCase()` before comparing against `complete`, `cancelled`, `resolved`, and `closed`. This applies to action gates, My Day, operational filters, and both action and schedule calendar sources.
- Date-only validation now rejects malformed strings and impossible Gregorian dates without parsing ISO date strings as UTC. It parses numeric components, validates the reconstructed local calendar date, and uses numeric local-date construction for date arithmetic.
- Gate and My Day ignore invalid candidate dates. An invalid `todayIso` also safely produces no rows.
- Calendar actions use the first valid value in `action_date` then `due_date`; actions with neither are omitted. Schedule events require a valid `start_date`; missing, invalid, or reversed ends collapse to the valid start date.
- The calendar keeps its validation helpers self-contained. This avoids changing shared Vite/Vitest configuration or adding a runtime cross-domain alias that the required direct root Vitest command cannot resolve. Planner production source continues to use the established `@planner/*` import for Planner data types.

### TDD evidence

RED command:

```powershell
npx vitest run planner/src/domain/__tests__
```

RED result: 4 expected failures across the two focused files. The failures showed that whitespace/case terminal variants were included and that impossible dates such as `2026-02-30` were treated as valid gate, My Day, and calendar dates. Calendar also emitted missing-start, invalid-start, invalid-end, and reversed-end task ranges.

GREEN command:

```powershell
npx vitest run planner/src/domain/__tests__
```

GREEN result:

```text
Test Files  2 passed (2)
Tests  14 passed (14)
```

### Final validation

```powershell
npx vitest run planner/src/domain/__tests__
npm run typecheck:planner
```

Both commands passed. No files were staged, committed, pushed, deployed, or migrated.
