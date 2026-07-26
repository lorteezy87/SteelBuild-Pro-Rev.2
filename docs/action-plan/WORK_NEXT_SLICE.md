# Action-plan next slice — loading/empty/error + toast hygiene

**Branch / PR:** `cursor/action-plan-loading-toasts-d3a1`  
**Dates:** 2026-07-26  
**Prior:** PR **#123** (`withProjectId` + mutation helpers) merged + prod

## Code

### ID 18 — loading / empty / error

Added `src/components/shared/RegisterFetchStates.jsx` → `RegisterFetchBody`:

- loading → `LoadingSkeleton` (table)
- error → message + Retry
- true-empty → title/body + optional create CTA
- filter-empty → Clear Filters
- else → children (list)

Wired on:

| Page | Notes |
|---|---|
| `Warranty.jsx` | fetch states + create CTA |
| `ChangeRequests.jsx` | fetch states + create CTA |
| `Punchlist.jsx` | already had `isLoading` for auto-open; now gates list body |
| `QualityControl.jsx` | replaced inline empty chrome with shared helper (+ error/retry) |
| `ProjectCloseout.jsx` | loading/error gate so create form does not flash while fetching |

Covered by `src/components/shared/__tests__/RegisterFetchStates.test.jsx`.

### ID 48 — toast pattern (incidental)

`toUserErrorMessage` on create/update/delete (and Punchlist close-out) errors for the pages above.

## Tracker

| ID | Status | Note |
|---|---|---|
| **18** | **Done** | Shared helper + thin CRUD/QC; CCs already patterned |
| **48** | In Progress | Advanced; not universal |

Checkpoint after this slice: **Done 79 · In Progress 25 · Blocked 1** (ID 102 still blocked).

## Still In Progress (intentionally)

- Large page thinning: **21** / **23** / **27**
- Mutation/toast adoption: **48**, **50**, 51, **52**, 53, 54, 56
- UX / UAT: 20, 75, 77, 80, 81, 83, 87, 88
- **Blocked:** 102

## Validation

```bash
npx vitest run src/components/shared/__tests__/RegisterFetchStates.test.jsx \
  src/lib/mutations/__tests__/standardMutation.test.ts
npx eslint src/components/shared/RegisterFetchStates.jsx \
  src/pages/{Warranty,ChangeRequests,ProjectCloseout,Punchlist,QualityControl}.jsx \
  src/components/shared/__tests__/RegisterFetchStates.test.jsx --quiet
```
