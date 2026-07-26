# Optimistic update review matrix (ID 51)

**Status:** Done for critical paths — 2026-07-26 closeout sweep  
**Helpers:** `src/lib/mutations/optimisticCache.ts` (+ unit tests)

| Path | Optimistic? | Rollback on error | Evidence |
|---|---|---|---|
| `useDrawings` update | Yes | Restores previous list via `shouldRollbackOptimistic` | `useDrawings.ts` |
| `useDrawings` bulk stage | Yes | Restores previous list | same |
| `useSubmittals` update | Yes | Restores previous list | `useSubmittals.ts` |
| Production Notes quick edits | Yes | onError invalidate / restore (prior PR) | `ProductionNotes.jsx` |
| Project Closeout checklist | Yes | onError restore (prior PR) | `ProjectCloseout.jsx` |
| Field Today | Partial | Reviewed; residual invalidate-on-error | `FieldToday.jsx` |
| Create / delete mutations | No (invalidate) | N/A — fail closed with toast | hooks above |

Pure patch/rollback helpers are covered by `src/lib/mutations/__tests__/optimisticCache.test.ts`. Universal optimistic adoption across every page is **not** required for Done — critical register paths must not leave stale cache after failed writes.
