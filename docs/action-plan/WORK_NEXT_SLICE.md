# Action-plan next slice — modal `withProjectId` + toast hygiene

**Branch / PR:** `cursor/action-plan-modal-scoping-d3a1`  
**Dates:** 2026-07-26  
**Prior open:** PR **#133** (RegisterFetchBody / page toast hygiene — ID 18) still unmerged

## Code

### ID 50 — write shaping on modal creates

| Modal | Change |
|---|---|
| `ActionItemFormModal` | Fallback create uses `withProjectId`; **prefers parent `onSave` for create+edit** (fixes ActionItems page create bypassing page `createMut`) |
| `ScopeItemFormModal` | Create mutation uses `withProjectId` |
| `DeliveryFormModal` | Create uses `withProjectId` |
| `PhotoUploadModal` | `Photo.create(withProjectId(...))` |
| `RiskFormModal` | Create uses `withProjectId` |
| `ResourceFormModal` | Create uses `withProjectId` |
| `ProductionNoteFormModal` | Create stamps from form/`projectId` prop (multi-project meeting notes) |

Skipped intentionally: Contacts / Vendors / Projects; drawing/submittal upload pipelines.

### ID 48 — toast pattern

`toUserErrorMessage` on the modals above + `PhotoGallery`, `Expenses`, `ScopeExclusions`, `ProductionNotes` mutation errors.

## Tracker

| ID | Status | Note |
|---|---|---|
| **50** | In Progress | Modal creates advanced; ad hoc remain |
| **48** | In Progress | Advanced; not universal |
| **18** | Done on **#133** (not yet on `main`) | — |

## Validation

```bash
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
npx eslint src/components/{actionitems,scope,deliveries,photos,risks,resources,productionnotes}/**/*.{js,jsx} \
  src/pages/{Expenses,ScopeExclusions,ProductionNotes}.jsx --quiet
```
