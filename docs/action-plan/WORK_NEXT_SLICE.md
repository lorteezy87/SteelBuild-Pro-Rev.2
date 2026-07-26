# Action-plan next slice — Email accounts + Doc Control register hygiene

**Branch / PR:** `cursor/action-plan-email-review-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)  
**Open siblings:** #139 (DMS Upload/Edit), #140 (Contacts/LinkedFolder/Vendors)

## Code (IDs 18 / 48 / 50)

| File | Change |
|---|---|
| `EmailAccountSettings.jsx` | `EmailAccount.create(withProjectId)` + toast helper + `LoadingSkeleton` |
| `ReviewQueue.tsx` | `DrawingReview.create(withProjectId)` + toast/error helper + skeleton |
| `ReviewQueuePanel.tsx` | loading/error chrome parity (mutations already clean) |
| `TransmittalLog.tsx` | transmittal + item create via `withProjectId` + toast/skeleton |
| `TransmittalLogPanel.tsx` | loading/error chrome parity (mutations already clean) |

## Still open

- Merge #139 / #140
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- **Blocked:** 102

## Validation

```bash
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
npx eslint src/components/email/EmailAccountSettings.jsx \
  src/components/drawings/register/{ReviewQueue,ReviewQueuePanel,TransmittalLog,TransmittalLogPanel}.tsx \
  --quiet
```
