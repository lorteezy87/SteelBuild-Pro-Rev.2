# Action-plan next slice — `withProjectId` + tracker checkpoint

**Branch:** `cursor/action-plan-next-slice-d3a1`  
**Date:** 2026-07-25

## Code

Added `withProjectId()` in `src/lib/mutations/standardMutation.ts`:

- Calls `assertProjectId` (fails closed when no active project)
- Forces `project_id` to the active project when a mismatched value is supplied
- Covered by unit tests in `standardMutation.test.ts`

Wired into high-traffic creates:

| Area | Files |
|---|---|
| Field / QC | `Punchlist`, `FieldToday`, `Inspections`, `Safety`, `QualityControl`, `Warranty`, `ChangeRequests`, `ProjectCloseout` |
| Cost | `costCodeSave.ts`, `Expenses`, `BudgetHours` |
| Drawings / Doc control | `Drawings`, `TransmittalLogPanel` |
| Schedule / resources | `Schedule`, `WbsBuilderModal`, `ResourceScheduling` |

Also scoped QC invalidate to `["qc-records", projectId]` where touched.

## Tracker IDs moved to Done (checkpoint)

19, 43, 64, 68, 70, 84, 89, 92, 94, 95, 97, 99, 103, 104, 105

## Still In Progress (intentionally)

- Large page thinning: 21 / 23 / 27 (and related)
- Universal mutation/toast adoption: 18, 48, 50, 51, 52, 53, 54, 56
- UX / UAT: 20, 75, 77, 80, 81, 83, 87, 88
- **Blocked:** 102 (interactive UAT — staging credentials + GH Actions billing)

## Validation

Run on branch before merge:

```bash
npm run lint
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
npm run typecheck
```
