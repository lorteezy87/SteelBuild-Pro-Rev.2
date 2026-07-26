# Action-plan next slice — Contacts + LinkedFolder hygiene

**Branch / PR:** `cursor/action-plan-contacts-dms-d3a1`  
**Dates:** 2026-07-26  
**Prior prod:** #133–#137 deployed (`dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`)  
**Open sibling:** #139 (DMS Upload/Edit/LinkedFolderBrowser) — not yet merged

## Code (IDs 18 / 48 / 50)

| File | Change |
|---|---|
| `Contacts.jsx` | `RegisterFetchBody` loading/error/empty; `Contact.create/update` via `withProjectId`; toast helper |
| `ContactFormModal.jsx` | create `withProjectId(data, data.project_id \|\| projectId)` + toast helper |
| `DocumentStorageSettings.jsx` | `LinkedFolder.create(withProjectId(...))` + toast helper (stale claim overridden) |
| `Vendors.jsx` | org-level toast helper only (no `withProjectId`) |

## Still open

- Merge #139 DMS Upload/Edit/LinkedFolderBrowser
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
- **Blocked:** 102

## Validation

```bash
npx vitest run src/lib/mutations/__tests__/standardMutation.test.ts
npx eslint src/pages/Contacts.jsx src/components/contacts/ContactFormModal.jsx src/components/dms/DocumentStorageSettings.jsx src/pages/Vendors.jsx --quiet
```
