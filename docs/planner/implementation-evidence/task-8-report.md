# Task 8 Report — Planner core queues and navigation

## Result

Implemented live, RLS-scoped Command Center, My Day, Calendar, Waiting On,
48-Hour Gate, 10-Day Lookahead, and Milestones routes. All queue pages share
one reactive organization/project fan-out hook and read only through Planner
repositories. No source record is changed by a queue page.

## TDD evidence

### RED

```powershell
npx vitest run planner/src/pages/__tests__/CoreQueues.test.tsx
```

Initially failed as expected because `Gate48HourPage` did not exist:

```text
Cannot find module '../Gate48HourPage'
```

The narrow schedule-read repository test then failed under the Planner Vitest
configuration because `listScheduleActivities` was not a function.

### GREEN

```powershell
npx vitest run --config planner/vite.config.ts planner/src/pages/__tests__/CoreQueues.test.tsx
npx vitest run --config planner/vite.config.ts planner/src/data/__tests__/scheduleRepository.test.ts
```

Both are green. The queue tests cover the fixed `2026-08-02` boundaries:

- 48-Hour Gate includes overdue records through August 4.
- 10-Day Lookahead includes records through August 12.
- Waiting On requires a meaningful named party.
- My Day uses the signed-in user's action and schedule assignments.
- Milestones only returns active milestone schedule activities.

## Final validation

```powershell
npm run test:planner
npm run typecheck:planner
npm run build:planner
git diff --check -- planner/src/pages planner/src/app/PlannerRoutes.tsx planner/src/data/scheduleRepository.ts planner/src/data/__tests__/scheduleRepository.test.ts
```

Results:

- Planner tests: passed — 15 files, 73 tests.
- Planner typecheck: passed.
- Planner build: passed — 514 modules transformed.
- Diff check: passed with no whitespace errors.
- Build limitation: Vite reported its non-fatal chunk-size warning for the
  528.08 kB main entry bundle.

## Files added or changed

- `planner/src/pages/CommandCenterPage.tsx`
- `planner/src/pages/MyDayPage.tsx`
- `planner/src/pages/CalendarPage.tsx`
- `planner/src/pages/WaitingOnPage.tsx`
- `planner/src/pages/Gate48HourPage.tsx`
- `planner/src/pages/Lookahead10DayPage.tsx`
- `planner/src/pages/MilestonesPage.tsx`
- `planner/src/pages/usePlannerQueueData.ts`
- `planner/src/pages/__tests__/CoreQueues.test.tsx`
- `planner/src/app/PlannerRoutes.tsx`
- `planner/src/data/scheduleRepository.ts`
- `planner/src/data/__tests__/scheduleRepository.test.ts`

## Implementation notes

- `usePlannerQueueData` keeps the active organization in each cache key,
  filters to active projects in that organization, and fans out only through
  `listPlannerActions(projectId)` and `listScheduleActivities(projectId)`.
  RLS remains authoritative in the shared anon-client repository calls.
- `listScheduleActivities` selects only the Task 3 Calendar/My Day/Milestone
  fields. The current `schedule_tasks` schema has no archived/deleted marker,
  so no nonexistent client filter was added.
- The gate routes consume Task 3's `deriveGateRows`; Waiting On and My Day use
  their Task 3 derivations; Calendar uses Task 3's calendar mapping. Milestone
  rows separately exclude terminal schedule activities.
- Calendar is a semantic table/grid of derived event records, not a mutation
  surface. Action rows provide the existing Task Register destination rather
  than introducing a separate write path.

## Limits and follow-up

- The exact brief command without `--config planner/vite.config.ts` still
  cannot resolve the pre-existing `@planner/*` aliases from the root Vitest
  configuration. It fails before tests run with `Cannot find package
  '@planner/domain/plannerActions'`. The authoritative `npm run test:planner`
  command uses the Planner Vite configuration and passed all Planner tests.
- Command Center metric links go to the corresponding operational queue (or
  Task Register for workstream/project totals). Task Register does not yet
  consume URL filter parameters, so no misleading query-string filters were
  introduced.
- No files were staged, committed, pushed, deployed, or migrated.

## Fix Round 1

### Changes made

- Command Center now assigns each action exactly one control date: valid
  `due_date`, otherwise valid `follow_up_date`, otherwise valid
  `impact_date`. The mutually exclusive overdue, due-today, and next-48-hour
  buckets prevent multi-date actions from being double-counted.
- Action metrics link to `Task Register` with an explicit `metric` URL
  parameter. Task Register parses and applies `overdue`, `due-today`,
  `next-48`, `waiting-on`, and `all`, using the same bucket derivation and
  active-org timezone date. The default register still retains its original
  non-archived view.
- Both gates now use the canonical `ActionRegister` and `RegisterToolbar`,
  with identical local project, status, workstream, and search filters plus
  the filtered record count. Gate mutation/export controls remain visibly
  disabled and direct users to Task Register; no separate write path exists.
