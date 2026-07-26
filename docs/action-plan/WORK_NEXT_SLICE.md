# Action-plan next slice — LookAhead / Alerts / LEMs loading gates

**Branch / PR:** `cursor/action-plan-ops-loading-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)  
**Open siblings:** #139–#144

## Code (IDs 18 / 48)

| File | Change |
|---|---|
| `LookAheadSchedule.jsx` | Table loader → `LoadingSkeleton` + error/retry; delete toast helper |
| `AlertsCenter.jsx` | Text loader → skeleton + error/retry |
| `useAlerts.ts` | Expose `isError`/`error`; refresh toast via `toUserErrorMessage` |
| `LEMs.jsx` | Page-shell skeleton + combined query error/retry |

## Still open

- Merge #139–#144 (+ this)
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- **Blocked:** 102

## Validation

```bash
npx eslint src/pages/LookAheadSchedule.jsx src/pages/AlertsCenter.jsx src/pages/LEMs.jsx src/hooks/useAlerts.ts --quiet
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
```
