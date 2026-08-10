# Task 7 Report — Protected Impact Actions and Query Invalidation

## Scope

- Base: `767b3b3869515431b099a054b54e970431c0ae35`
- Added field-or-higher piece hold/clear actions through the existing
  `setPieceHold(projectId, pieceIds, onHold, reason)` wrapper.
- Added PM-or-higher drawing-impact create, update, and resolve actions through
  `entities.DrawingImpact`, scoped with `withProjectId` and the selected current
  drawing revision.
- Reused `invalidatePieceControlQueries(..., "all")` plus the established
  `drawing-impacts` key so intelligence, register, relationships, reporting,
  release, production/logistics, and 3D lifecycle consumers refresh together.
- Routed Lots & links with the selected piece/revision intent and routed Board
  release intent to the selected piece's work package. The Board renders the
  existing `CanonicalFabReleasePanel`; Task 7 adds no release mutation or gate.
- Kept all controls native and labeled, required nonblank hold/clear reasons,
  preserved URL parameters, retained retry values after errors, disabled pending
  writes, and made Cancel paths write-free.

## TDD evidence

Initial RED:

```text
npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx
Test Files  1 failed (1)
Tests       10 failed | 37 passed (47)
```

The failures were the missing hold/clear, impact create/update/resolve, role
boundary, relationship-focus, invalidation, and canonical release-owner
behaviors. A second focused RED reproduced an unhandled rejected resolve
mutation (`1 unhandled rejection`), then passed after the component retained the
retry action and consumed the rejected `mutateAsync` promise.

Final focused GREEN:

```text
npx vitest run \
  src/pages/pieceRegister/__tests__/PieceRegister.test.tsx \
  src/pages/pieceRegister/__tests__/PieceRevisionImpactView.test.tsx \
  src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx \
  src/components/pieceControl/__tests__/CanonicalFabReleasePanel.test.tsx

Test Files  4 passed (4)
Tests       63 passed (63)
```

Task 1–7 regression:

```text
npx vitest run \
  src/lib/pieceControl/__tests__/revisionExposure.test.ts \
  src/lib/pieceControl/__tests__/pieceIntelligenceDerive.test.ts \
  src/lib/pieceControl/__tests__/pieceIntelligenceRepository.test.ts \
  src/pages/pieceRegister/__tests__/pieceRegisterLocation.test.ts \
  src/pages/pieceRegister/__tests__/overviewDerive.test.ts \
  src/pages/pieceRegister/__tests__/PieceRevisionImpactView.test.tsx \
  src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx \
  src/pages/pieceRegister/__tests__/PieceRegister.test.tsx \
  src/components/pieceControl/__tests__/CanonicalFabReleasePanel.test.tsx

Test Files  9 passed (9)
Tests       113 passed (113)
```

## Final verification

- `npm test`: 431 files passed, 3,951 tests passed.
- `npm run typecheck`: passed.
- `npm run typecheck:strict`: passed with 0 enforced errors.
- Scoped ESLint over all four modified source/test files: passed with 0 errors
  and 0 warnings.
- `npm run check:no-new-js`: passed.
- `git diff --check`: passed.
- `npm run build`: passed (existing Vite chunk-size advisory only).

## Inherited concern

`npm run typecheck:noimplicitany` remains red with 27 enforced diagnostics in
unchanged pre-Task7 files from earlier Piece Intelligence tasks and the existing
Integrations test. No diagnostic remains in a Task 7 modified file. Fixing those
files would exceed the controller's exact Task 7 file scope; the failure is
reported rather than hidden or added to a grandfather list.

## Fix Round 1 — review findings

- Added an idempotent `piece_intelligence` migration that replaces the three
  existing restrictive `drawing_impacts` write-floor policies with PM floors
  for `INSERT`, `UPDATE`, and `DELETE`. Existing permissive project-access and
  read policies are untouched.
- Hid the fabrication-release navigation for viewer/field users and prevented
  direct Board URLs from mounting `CanonicalFabReleasePanel` below PM. The
  existing release RPC/panel remains the sole release authority.
- Reset unfinished hold editor state and its reason whenever the digital thread
  changes pieces.
- Kept create status canonically `open` without rendering a create-status
  selector; edit status and resolve remain available.
- Replaced free-text assignee input with a native select hydrated through the
  established `project-members` / `user-profiles-by-ids` query authorities.
  Options use real membership `user_id` UUIDs, show profile/role labels where
  available, allow unassigned, and fail closed while loading or unavailable.

