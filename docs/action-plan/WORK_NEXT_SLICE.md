# Action-plan next slice — Constraints + Procurement loading gates

**Branch / PR:** `cursor/action-plan-constraints-proc-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)  
**Open siblings:** #139 · #140 · #141 · #142 · #143

## Code (ID 18)

| File | Change |
|---|---|
| `Constraints.jsx` | Page-shell `LoadingSkeleton` + error/retry (mutations already hygienic) |
| `Procurement.tsx` | Page-shell `LoadingSkeleton` + error/retry before ControlCenter |

## Still open

- Merge #139–#143
- LookAheadSchedule / AlertsCenter / LEMs: text → skeleton + error
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- **Blocked:** 102

## Validation

```bash
npx eslint src/pages/Constraints.jsx src/pages/Procurement.tsx --quiet
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
```
