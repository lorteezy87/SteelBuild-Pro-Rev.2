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

### Database and membership verification boundary

The PM-floor migration is covered by a static contract test only; no disposable
database was available, so this report makes no live RLS claim. The established
`user_projects` SELECT policy may return only the current user's membership to a
non-admin PM. The selector deliberately shows only real rows that RLS returns;
expanding membership-read authority or adding a roster RPC was outside this
fix's authorized migration scope.
