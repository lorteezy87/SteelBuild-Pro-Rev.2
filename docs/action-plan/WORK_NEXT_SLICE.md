# Action-plan — post-deploy checkpoint (2026-07-26)

**Merged + prod:** #133 · #134 · #135 · #136 · #137 → https://www.steelbuild-pro.com  
**Deployment:** `dpl_3HLTVWMirhvfe7rASEc6XPBmpKyL`

| ID | Status | What shipped |
|---|---|---|
| **18** | In Progress | `RegisterFetchBody` + Photos/Safety INLINE + ActionItems page-shell gates (draft); not universal |
| **48** | In Progress | Toast hygiene across modals/import/Doc Control/commercial/inbox — not universal |
| **50** | In Progress | `withProjectId` on modals, CSV imports, Doc Control creates, Backcharges/SOV import — upload pipelines + org-level remain |
| **102** | Blocked | Interactive UAT + GH Actions billing |

## Open drafts (do not assume merged)

| PR | Slice |
|---|---|
| **#139** | DMS Upload/Edit/LinkedFolderBrowser create+toast |
| **#140** | Contacts/DocumentStorageSettings/Vendors |
| **#141** | EmailAccount/ReviewQueue/TransmittalLog |
| **#142** | Inspections/ProductionNotes |
| **this** | ActionItems page-shell `LoadingSkeleton` + error/retry (ID 18) |

## Next slices (suggested)

- Constraints / Procurement page-shell loading gates (same CC-peer pattern)
- LookAheadSchedule / AlertsCenter / LEMs: text loaders → `LoadingSkeleton` + error
- Large page thins 21 / 23 / 27
- Concurrent-edit E2E (52)
