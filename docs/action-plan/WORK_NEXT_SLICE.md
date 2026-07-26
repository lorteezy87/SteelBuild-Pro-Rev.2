# Action-plan next slice — Photos + Safety loading/empty (ID 18)

**Branch / PR:** `cursor/action-plan-photos-safety-loading-d3a1`  
**Dates:** 2026-07-26  
**Open siblings:** #133–#136

## Code

INLINE loading/empty/error gates (uses existing `LoadingSkeleton` — **does not** depend on #133 `RegisterFetchBody`):

| Page | Change |
|---|---|
| `Photos.jsx` | `isLoading` / `isError` + Retry; gallery only after fetch settles (stops empty flash) |
| `Safety.jsx` | Skeleton while loading; error+Retry; true-empty CTA vs filter-empty Clear Filters |

## Tracker

| ID | Status | Note |
|---|---|---|
| **18** | In Progress | Photos/Safety gated; #133 covers thin CRUD RegisterFetchBody — Done when both merge |

## Validation

```bash
npx eslint src/pages/Photos.jsx src/pages/Safety.jsx --quiet
```