- My Day accepts normalized identity tokens. The live page supplies the
  signed-in UUID, email, and full/display name; schedule ownership compares
  exact comma/semicolon-delimited `assigned_to` and `resource_names` tokens,
  so a name such as `Taylor Reeds` cannot match `Taylor Reed`.
- Schedule reads now include `resource_names` and exclude direct
  `Cancelled`, `Deleted`, and `Archived` status values. The generated
  `schedule_tasks` schema has no deleted/archive column, so no nonexistent
  filter or metadata inference was introduced. Derived schedule handling also
  treats normalized archived/deleted status values as terminal.
- Planner date derivation reads a valid `currentOrg.metadata.timezone`; invalid
  or absent values fall back deterministically to `America/Phoenix`. It uses
  `Intl.DateTimeFormat(...).formatToParts`, never browser-local date fields,
  and refreshes once a minute. With no active organization after provider
  loading, queue pages render an exclusive unavailable state instead of an
  indefinite loading message.

### TDD evidence

RED command:

```powershell
npx vitest run --config planner/vite.config.ts planner/src/pages/__tests__/CoreQueues.test.tsx planner/src/domain/__tests__/plannerActions.test.ts planner/src/data/__tests__/scheduleRepository.test.ts planner/src/pages/__tests__/TaskRegisterPage.integration.test.tsx
```

RED result: five expected failures: command links still targeted queue pages;
the timezone helper and Task Register metric parser were missing; name/email
schedule ownership was not recognized; and the schedule repository had no
terminal status exclusion.

GREEN result after the implementation: 4 files, 30 tests passed. The fixtures
cover URL metric filtering, one-date command buckets, timezone fallback,
no-organization unavailable rendering, exact email/name/resource matching,
and the repository status exclusion.

### Final validation

```powershell
npm run test:planner
npm run typecheck:planner
npm run lint
npm run build:planner
git diff --check -- planner/src .superpowers/sdd/steelbuild-planner-core-implementation-plan/task-8-report.md
```

Results:

- Planner tests: passed — 15 files, 78 tests.
- Planner typecheck: passed.
- ESLint: passed.
- Planner build: passed — 515 modules transformed.
- Diff check: passed with no whitespace errors.
- Build warning: Vite emitted its non-fatal 528.77 kB main-entry chunk-size
  warning.

No files were staged, committed, pushed, deployed, or migrated in this fix
round.

## Fix Round 2

### Changes made

- Extracted `usePlannerTodayIso(orgMetadata)` into the shared Planner queue
  module. It owns the timezone-aware minute refresh and reliably clears its
  interval when its consumer unmounts.
- `usePlannerQueueData` now consumes that hook for Command Center and queue
  pages. `useTaskRegisterMetricActions` consumes the same hook before applying
  URL metric buckets, so both route families derive their dates from the same
  org timezone and roll over consistently.
- Planner routes are exclusive, so only the mounted route owns one minute
  timer; no second clock is created within a route.

### TDD evidence

RED command:

```powershell
npx vitest run --config planner/vite.config.ts planner/src/pages/__tests__/TaskRegisterPage.timer.test.tsx
```

RED result: failed as expected because `useTaskRegisterMetricActions` did not
exist.

GREEN result:

```text
Task Register metric clock > recomputes filtered metric rows at the org-local date rollover and clears the timer
PASS
```

The fake-timer fixture begins at `2026-08-03T06:59:30Z` (August 2 at 23:59:30
in Phoenix), advances one minute, confirms a `due-today` record leaves the
Task Register metric result at local midnight, then confirms interval cleanup
when unmounted.

### Final validation

```powershell
npx vitest run --config planner/vite.config.ts planner/src/pages/__tests__/TaskRegisterPage.timer.test.tsx planner/src/pages/__tests__/CoreQueues.test.tsx planner/src/pages/__tests__/TaskRegisterPage.integration.test.tsx
npx vitest run --config planner/vite.config.ts planner/src --reporter=verbose
npm run typecheck:planner
npm run lint
npm run build:planner
git diff --check -- planner/src .superpowers/sdd/steelbuild-planner-core-implementation-plan/task-8-report.md
```

Results:

- Focused clock/queue/register tests: passed — 3 files, 14 tests.
- Full Planner tests: passed — 16 files, 79 tests.
- Planner typecheck: passed.
- ESLint: passed.
- Planner build: passed — 515 modules transformed.
- Diff check: passed with no whitespace errors.
- Build warning: Vite emitted its non-fatal 528.77 kB main-entry chunk-size
  warning. The verbose full test run also displayed pre-existing React test
  `act(...)` and React Router future-flag warnings; all tests passed.

No files were staged, committed, pushed, deployed, or migrated in this fix
round.
