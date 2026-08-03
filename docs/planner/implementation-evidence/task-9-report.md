# Task 9 Report — Planner offline boundaries and PWA shell

## Result

Added tenant-partitioned IndexedDB storage for sanitized Planner snapshots and
the narrow Planner outbox, plus the connectivity banner and static-shell
service worker. Planner identity cleanup now clears Planner local storage,
IndexedDB snapshots/outbox, and Planner Query keys on sign-out/user change;
an organization switch purges the prior organization state before rendering
the new scope.

## TDD evidence

### RED

```powershell
npx vitest run --config planner/vite.config.ts planner/src/offline planner/src/components/feedback
```

Initially failed as expected because `plannerSnapshots`, `plannerOutbox`, and
`ConnectivityBanner` did not exist. The three suites failed during module
resolution.

### GREEN

```powershell
npx vitest run --config planner/vite.config.ts planner/src/offline planner/src/components/feedback --reporter=verbose --maxWorkers=1 --no-file-parallelism
```

Passed: 3 files, 14 tests. Coverage includes user-and-organization key
partitioning, credential-like snapshot-field stripping, the strict queue
allow-list, required `expected_updated_at`, ordered replay, conflict stop, and
connectivity states.

An integration regression was also reproduced and fixed:

```powershell
npx vitest run --config planner/vite.config.ts planner/src/app/__tests__/PlannerAuthGate.test.tsx --reporter=verbose --maxWorkers=1 --no-file-parallelism
```

Passed: 1 file, 15 tests. The provider uses the existing shared
`queryClientInstance`, so direct `PlannerAuthGate` rendering does not require a
test-only QueryClient wrapper.

## Final validation

```powershell
npm run typecheck:planner
npm run build:planner
```

Both passed. The Planner production build copies `sw.js` and the manifest from
`planner/public`. Vite emitted its existing non-fatal main-chunk warning
(536.44 kB minified).

## Security and PWA limits

- IndexedDB records are keyed by authenticated user and organization; no token,
  session, credential, cookie, or password-like snapshot fields are persisted.
- The outbox rejects creates, dates, owner changes, archive, source links, and
  bulk completion. It accepts only explicit action status/progress, schedule
  progress, and approved boolean readiness shapes with a required optimistic
  concurrency version and client operation id.
- Replay is a serial, idempotent core operation: confirmed entries can be
  removed, while the first conflict, authentication/permission failure, or
  transient error stops later entries. The current Planner mutation UI has no
  readiness model and no action-progress field, so no existing write control
  was converted to offline queueing; its established online-only restrictions
  remain authoritative.
- Service-worker registration is production-only and requires the deployment
  hostname to be explicitly listed in `VITE_PLANNER_PWA_HOSTNAMES`. It uses
  network-first navigation with the cached shell only as offline fallback and
  cache-first only for same-origin hashed assets/manifest/icons. It never
  caches cross-origin Supabase/auth traffic, same-origin `/api/` traffic, or
  requests carrying an Authorization header.
- No fallback storage was added. If IndexedDB is unavailable, snapshot reads
  return no cache and cleanup is best-effort; Planner must remain online.

No files were staged, committed, pushed, deployed, or migrated.

## Fix Round 1

### Changes made

- IndexedDB is now version 2. Requests are captured, but callers resolve only
  after transaction completion; request errors abort their transaction and both
  transaction error/abort paths reject and close the database. Opening now
  rejects a blocked upgrade and closes an open handle on `versionchange`.
- Added the unapplied migration
  `20260802090500_planner_offline_idempotency.sql`. It adds nullable
  `last_client_op_id` receipts and a field-role, project-scoped SECURITY
  DEFINER RPC for only `action-status` and schedule `percent_complete`
  progress. The RPC returns a previously applied client operation as a
  successful idempotent replay, otherwise applies optimistic concurrency and
  fails closed. Public/anon execution is revoked; authenticated is granted.
- Outbox replay now invokes that RPC with `client_op_id`, expected version,
  entity, project, kind, and strict payload. `action-progress` and readiness
  are not queueable until their schema/repository contracts exist.
- The provider has a single-flight replay guard with truthful try/finally sync
  state. It is keyed by user and organization, clears the departing tenant's
  Planner cache/IndexedDB state on unmount, and starts each new tenant scope
  with blank pending/sync/snapshot state.
- Task Register and shared queue reads save only action/schedule rows as
  sanitized per-project snapshots after an authorized online read, and use
  those snapshots while offline. Audit payloads and credentials are not part
  of this path. Connectivity distinguishes verification, verified online,
  cached offline data, and no cached offline data.
