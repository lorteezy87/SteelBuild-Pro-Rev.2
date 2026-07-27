# TypeScript conversion inventory (priority business rules)

Snapshot for Phase 2/3 planning. Convert with **real types** when touching these areas — do not mass-rename.

## Converted in this effort

| Module | Notes |
|---|---|
| `src/lib/fabReleaseGate.ts` | Fab release readiness gate |
| `src/lib/fabStatus.ts` | Fab status helpers |
| `src/lib/drawingUploadUtils.ts` | Drawing upload / sheet match |
| `src/lib/drawingEnums.ts` | Drawing CHECK-enum guards |
| `src/lib/submittalStageMapping.ts` | Submittal → stage mapping |
| `src/lib/importShippingList.ts` | Shipping-list import parser |
| `src/lib/importProductionStatus.ts` | Production-status import |
| `src/lib/entityPredicates.ts` | Shared entity predicates |
| `src/lib/exports/fabRelease.ts` | Fab-release export |
| `src/components/shared/useAppSecurity.ts` | Auth identity + project_id write shaping (no localStorage identity) |

## Still JS — convert next when actively repaired

| Area | Paths |
|---|---|
| Drawing set ordering | `src/lib/drawingSetOrdering.js` |
| Drawing hub engines | `src/lib/drawingHub.js`, `src/lib/drawingHub/*.js` |
| Submittal engines | `src/lib/submittalReviewEngine.js`, `submittalAnalytics.js`, `submittalSmartTriggers.js` |
| Import / reconciliation | `importDrawingLog.js`, `importFabSuiteXml.js`, `importModelElements.js`, `importChangeOrderCsv.js`, `importSovSpreadsheet.js`, `importPsrSpreadsheet.js`, `importShippingTicket.js`, `importRfiCsv.js`, `importRfiLog.js`, `rfiImportUtils.js`, `dataExchange.js` |
| IFC roster | `src/services/ifcRosterImport.js` |
| PDF exports | `src/lib/exports/markupPDF.js`, `revisionImpactPDF.js` |

Already TypeScript in priority domains (leave alone unless improving types): piece-control under `src/lib/pieceControl/` (and related), `marginRiskEngine.ts`, `submittalTransitions.ts`, permissions services, most fab-release helpers under `src/lib/fabRelease/`.
