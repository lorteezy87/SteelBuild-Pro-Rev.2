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
