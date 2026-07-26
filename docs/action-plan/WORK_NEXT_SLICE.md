# Action-plan next slice — Expenses + ContractManagement loading gates

**Branch / PR:** `cursor/action-plan-expenses-contract-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)  
**Open siblings:** #139–#148

## Code (ID 18)

| File | Change |
|---|---|
| `ExpenseTable.jsx` | `Loading...` → `LoadingSkeleton`; error/retry panel |
| `Expenses.jsx` | Pass `isError` / `toUserErrorMessage` / `refetch` into table |
| `ContractManagement.jsx` | Homemade pulse → skeleton; combined query error/retry |

## Still open

- Merge #139–#148 (+ this)
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- **Blocked:** 102

## Validation

```bash
npx eslint src/pages/Expenses.jsx src/pages/expenses/ExpenseTable.jsx src/pages/ContractManagement.jsx --quiet
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
```
