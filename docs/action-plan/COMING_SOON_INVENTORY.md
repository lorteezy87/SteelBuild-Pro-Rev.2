# Coming soon / placeholder inventory (Task 71)

Generated from repository inspection on the action-plan branch. These are **intentional** incomplete surfaces unless noted.

| Feature | Status | Location | Customer-facing behavior |
|---|---|---|---|
| Outlook direct connect | coming_soon | `src/lib/integrationCatalog.js` | Listed on Integrations; not actionable |
| Gmail | coming_soon | same | same |
| QuickBooks / Sage / Vista sync | coming_soon | same | same |
| Google Drive / Dropbox | coming_soon + disabled UI | catalog + `DocumentStorageSettings.jsx` | Buttons disabled with “Coming soon” |
| MS Project export | coming_soon | catalog | Listed only |
| Primavera P6 | coming_soon | catalog | Listed only |
| Autodesk / BIM / ACC area | coming_soon | catalog | Area gated |
| SharePoint / OneDrive linked folders | setup_required | catalog + DMS | Links savable; Sync Now explicitly unavailable |
| Cost-code CSV / Budget·SOV export | custom_setup | catalog | Honest custom-setup |
| 3D viewer (`viewer_3d`) | feature-flagged | featureFlags + hub | Internal/pilot when enabled |
| Billing invoice list / AR aging | not built | BillingControlCenter comment | Do not present as live AR |

Marketing `ProductMockup` on Landing is illustrative chrome, not an operational screen.