- Service worker shell caching is restricted to index/manifest/icons; it never
  stores navigation responses. Cache-first applies only to strict hashed asset
  paths, and activation purges previous cache versions.

### TDD and validation

RED checks observed missing transaction lifecycle helper, old service-worker
contract, and missing migration file. GREEN checks:

```powershell
npx vitest run --config planner/vite.config.ts planner/src/offline planner/src/components/feedback --reporter=verbose --maxWorkers=1 --no-file-parallelism
npx vitest run supabase/migrations/__tests__/plannerOfflineIdempotency.test.js --reporter=verbose --maxWorkers=1 --no-file-parallelism
npm run test:planner -- --maxWorkers=1 --no-file-parallelism
npm run typecheck:planner
npm run lint
npm run build:planner
```

- Focused offline/banner tests: 4 files, 22 tests passed (including service
  worker and RPC mock coverage).
- Migration contract test: 1 file, 2 tests passed.
- Full Planner test cache reports 20 files passed.
- Planner typecheck and ESLint passed.
- Planner build passed. Warnings are non-fatal: the existing large main chunk
  plus Vite's notice that the replay RPC module dynamically imports Supabase
  even though other Planner modules statically import it.

### Runtime dependency

The idempotent replay RPC is **not available until the new migration is applied
through the approved Supabase migration workflow**. No migration was applied in
this task; before that deployment, a queued replay will surface its server
failure and preserve its outbox record rather than pretending success.

## Fix Round 2

### Changes made

- Replaced mutable per-record `last_client_op_id` markers with the durable,
  user-bound `planner_offline_operation_receipts` table, keyed by
  `(user_id, client_op_id)`. The target-table type additions were removed.
- The SECURITY DEFINER replay RPC first returns a receipt only when its project,
  entity, operation kind, and canonical JSON payload exactly match. A reused
  client operation id with different binding fails closed. New operations run
  role, project/entity, allow-list, and optimistic-version checks, update the
  target, and insert the receipt/result in one transaction. This preserves both
  A and B receipts for the same target, so replays of either operation remain
  idempotent after later writes.
- PlannerOfflineProvider now loads persisted tenant outbox entries during scope
  preparation and starts its guarded replay immediately when the browser is
  online. An overlapping `online` event receives the same single-flight
  promise; unmount/scope cleanup prevents its preparation callback from
  updating a departed tenant.

### Validation

```powershell
npx vitest run supabase/migrations/__tests__/plannerOfflineIdempotency.test.js --reporter=verbose --maxWorkers=1 --no-file-parallelism
npx vitest run --config planner/vite.config.ts planner/src/offline/__tests__/PlannerOfflineProvider.test.tsx --reporter=verbose --maxWorkers=1 --no-file-parallelism
npm run typecheck:planner
npm run test:planner -- --maxWorkers=1 --no-file-parallelism
npm run lint
npm run build:planner
```

- Receipt migration contract: 2 tests passed.
- Initial-online persisted-outbox/single-flight provider regression: 1 test
  passed.
- Full Planner test cache reports 20 files passed; Planner typecheck and lint
  passed; Planner build passed with the same non-fatal large-chunk and dynamic
  import warnings.

The migration remains local and unapplied. RPC replay depends on applying it
through the approved Supabase migration workflow; no remote schema change was
made.

## Fix Round 3

### Changes made

- Moved the field-role authorization check ahead of every receipt lookup or
  replay return. Receipt binding remains exact for project, entity, operation
  kind, and canonical payload.
- Added a transaction-scoped advisory lock derived from authenticated user and
  client operation id before receipt lookup. Concurrent duplicate calls now
  serialize: the follower waits for the winner's target update and receipt,
  then returns that stored receipt rather than performing a second optimistic
  update.
- Reworked provider flight ownership to use scope-keyed flights. Tenant B can
  begin while tenant A is in flight; completion/finally state writes are
  guarded by the captured scope generation, and a completed A flight cannot
  clear B's flight. Tenant-state cleanup is microtask-deferred and reference
  counted, so React StrictMode's probe cleanup does not purge an immediately
  remounted current tenant.

### Validation and limitations

```powershell
npx vitest run supabase/migrations/__tests__/plannerOfflineIdempotency.test.js --reporter=verbose --maxWorkers=1 --no-file-parallelism
npx vitest run --config planner/vite.config.ts planner/src/offline planner/src/components/feedback --reporter=verbose --maxWorkers=1 --no-file-parallelism
npm run test:planner -- --maxWorkers=1 --no-file-parallelism
npm run typecheck:planner
npm run lint
npm run build:planner
```