### Fix-round RED/GREEN evidence

Initial focused RED (before production or migration changes):

```text
npx vitest run \
  src/pages/pieceRegister/__tests__/PieceRegister.test.tsx \
  supabase/migrations/__tests__/pieceIntelligenceDrawingImpactRoleFloor.test.js

Test Files  2 failed (2)
Tests       4 failed | 49 passed (53)
```

The migration contract failed with `ENOENT`; UI failures proved the missing PM
member query, cross-piece hold reset, create-status removal, and native member
select/loading behavior. After adding an async Board-readiness barrier, the
direct viewer/field URL regression separately failed `2/2` because the canonical
release panel mounted for both roles.

Final focused GREEN:

```text
Test Files  2 passed (2)
Tests       57 passed (57)
```

Task 1–7 plus migration contract regression:

```text
Test Files  10 passed (10)
Tests       122 passed (122)
```

### Fix-round final verification

- `npm test`: 432 files passed, 3,960 tests passed.
- `npm run typecheck`: passed.
- `npm run typecheck:strict`: passed with 0 enforced errors.
- Scoped ESLint over all modified source/test files: passed.
- `npm run check:no-new-js`: passed.
- `git diff --check`: passed.
- `npm run build`: passed (existing Vite chunk-size advisory only).
- `npm run typecheck:noimplicitany`: same 27 inherited diagnostics in unchanged
  files; no diagnostic in a Task 7 or fix-round file.

## Fix Round 2 — assignment authority and terminal timestamps

- Added a follow-up migration without modifying the already-pushed PM-floor
  migration. `list_drawing_impact_assignees(p_project_id)` is a project-scoped,
  PM-authorized security-definer RPC that returns only `user_id`, a computed
  `display_name`, and `project_role`. Its default/API grants are revoked before
  authenticated execution is granted explicitly. Existing `user_projects` RLS
  policies remain unchanged.
- Added a locked-down security-definer trigger on `drawing_impacts` so every
  direct insert/update rejects a non-null `assigned_to` unless that UUID is a
  member of the row's project. This enforces the invariant when the browser and
  client-side roster validation are bypassed.
- Replaced the admin-shaped `UserProject`/`User` reads in Piece Register with
  the narrow roster RPC. The response is runtime-validated, and loading, RPC
  errors, and malformed responses keep assignment and Save fail-closed.
- Changed edit timestamp derivation so active-to-terminal sets `resolved_at`,
  terminal-to-terminal preserves the persisted value, and reopening clears it.

### Fix-round 2 RED/GREEN evidence

Initial focused RED, before the migration or production changes:

```text
npx vitest run \
  src/pages/pieceRegister/__tests__/PieceRegister.test.tsx \
  supabase/migrations/__tests__/pieceIntelligenceDrawingImpactAssignmentAuthority.test.ts

Test Files  2 failed (2)
Tests       9 failed | 52 passed (61)
```

The four migration tests failed because the follow-up authority did not exist.
The page failures proved the old admin-only membership reads, missing roster
loading/error closure, and terminal-to-terminal timestamp overwrite.

Final Task 7, migration, and canonical-release regression:

```text
npx vitest run \
  src/pages/pieceRegister/__tests__/PieceRegister.test.tsx \
  src/components/pieceControl/__tests__/CanonicalFabReleasePanel.test.tsx \
  supabase/migrations/__tests__/pieceIntelligenceDrawingImpactRoleFloor.test.ts \
  supabase/migrations/__tests__/pieceIntelligenceDrawingImpactAssignmentAuthority.test.ts

Test Files  4 passed (4)
Tests       70 passed (70)
```

### Fix-round 2 final verification

- `npm test`: 433 files passed, 3,968 tests passed.
- `npm run typecheck`: passed.
- `npm run typecheck:strict`: passed with 0 enforced errors.
- `npm run typecheck:noimplicitany`: passed with 0 enforced errors.
- Scoped ESLint over the modified TypeScript source/tests: passed.
- `npm run check:no-new-js`: passed.
- `git diff --check`: passed.
- `npm run build`: passed (existing Vite chunk-size advisory only).

### Database verification boundary

Both Task 7 migrations have static SQL contract coverage. No authorized
disposable database was available, so this report makes no live migration, RPC,
trigger, or RLS execution claim.
