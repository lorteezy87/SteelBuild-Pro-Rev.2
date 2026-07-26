# Action-plan next slice — CSV import + Doc Control create scoping

**Branch / PR:** `cursor/action-plan-import-doccontrol-d3a1`  
**Dates:** 2026-07-26  
**Open siblings:** [#133](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/133) (ID 18), [#134](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/134) (modal scoping)

## Code

### ID 50 — fail-closed creates

| File | Change |
|---|---|
| `ExpenseImportModal.jsx` | Row creates via `withProjectId(..., activeProject.id)` |
| `ChangeOrderImportModal.jsx` | Row creates via `withProjectId(..., chosenProjectId)` |
| `ReviewQueuePanel.tsx` | `DrawingReview.create(withProjectId(...))` |
| `ImpactBoardPanel.tsx` | `DrawingImpact.create(withProjectId(...))` |
| `RFIFormModal.jsx` | Fallback create uses `buildRfiCreatePayload` (assert + stamp) |

### ID 48 — toast pattern

`toUserErrorMessage` on the above paths + `TransmittalLogPanel`, `ResourceScheduling`, `ResourceHub`, ActionItems bulk updates.

## Still open (intentionally)

- Drawing/submittal **upload** pipelines
- Contacts / Vendors / Projects
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)

## Validation

```bash
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts \
  src/pages/rfis/__tests__/rfiMutationHelpers.test.ts
npx eslint <touched files> --quiet
```