- Migration contract: 2 tests passed; it verifies authorization precedes
  receipt lookup and the advisory lock is present.
- Focused Planner offline/banner suite: 5 files, 23 tests passed, including
  persisted-outbox initial replay with overlapping online event.
- Full Planner cache: 21 files passed. Typecheck, lint, build, and diff check
  passed. Build retains the non-fatal dynamic-import and large-chunk warnings.
- No safe local database harness was used for a real concurrent-RPC test: this
  migration is intentionally unapplied and the task forbids applying it.
  Static contract coverage verifies the strongest available transaction design
  (`pg_advisory_xact_lock` before receipt lookup); production behavior still
  depends on applying the migration through the approved Supabase workflow.

No migration was applied and no files were staged, committed, pushed, or
deployed.

## Final connectivity truthfulness fix

- Empty-outbox replay no longer marks the connection verified. Replay sets
  `connectionVerified` only after at least one queued operation is confirmed
  by the server; an `online` browser event with no queued work remains in the
  truthful `Connection available—verifying` state.
- Added a provider regression that failed before the guard and now passes.
  Successful queued replay continues to transition the banner to `Online`.
- Final validation: provider 5/5, focused offline 30/30, full Planner JUnit
  114 tests with 0 failures/errors, Planner typecheck, ESLint, Planner build,
  and `git diff --check` passed. The build retains only the documented
  dynamic-import and large-chunk warnings.
- Independent final review: PASS; code quality PASS; no Critical or Important
  issue remains.

No migration was applied and no files were staged, committed, pushed, or
deployed.

## Fix Round 4

### Changes made

- Tightened `plannerOutbox` client eligibility to require canonical UUID
  format for the client operation, entity, and project identifiers that are
  passed to the UUID-typed replay RPC. The local record id must still equal
  `client_op_id`.
- Mirrored the RPC's exact `action-status` allow-list on the client: `Open`,
  `In Progress`, `Complete`, `Cancelled`, `Resolved`, and `Closed`. Schedule
  progress remains a finite numeric-only `percent_complete` in the inclusive
  0–100 range, matching the server migration's JSON-number and numeric-bound
  checks.
- Classified SQLSTATE `40001` as a replay conflict, and `22023` / `22P02` as
  blocked permanent payload failures. Existing `42501` access denial remains
  blocked; other and network failures remain retryable. The failed queue entry
  is retained for every non-complete result.
- Hoisted and asserted the tenant-state clear mock in the provider regression
  suite. React StrictMode's mount-cleanup-remount probe performs no clear after
  its microtask is flushed, while a genuine A-to-B organization departure
  clears the departed A tenant deterministically.

### TDD and validation

The initial RED outbox run proved the gaps: arbitrary action statuses and
non-UUID RPC identifiers were admitted, while `40001`, `22023`, and `22P02`
all fell through to retry. The smallest matching eligibility and classification
changes were then made before the GREEN runs below.

```powershell
npx vitest run --config planner/vite.config.ts planner/src/offline/__tests__/PlannerOfflineProvider.test.tsx planner/src/offline/__tests__/plannerOutbox.test.ts --reporter=verbose --maxWorkers=1 --no-file-parallelism
npx vitest run supabase/migrations/__tests__/plannerOfflineIdempotency.test.js --reporter=verbose --maxWorkers=1 --no-file-parallelism
npx vitest run --config planner/vite.config.ts planner/src --maxWorkers=1 --no-file-parallelism --reporter=junit --outputFile C:\Users\Nicholas\AppData\Local\Temp\planner-round4-junit.xml
npm run typecheck:planner
npm run lint
npm run build:planner
git diff --check
```

- Focused provider/outbox suite: 2 files, 22 tests passed. It includes
  concrete replay-result checks for each SQLSTATE, UUID rejection checks,
  explicit server-status parity, the StrictMode no-clear assertion, and the
  actual departed-tenant clear assertion.
- Migration contract: 3 tests passed, including static confirmation of the
  server action-status list and JSON-number 0–100 schedule-progress rule.
- Full Planner suite: JUnit terminal report records 113 tests, 0 failures, and
  0 errors.
- Planner typecheck, ESLint, and `git diff --check` passed. Planner build
  passed; it retains only the existing non-fatal dynamic-Supabase-import and
  greater-than-500-kB chunk warnings.

No migration was applied and no files were staged, committed, pushed, or
deployed.
