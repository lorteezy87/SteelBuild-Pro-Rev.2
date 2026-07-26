# Duplicate inventory (Tasks 1–2)

Known near-duplicates and the **canonical** choice. Prefer the canonical path for new work; delete or thin-re-export leftovers only when imports/tests allow.

| Duplicate | Variants | Canonical | Disposition |
| --- | --- | --- | --- |
| FilterBar | `src/components/command/FilterBar.tsx` vs page-local `src/pages/{rfis,expenses,constraints,financials}/FilterBar.*` | **Page-local** FilterBars for domain-specific controls; **command** `FilterBar` for command-deck chrome | Keep both roles — do not merge into one mega-FilterBar without a product decision |
| Drawing register grid | `DrawingRegisterGrid.tsx` vs `DrawingRegisterGridPanel.tsx` | **`DrawingRegisterGridPanel`** (DocControlPanel) | Legacy `DrawingRegisterGrid` kept for unit tests; comment marks Panel as canonical |
| Impact board | `ImpactBoard.tsx` vs `ImpactBoardPanel.tsx` | **`ImpactBoardPanel`** (DocControlPanel) | `ImpactBoard.tsx` is a thin re-export of the Panel |
| app-params | `src/lib/app-params.js` vs `src/lib/env.ts` | **`src/lib/env.ts`** | `app-params.js` **deleted** (zero importers) |
| Routes registry | `src/routes.js` vs `src/config/routes.js` | **`src/config/routes.js`** | `src/routes.js` shim **retained intentionally** for `@/routes` importers |
| BulkActionBar (RFIs) | `src/pages/rfis/BulkActionBar.jsx` vs `src/components/design-system/BulkActionBar.jsx` | **design-system** | Orphan page-local file **deleted**; RFIs imports design-system |
| WeeklySummary | `src/components/dailylogs/WeeklySummary.jsx`, `src/pages/reports/WeeklySummary.jsx` | N/A (unused) | Both **deleted** (zero importers; PortfolioOverview mention was comment-only) |
| Legacy PDF viewer folder | `src/components/viewer/` vs `src/components/drawings/viewer/` | **`src/components/drawings/viewer/`** | Dead `src/components/viewer/` **deleted** |
| Status pills / badges | `design-system/StatusPill`, `shared/StatusBadge`, `desktop/module/StatusPill`, command `Pill` | **`design-system/StatusPill`** for app chrome; **command `Pill`** for control-center decks; **`StatusBadge`** for dense register cells | Keep role separation (ID 56). Prefer enums from `src/lib/enums.ts` for status strings. Do not merge into one mega-pill without a product decision. |

## Notes

- Do **not** delete `DrawingRegisterGrid.tsx` while `__tests__/DrawingRegisterGrid.test.tsx` still targets it.
- New Doc Control UI work extends `*Panel` components and `DocControlPanel`, not the legacy grid/board bodies.
- When retiring a duplicate, verify with ripgrep (app + tests) before delete; prefer thin re-export over silent behavior change if an export name is still referenced.
