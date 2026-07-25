# Action-plan next slice — `withProjectId` + tracker checkpoint

**Branch:** `cursor/action-plan-next-slice-d3a1`  
**Dates:** 2026-07-25 (initial) · 2026-07-26 (adoption continuation)

## Code

Added `withProjectId()` in `src/lib/mutations/standardMutation.ts`:

- Calls `assertProjectId` (fails closed when no active project)
- Forces `project_id` to the active project when a mismatched value is supplied
- Covered by unit tests in `standardMutation.test.ts`

### Creates wired (2026-07-25)

| Area | Files |
|---|---|
| Field / QC | `Punchlist`, `FieldToday`, `Inspections`, `Safety`, `QualityControl`, `Warranty`, `ChangeRequests`, `ProjectCloseout` |
| Cost | `costCodeSave.ts`, `Expenses`, `BudgetHours` |
| Drawings / Doc control | `Drawings`, `TransmittalLogPanel` |
| Schedule / resources | `Schedule`, `WbsBuilderModal`, `ResourceScheduling` |

### Adoption continuation (2026-07-26)

| Area | Work |
|---|---|
| Submittals (ID 21) | Extracted `submittalMutationHelpers.ts` + tests; create/round/sheet/bulk paths use `withProjectId` + shared toast/error helpers |
| Commercial | `ChangeOrders`, `SOV`, `Procurement`, `Documents` (folder creates) |
| Toasts (ID 48) | `toUserErrorMessage` on Safety/Inspections/Procurement/SOV/Documents mutation errors |
| RFIs (ID 23) | Extracted `rfiMutationHelpers.ts` + tests; create/alert/doc attach + bulk toast helpers |
| Ops / field | `ActionItems`, `DailyLogs`, `Constraints`, `LookAheadSchedule`, `WorkPackages` (+ bulk prep), `FieldToday` photos |
| Cross-page create | `EscalateModal`, `emailInbox/modals` entity + document creates |

## Tracker IDs moved to Done (2026-07-25 checkpoint)

19, 43, 64, 68, 70, 84, 89, 92, 94, 95, 97, 99, 103, 104, 105

## Still In Progress (intentionally)

- Large page thinning: **21** / **23** (helpers started; shells still large), **27** Drawings
- Universal mutation/toast adoption: 18, **48**, **50**, 51, **52**, 53, 54, 56 — advanced on flagship + ops pages, not universal
- UX / UAT: 20, 75, 77, 80, 81, 83, 87, 88
- **Blocked:** 102 (interactive UAT — staging credentials + GH Actions billing)

## Validation

```bash
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts \
  src/pages/submittals/__tests__/submittalMutationHelpers.test.ts \
  src/pages/rfis/__tests__/rfiMutationHelpers.test.ts \
  src/pages/workPackages/__tests__/creation.test.ts
npx eslint <touched files> --quiet
npm run typecheck
```
