# Action-plan next slice — DMS create + toast hygiene

**Branch / PR:** `cursor/action-plan-dms-scoping-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)

## Code (IDs 50 / 48)

| File | Change |
|---|---|
| `UploadModal.jsx` | `Document.create(withProjectId(...))` + toast helper |
| `LinkedFolderBrowser.jsx` | Import-path `Document.create(withProjectId(...))` + toast helper |
| `DocumentEditModal.jsx` | Update payload stamped via `withProjectId` + toast helper |
| `DocumentDetailPanel.jsx` | Download/share errors via `toUserErrorMessage` |

**Skipped:** `DocumentStorageSettings.jsx` (open stale claim `opus-phase1-batch1` on that file).

## Still open

- LinkedFolder create in DocumentStorageSettings
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- **Blocked:** 102

## Validation

```bash
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
npx eslint src/components/dms/{UploadModal,DocumentEditModal,LinkedFolderBrowser,DocumentDetailPanel}.jsx --quiet
```
