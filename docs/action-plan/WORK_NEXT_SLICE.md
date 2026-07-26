# Action-plan next slice — commercial + inbox toast/create hygiene

**Branch / PR:** `cursor/action-plan-commercial-toasts-d3a1`  
**Dates:** 2026-07-26  
**Open siblings:** #133 (ID 18) · #134 (modals) · #135 (import/Doc Control)

## Code

### ID 50 — fail-closed creates

| File | Change |
|---|---|
| `Backcharges.jsx` | `createBackcharge` / `addTmTicket` via `withProjectId` |
| `PayApplications.jsx` | `assertProjectId(projectId)` before `createPayApplication` |
| `SOV.jsx` | Import `bulkCreate` rows mapped through `withProjectId` |

### ID 48 — toast pattern

`toUserErrorMessage` on Backcharges, PayApplications (incl. RLS-aware create), EmailInbox page mutations, Documents residual folder/doc toasts, SOV bulk + import catches. Keeps PM+ RLS messaging on Backcharges/PayApps creates.

## Still open

- Upload pipelines, Contacts/Vendors/Projects
- Large page thins 21 / 23 / 27
- Photos/Safety loading polish (after #133)

## Validation

```bash
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts \
  src/lib/__tests__/importSovSpreadsheet.test.js
npx eslint src/pages/{Backcharges,PayApplications,Documents,SOV}.jsx src/pages/EmailInbox.tsx --quiet
```
