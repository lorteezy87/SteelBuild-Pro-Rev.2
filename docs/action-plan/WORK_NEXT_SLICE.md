# Action-plan next slice — DailyLogs isError gate

**Branch / PR:** `cursor/action-plan-dailylogs-iserror-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)  
**Open siblings:** #139–#147 (do not assume merged; avoid their file sets)

## Code (ID 18)

| File | Change |
|---|---|
| `DailyLogs.jsx` | INLINE `isError` + retry after existing `LoadingSkeleton` (Photos/Safety twin); `toUserErrorMessage` |

## Ranked next (after this)

1. **Expenses + ExpenseTable** — raw `Loading...` → `LoadingSkeleton` + parent `isError`
2. **ContractManagement** — `subtitle="Loading..."` + homemade pulse → skeleton + `isError`
3. (this) DailyLogs `isError` — shipped on this branch

## Still open

- Merge #139–#147 (+ this)
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- Expenses / ContractManagement / Drawings raw loaders
- Deliveries / RFIs / ChangeOrders / Backcharges `isError` polish
- **Blocked:** 102

## Validation

```bash
npx eslint src/pages/DailyLogs.jsx --quiet
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
```
