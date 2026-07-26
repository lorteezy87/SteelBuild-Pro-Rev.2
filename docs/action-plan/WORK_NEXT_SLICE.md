# Action-plan next slice — EmailInbox + SOV loading gates

**Branch / PR:** `cursor/action-plan-commercial-loading-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)  
**Open siblings:** #139–#145

## Code (IDs 18 / 48)

| File | Change |
|---|---|
| `EmailInbox.tsx` | List loader → `LoadingSkeleton` + error/retry via `toUserErrorMessage` |
| `SOV.jsx` | Page-shell `LoadingSkeleton` + error/retry before `SovControlCenter` |

## Still open

- Merge #139–#145 (+ this)
- BudgetHours page-shell gates + preset toast
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- **Blocked:** 102

## Validation

```bash
npx eslint src/pages/EmailInbox.tsx src/pages/SOV.jsx --quiet
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
```
