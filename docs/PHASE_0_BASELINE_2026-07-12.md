# PHASE 0 — Baseline Readiness Report (2026-07-12)

## Context
- Archive/source commit: `11a28fced549840c0a44fc4b6d7182e834cdb363`
- Baseline version: `2.1.1`
- Repository: `https://github.com/lorteezy87/SteelBuild-Pro-Rev.2`

## Baseline Measurement Snapshot (source facts)
- Approx. repository files (excluding install/build output): **1,801**
- Production JS/TS files: **1,082**
- Production JS/TS lines: **~271,251**
- Test files: **242**
- Initial route entries: **83**
- Active migrations: **29**
- Edge functions (plus _shared): **8**
- Large production files: **131** files over 1,000 lines, **18** files over 500 lines
- `command_ui` appears across many parent/helper files.

## Baseline Validation State (source facts)
- `npm install`: passed
- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run typecheck:js`: passed
- `npm run typecheck:strict`: initially reported **1** enforced error
- `npm run typecheck:noimplicitany`: initially reported **3** enforced errors
- `npm test`: initially **2,947** passing, **6** failing
- `npm run build`: passed with warnings

## Build Warnings (must remain documented)
- ✅ Closed: Unresolved `/photos/desktop/_raw/FieldHub.png` (replaced with `/photos/desktop/FieldHub.webp`)
- ✅ Closed: Malformed CSS comment containing `desk-*/sbd-*`
- Open: Large bundles (especially `web-ifc`) over 500 kB *(must not be suppressed without bundle-size measurement and explicit review)*  

## Phase 1 Placeholder Remediation

### Batch 5 — Warning remediation
- ✅ Closed: FieldHub hero asset reference updated in `src/pages/dashboard/dashboardTheme.css`.
- ✅ Closed: Command command-scope CSS comment syntax fixed in `src/styles/command.css`.
- ⏳ Open: Oversized bundle warning remains; do not suppress without measurement.

### Batch 6 — 3D tab lazy-loading
- ✅ Closed: `Model3DTab` is now a separate lazy chunk in `src/pages/DrawingSubmittalHub.tsx`.
- ✅ Closed: Drawings/Summary control-center route footprint dropped from ~222.16 KB to ~197.27 KB.
- ✅ Closed: Gzip footprint dropped from ~60.24 KB to ~52.98 KB.
- ✅ Closed: `Model3DTab` chunk is now approximately 28.10 KB / 9.56 KB gzip.
- ✅ Closed: Large `model-elements` query now defers until `show3d` is true and `activeTab === "model3d"`.
- ✅ Closed: `web-ifc` remains on-demand.
- ⚠️ Oversized-chunk warning remains open; do not suppress it without explicit measurement and review.

### Batch 7 — Data removal + synthetic replacements
- ✅ Closed: Tracked export payloads were removed from repository source via `git rm`, including `exports/SteelBuild-Pro-Skyport-Redfield.xlsx`, `exports/data/skyport_core.json`, `exports/data/skyport_drawings.json`, `exports/data/skyport_rfis.json`, `exports/data/skyport_schedule.json`, `exports/build_workbook.py`, `exports/app/SteelBuild-Pro-App.xlsx`, `exports/app/SteelBuild-Pro.xlsm`, `exports/app/build_app_shell.py`, `exports/app/inject_vba.ps1`, and `exports/app/vba/*`.
- ✅ Closed: `exports/` directory and `*.xlsm` are now ignored in `.gitignore` as non-source operational/customer deliverables.
- ✅ Closed: Synthetic demo values were introduced in user-facing public/demo content and PSR parser tests (project `Rivergate Logistics Center`, number `DEMO-001`/`90001`, synthetic RFI references and sheet/file identifiers).
- ✅ Closed: Export remediation policy recorded in `docs/EXPORT_DATA_POLICY.md`.
- ⚠️ Export history remains in prior Git history and is not rewritten by this batch; a separately approved owner decision is required before history remediation.

### Batch 8 — Official-number integrity
- ✅ Closed: P0-06 (official-number safety) — Work package, SOV, expense, and change-order creation paths now fail closed unless allocation succeeds.
- ✅ Closed: Work-package creation and bulk import now rely on allocator-backed numbering only (`getNextNumber`) and no longer invent fallback numbers from browser state.
- ✅ Closed: Expense creation/import now requires active project and allocator-backed numbering (`getNextNumber`), with failed allocation rows marked as failed during import.
- ✅ Closed: SOV creation now requires active project and uses `getNextNumber(activeProject.id, "SOV")` exclusively.
- ✅ Closed: CO creation now preserves user input, generates missing numbers only through `getNextFormattedNumber`, and errors if no project/number can be obtained.
- ✅ Closed: Browser-side guessing of official numbers is removed from these flows (RFI, CO, work package, SOV, expense creation/import now fail-closed on allocator failure).

### Phase 1 execution item 7
- ✅ Complete: Feature-flag authority consolidation. The typed server-backed catalog now defines all production flags, and personal overrides remain administrator-managed environment state.

### Batch 10 — Legacy and unsupported report runtime retirement
- ✅ Fully closed: **P0-02** — retired duplicate/unsupported standalone page implementations with clear compatibility routing.
- ✅ Fully closed: **P0-05** — retired unsupported server-side Job Status PDF execution paths from the production report page.
- ✅ Agent Memory is classified as **retired** (`src/pages/AgentMemory.jsx` deleted).
- ✅ Standalone Project Detail page is classified as **retired** (`src/pages/ProjectDetail.jsx` deleted); canonical project detail remains `src/pages/Projects.jsx` with `ProjectDetailView`.
- ✅ `src/boot/AppRoutes.jsx` continues to preserve compatibility redirects for legacy deep links (`/ProjectDetail?projectId=<id>` and `/ProjectDetail?id=<id>`) to `Projects?id=<id>`.
- ✅ Job Status Report still supports project list, search and filters, readiness calculations, drilldown, PSR spreadsheet import, and preview/readiness display.
- ✅ Server-PDF report generation is retired; report data path and readiness context remain.

### Batch 11 — Route lifecycle contracts and compatibility validation
- ✅ Fully closed: **P0-09** — introduced lifecycle metadata contract for route registry entries.
- ✅ Every registry route is now `active` or `internal` via `PAGE_LIFECYCLES`.
- ✅ Compatibility entry/redirect metadata is centralized in `STATIC_ROUTE_METADATA` (`/`, `/Landing`, `/GanttChart`, `/RFIHub`, `/ProjectDetail`).
- ✅ Redirect targets are now tested as mounted routes.
- ✅ `/GanttChart` is restored to the advertised route inventory.
- ✅ Route lifecycle validation now enforces labeled route metadata and mountability checks.

### Batch 12 — Permission authority consolidation
- ✅ Closed: **P0-08** — consolidated UI authorization to `usePermissions()` as the sole permission resolver.
- ✅ `useAppSecurity()` now provides only identity and write-shaping helpers (`user`, `stamp`, `assertProjectId`).
- ✅ Permission checks for `FeatureFlagsAdmin` and privileged surfaces now remain in `usePermissions()`.
- ✅ RLS/RPC remains the authoritative control for actual reads/writes and workflow state transitions.

### Batch 13 — Dormant workflow abstraction retirement
- ✅ Closed: **P0-10** — retired unused workflow and mutation abstractions.
- ✅ Legacy workflow abstraction and its tests removed (not used by production mutations).
- ✅ Generic save abstraction retired.
- ✅ Unused delivery CRUD hook retired.
- ✅ Active typed repositories remain in use:
  - `src/lib/org/repository.ts`
  - `src/lib/backcharge/repository.ts`
  - `src/lib/payapp/repository.ts`
  - `src/lib/production/repository.ts`
- ✅ Mutation authority now prefers live domain commands/repositories plus RLS/RPC (no universal workflow engine).

### Batch 14 — Budget Control canonicalization
- ✅ Batch 14 completed:
  - Made `CostHub` the canonical Budget Control surface.
  - Deleted `src/pages/Financials.jsx`.
  - Deleted `src/pages/CostDashboard.jsx`.
  - Added compatibility redirects for `/Financials` and `/CostDashboard` to `/CostHub`.
  - Added redirect entries to `STATIC_ROUTE_METADATA` and route tests.
- ✅ Began route-by-route `command_ui` retirement:
  - Budget legacy pages are retired in routing and only the canonical `CostHub` remains.
- ⚠️ **P0-07 remains in progress** (command_ui fallback retirement continues).

### Batch 15 — Reports & Insights canonicalization
- ✅ Batch 15 completed:
  - Made `ReportsHub` the canonical Reports & Insights catalog surface.
  - Removed legacy tab-shell and `command_ui` split from `src/pages/ReportsHub.jsx`.
  - Preserved all specialized report routes (`/Reports/:slug`) including Job Status, Decision Log, and Activity.
  - Kept search and category filtering via `REPORTS` + `ReportsHubControlCenter`.

### Batch 16 — Resource Register canonicalization
- ✅ Batch 16 completed:
  - Made `ResourceHub` / `ResourcesControlCenter` the canonical Resource Register surface.
  - Deleted `src/pages/ResourceManagement.jsx`.
  - Added compatibility redirect for `/ResourceManagement` → `/ResourceHub`.
  - Kept Crew Scheduling as a distinct supported workflow.

### Batch 17 — Portfolio Overview canonicalization
- ✅ Batch 17 completed:
  - Made `PortfolioHub` the canonical Portfolio Overview implementation.
  - Deleted `src/pages/AIInsights.jsx`.
  - Added compatibility redirect `/AIInsights` to `/PortfolioHub`.
  - Preserved `ExecutiveView` as a distinct supported workflow and route.
  - Kept `P0-07` in progress: command_ui fallback retirement continues.

### Batch 18 — RiskHub canonicalization
- ✅ Batch 18 completed:
  - Made `RiskHub` the canonical risk-triage surface.
  - Deleted `src/pages/MarginRisk.jsx`.
  - Preserved `/Constraints` as detailed constraint management.
  - Added compatibility redirect `/MarginRisk` to `/RiskHub`.
  - Kept `P0-07` in progress: command_ui fallback retirement continues.

### Batch 19 — Billing canonicalization
- ✅ Batch 19 completed:
  - Made `BillingControlCenter` the canonical Billing page shell.
  - Kept Stripe service calls and permission gating in `src/pages/Billing.jsx`.
  - Preserved checkout-return refetch, plan actions, and billing portal behavior.
  - Removed the classic vs command_ui branch split in `Billing.jsx`.
  - Kept `P0-07` in progress: command_ui fallback retirement continues.

### Batch 20 — Settings canonicalization
- ✅ Batch 20 completed:
  - Made `SettingsControlCenter` the canonical Settings page shell.
  - Removed classic vs command_ui branching from `src/pages/Settings.jsx`.
  - Preserved all settings sections and mutation wiring in `Settings.jsx`.
  - Kept `P0-07` in progress: command_ui fallback retirement continues.

### Batch 21 — Vendors canonicalization
- ✅ Batch 21 completed:
  - Made `VendorControlCenter` the canonical Vendors page presentation.
  - Removed the duplicate classic KPI, risk-flags, search/filter, export, and vendor-list path.
  - Preserved vendor queries, statistics, filters, exports, mutations, selection, and dialogs.
  - Kept `P0-07` in progress: command_ui fallback retirement continues.

### Batch 22 — Pay Applications canonicalization
- ✅ Batch 22 completed:
  - Made `PayApplicationsControlCenter` the unconditional Pay Applications route UI.
  - Removed the duplicate classic pay-application list and editor path.
  - Preserved G702/G703 editing, status changes, draft deletion safeguards, PDF export, audit logging, and cache invalidation.
  - Kept distinct secondary workflows and legacy compatibility routing intact.

### Batch 23 — Production Status canonicalization
- ✅ Batch 23 completed:
  - Made `ProductionStatusControlCenter` the unconditional Production Status route UI.
  - Removed the duplicate classic production header, KPI, stage, and piece-table path.
  - Preserved production imports, project-scoped queries, drawing-link coverage, filters, CSV export, loading state, and cache invalidation.
  - Kept `P0-07` in progress: command_ui fallback retirement continues.

### Batch 24 — Organization Members canonicalization
- ✅ Batch 24 completed:
  - Made `TeamControlCenter` the unconditional Organization Members presentation.
  - Preserved invitations, seat limits, role controls, onboarding handoff, self-removal and last-owner protections, billing navigation, and workspace deletion in `DangerZone`.
  - Removed the duplicate classic team-management shell without changing organization repository behavior.
  - Kept `P0-07` in progress: command_ui fallback retirement continues.

### Batch 25 — Field Hub canonicalization
- ✅ Batch 25 completed:
  - Made `FieldHubControlCenter` the permanent leading Field Hub overview tab.
  - Preserved all specialized field register tabs and deep-link behavior.
  - Removed `command_ui` branching.
  - Deferred aggregate hub queries unless the Command Center tab is active.
  - Added explicit aggregate loading behavior.
  - Preserved permissions, cache keys, project scoping, phase resolution, and lazy-loaded registers.
  - Kept `P0-07` in progress.

### Batch 26 — Backcharge Defense canonicalization
- ✅ Batch 26 completed:
  - Made `BackchargeControlCenter` the canonical register.
  - Preserved and promoted the complete detail workflow.
  - Preserved T&M tickets, audit trail, status changes, linked CO/RFI context, defense-package generation, editing, and deletion.
  - Corrected Open Backcharges filtering to include all canonical open statuses.
  - Removed `command_ui` branching and the duplicate register/KPI shell.
  - Kept repository, RLS, cache, and export behavior unchanged.
  - Kept `P0-07` in progress.

### Open items
- **IN PROGRESS:** batches 14–37 canonicalized Budget Control, Reports, Resources, Portfolio, Risk, Billing, Settings, Vendors, Pay Applications, Production Status, Team, Organization Members, Field Hub, Backcharge Defense, Expenses, Deliveries, Documents, Change Orders, Work Packages, RFIs, Submittals, Drawings, and Detailing Control Center; distinct secondary workflows remain; legacy URLs redirect to selected surfaces
  - Budget Control
  - Reports & Insights
  - Resource Register
  - Portfolio Overview
  - Risk
  - Billing
  - Settings
  - Vendors
  - Pay Applications
  - Production Status
  - Organization Members
  - Field Hub
  - Backcharge Defense
  - Expenses
  - Deliveries
  - Change Orders
- P0-07 remains in progress: continued migration away from `command_ui` fallback patterns.

## Batch 37: Detailing Control Center canonicalization

- Starting commit: `fbf9b637a74d6cc6cc979e359fe78a310a69c769` (Batch 36 HEAD; pushed on `agent/handoff-cleanup`).
- Scope: made `DetailingCommandShell` the unconditional Detailing Control Center presentation while preserving the `hub_tab` contract, invalid-tab fallback, project/no-project behavior, lazy loading, retry handling, loading/error boundaries, and all supported workflow tabs.
- Canonical panels: `ControlBoardPanel`, `ProcessBoardPanel`, `DrawingRegisterPanel`, `ApprovalMatrixPanel`, and `RevisionImpactPanel` now render through the canonical shell without a `command_ui` presentation branch or classic page fallback. Operational flags `viewer_3d`, `revision_ai_diff`, and `submittal_workday_dues` remain active for their supported workflows.
- Preserved workflow behavior: submittal status/round/BIC/due authority, drawing-set identity/files/metadata, drawing-row metadata, revision data, work-package and schedule dates, RFI and change-order escalation, model import, rollups, permissions, navigation, cache invalidation, revision summaries, and specialized register workflows.
- Integrity hardening: ambiguous name-only package links no longer merge same-name drawing sets; governing active submittals control stage, owner, due, and action state; owner and due writes validate their actual target scope; direct detailing-state writes reject governed/released packages; revision-summary persistence and cache invalidation are awaited; partial model-import outcomes are reported accurately.
- Source measurements: `DrawingSubmittalHub.tsx` is 721 lines; `ControlBoardPanel.tsx` is 257 lines; `DetailingCommandShell.tsx` is 251 lines; `DrawingRegisterPanel.tsx` is 319 lines; `ApprovalMatrixPanel.tsx` is 301 lines; `RevisionImpactPanel.tsx` is 221 lines; focused format tests are 751 lines.
- Changed Batch 37 files: `src/pages/DrawingSubmittalHub.tsx`, `src/pages/drawingSubmittalHub/format.ts`, `src/pages/drawingSubmittalHub/ControlBoardPanel.tsx`, `src/pages/drawingSubmittalHub/DetailingCommandShell.tsx`, `src/pages/drawingSubmittalHub/DrawingRegisterPanel.tsx`, `src/pages/drawingSubmittalHub/ApprovalMatrixPanel.tsx`, `src/pages/drawingSubmittalHub/RevisionImpactPanel.tsx`, `src/pages/drawingSubmittalHub/EscalateModal.tsx`, `src/pages/drawingSubmittalHub/fleetHealthStrip.tsx`, `src/pages/drawingSubmittalHub/triageBoard.tsx`, `src/pages/drawingSubmittalHub/drawingControlCenter.derive.ts`, `src/pages/drawingSubmittalHub/drawingRegister.derive.ts`, `src/pages/drawingSubmittalHub/revisionImpact.derive.ts`, `src/pages/drawingSubmittalHub/__tests__/format.test.ts`, `src/components/submittals/ProcessBoardPanel.tsx`, `src/components/drawings/ModelElementImportModal.jsx`, and this baseline document. Unrelated worktree changes remained untouched and excluded.
- Focused validation passed: 9 detailing-related test files and 162 tests. Full validation passed: 248 test files and 2,965 tests.
- Quality gates passed: `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, and `npm run typecheck:noimplicitany`. Strict and noImplicitAny reported only the repository's existing grandfathered ignored errors; no enforced errors were present.
- Production build passed with 4,320 transformed modules. `DrawingSubmittalHub` is 151.01 KB. Existing chunks larger than 500 KB still produce the established Vite warnings.
- Commit: `refactor: canonicalize Detailing Control Center`. PR #77 remains open and Draft. No deployment, production-data change, migration, or merge occurred.

### Batch 27 — Expenses canonicalization
- ✅ `ExpensesControlCenter` is now the only route-level Expenses presentation.
- Preserved project-scoped loading and no-project behavior, allocator-backed creation, edit/delete dialogs, CSV import/export, refresh, advanced filters, analytics, alerts, budget-vs-actual reporting, selection, filtered select-all, bulk actions, cache invalidation, and dollar/rounding behavior.
- Preserved row-open editing and isolated checkbox/delete actions in the composed expense table.
- Removed the alternate `command_ui` and classic page returns. Specialized expense components remain composed inside the canonical shell because their workflows are still active.
- No database schemas, migrations, permissions, repository functions, or allocator behavior changed.
- Files changed: `src/pages/Expenses.jsx`, `src/pages/expenses/ExpenseTable.jsx`, `src/pages/expenses/ExpensesControlCenter.tsx`, `src/pages/expenses/expensesControlCenter.derive.ts`, and this baseline document. No Expenses component files were deleted because the active specialized workflows are composed by the canonical shell.
- Working-tree line counts: `Expenses.jsx` 494 lines; `ExpensesControlCenter.tsx` 220 lines. The page remains larger than the turnover target because the parent still owns all active query, filter, analytics, selection, mutation, and allocator behavior.
- Stale-path search passed with no matches for `command_ui`, `commandUi`, `classic`, `CommandBar`, `Plus`, or `useFlag` in the Expenses page/control-center/derive files.
- Validation passed: focused Expenses tests (2 files, 13 tests), `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany`, and full tests (245 files, 2,930 tests).
- Production build passed with 4,318 transformed modules. Existing large-chunk warnings remain; the Expenses chunk is 72.36 KB because active specialized presentation remains composed.
- Commit: `phase0: canonicalize expenses UI`; PR #77 remains Draft. No deployment or merge performed. Unrelated worktree changes were not staged.

### Batch 28 — Deliveries canonicalization
- ✅ `DeliveryControlCenter` is now the only route-level Deliveries presentation.
- Preserved logistics parity: project-scoped and all-project queries, URL project normalization, `?receive=1` entry/exit, loading, realtime invalidation, 60-second refetching, create/edit/delete, permission gates, detail modal, single and bulk status transitions, fabrication-complete Delivered guards, partial bulk success, filtered select-all, filtered and selected CSV export, Shipping Ticket and Master Shipping List imports, Dispatch, Schedule, Register, status/schedule/risk/sequence filters, broad logistics search, receiving quick entry, overdue alert creation with in-session deduplication, activity logging, cache invalidation, truncation notice, and deep-link behavior.
- Promoted Master Shipping List import to a distinct `Import Shipping List` action. Register, Dispatch, Schedule, and receiving remain supported workflows inside the canonical shell.
- Removed the `command_ui` flag and alternate classic return from `src/pages/Deliveries.tsx`; mutation, permission, repository, audit, cache, and fabrication-guard authority remains in the page container.
- Files changed: `src/pages/Deliveries.tsx`, `src/pages/deliveries/DeliveryControlCenter.tsx`, `src/pages/deliveries/deliveryControlCenter.derive.ts`, and this baseline document. No delivery implementation files were deleted because the shared import, modal, dispatch, schedule, register, and receiving workflows remain active.
- Working-tree line counts: `Deliveries.tsx` 837 → 567 lines; `DeliveryControlCenter.tsx` 483 → 559 lines. The control center grew because classic-only controls required for logistics parity were absorbed into the canonical shell.
- Stale-path search passed: no `useFlag("command_ui")`, `commandUi`, classic/flag-branch comments, `CommandBar`, or alternate delivery return remains in the delivery page, control center, or derive files. Delivery references remain only in the canonical route and active delivery modules.
- Validation passed: focused delivery tests (2 files, 19 tests), `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany`, and full tests (245 files, 2,930 tests).
- Production build passed with 4,318 transformed modules. Existing large-chunk warnings remain; the Deliveries chunk is 105.41 KB.
- Commit: `932010679c177f33b97c5a230f242598799082c5` (`phase0: canonicalize deliveries UI`); PR #77 remains Draft. No deployment, merge, or migration was performed. Unrelated worktree changes were not staged.

## Product Disposition Matrix

| Area | KEEP | FINISH | HIDE | RETIRE |
| --- | --- | --- | --- | --- |
| Core domain logic (`workflow`, `permissions`, `RLS`, `submittal`/`RFI`/`drawings` flows) | ✅ |  |  |  |
| Shared scheduling & planning engines (`constraintEngine`, `scheduleCascade`) | ✅ |  |  |  |
| Reported controls with proven UX value | ✅ |  |  |  |
| Incomplete placeholder pages/sections |  |  | ✅ |  |
| Duplicate or mirrored abstractions that cause ambiguity |  |  |  | ✅/FINISH |
| Legacy/deprecated runtime endpoints / migrations |  |  |  | ✅ |

## Phase 1 Placeholder Remediation

### Batch 4 — Closed findings
- ✅ Closed: `src/components/workpackages/WorkPackageList.jsx` — removed the visible **Import from CSV** placeholder control from the empty state (including empty `onClick` handler and coming-soon title).
- ✅ Closed: `src/pages/ResourceScheduling.tsx` — removed the visible **Sync Company Resources** button (toast-only behavior).
- ✅ Closed: `src/pages/CranePickCalculator.jsx` — removed the **Save to Project (soon)** button and its future-hook comment.

## Risk Notes (facts vs actions)
- **Source fact:** Production-ready schema, RLS, auth and workflow paths remain strong; these are the foundation.
- **Source fact:** Parallel/incomplete UI implementations are present and create ambiguity.
- **Source fact:** Some dead or misleading controls are still visible.
- **Needs app-owner decision / non-local actions:** Production Supabase/Vercel changes and historical data hygiene.

## Next-step Interpretation
Selective, in-house consolidation is preferred over a full rewrite. Phase 1 priorities are therefore: date correctness, false-success controls, routing cleanup, then controlled placeholder/hide/review pass while preserving the underlying architecture and data foundation.







## Batch 29: Documents canonicalization

- Starting commit: `932010679c177f33b97c5a230f242598799082c5` (`phase0: canonicalize deliveries UI`).
- Documents now uses `DocumentsControlCenter` as its only route shell. The classic page branch and browser feature-flag selection were removed; active Documents components remain composed through the canonical shell.
- Preserved project and no-project states, loading behavior, normalized document data, upload and drag/drop flows, edit/detail/download actions, grid/list/folder views, search, status and advanced filters, sorting, category context, CSV export, review queue, transmittal generation, folder navigation and CRUD, bulk create/move/delete/reparent safeguards, filtered selection cleanup, partial-failure handling, query invalidation, Supabase storage resolution, RLS-backed mutations, soft-delete behavior, and empty states.
- No DMS workflow implementation was deleted. The canonical shell owns presentation while `Documents.jsx` continues to own queries, mutations, modal state, storage access, and workflow callbacks.
- Validation passed: focused Documents derivation tests (1 file, 39 tests), `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany`, and the full suite (245 files, 2,931 tests).
- Production build passed with 4,317 transformed modules. Existing large-chunk warnings remain; the Documents chunk is 93.36 KB.
- Batch 28 baseline wording was reconciled to the authoritative starting SHA above. The Batch 29 focused canonicalization commit is recorded in git history and in the handoff report. No deployment or merge was performed.

## Batch 30: Change Orders canonicalization

- Starting commit: `92d00a8633e6628523b71f35d235781ad1affd43` (`phase0: canonicalize documents UI`).
- `CoControlCenter` is now the sole Change Orders presentation path. The classic Operations shell, duplicate KPI/filter/table rendering, lifecycle chevron, and `command_ui` branch were removed.
- Preserved project scoping, no-project/loading states, RFI `?fromRfi` conversion and source labeling, SOV context, permissions, CRUD dialogs, CSV export, import, cost-rollup authority, server-backed number allocation, and cache invalidation.
- Hardened bulk submit, approve, and delete: each action captures selected IDs, uses `batchProcess`, disables duplicate pending clicks, records approval identity, reports complete/partial/total failure accurately, invalidates the registered Change Order family once, and reconciles selection without hiding failed rows.
- Filtered select-all now checks membership of every visible row, so hidden selections cannot produce a false checked state. Row opening and checkbox isolation remain supported.
- The lifecycle chevron was intentionally retired as duplicate page chrome; status chips, status filtering, decision queues, and risk/exposure summary remain in the canonical center.
- Working-tree line counts: `ChangeOrders.jsx` 746 -> `496` lines; the canonical parent still owns the active mutation/query boundary.
- Changed files: `src/pages/ChangeOrders.jsx`, `src/pages/changeOrders/CoControlCenter.tsx`, `src/pages/changeOrders/coControlCenter.derive.ts`, `src/pages/changeOrders/changeOrderBulk.ts`, `src/pages/changeOrders/__tests__/changeOrderBulk.test.ts`, and this baseline document. No Change Orders workflow implementation was deleted.
- Stale-path search passed: no `command_ui`, `commandUi`, `OperationsPageShell`, duplicate KPI/filter/table shell, lifecycle chevron, or classic Change Orders return remains in the canonical page/control-center path. `CoRow.jsx` remains unimported and was not deleted because the requested cleanup was scoped to the route presentation.
- Focused validation passed: 5 files and 86 tests covering Change Order derivations, bulk transition contracts, cost rollups, number allocation, and cache registry behavior.
- Validation passed: `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, and `npm run typecheck:noimplicitany`. Existing grandfathered strict errors remained ignored by the repository ratchet; no new enforced errors were present.
- Full suite passed: 246 test files and 2,938 tests. Production build passed with 4,317 transformed modules; the Change Orders chunk is 45.28 KB. Existing chunks larger than 500 KB still produce the established build warnings.
- Batch 30 commit: `6c2777a9e86f142116b3b7eb00a91db0a89d6a4f`. PR #77 remains Draft. No conflicts or deviations from the requested Change Orders scope, database migration, deployment, merge, or PR readiness change occurred; unrelated worktree changes remained untouched.

## Batch 31: Fab Release canonicalization

- Starting commit: `6c2777a9e86f142116b3b7eb00a91db0a89d6a4f` (`refactor: canonicalize Change Orders and harden bulk transitions`).
- `FabReleaseControlCenter` is now the sole Fab Release presentation shell. The feature-flag branch and duplicate classic shell were removed while `FabRelease.tsx` continues to own all queries, mutations, permissions, audit logging, cache invalidation, allocator calls, and completion behavior.
- Working-tree line counts: `FabRelease.tsx` 575 -> 491 lines; `FabReleaseControlCenter.tsx` 359 -> 179 lines.
- Flow, Board, Register, and Hours remain available as the four localStorage/URL-selectable workflows. The specialized `RegisterView` is the only register presentation; the former duplicate command `DataTable` register was removed. `ExceptionRail` and `SequenceFilter` remain composed through the canonical shell.
- Search still spans package, project, crew, status, phase, notes, stage labels, drawing packages, and blocker labels. Stage, risk, sequence, clear-filter, `pipeline` -> `flow`, and `list` -> `register` behavior remain covered by focused parity helpers. Decision-panel View All actions apply their filter and scroll to a stable canonical workflow body.
- Creation remains fail-closed: missing project context, an open/editing modal, an allocator already in flight, or an allocator failure prevents creation. The existing `getNextNumber(projectId, "wp_number")` allocator and `WP-###` formatting remain unchanged, with duplicate-click protection added around the async call.
- Completion remains the existing direct mutation (`Complete` and 100 percent progress), with the existing pending state, audit event, cache invalidation, detail closing, and toast behavior preserved. Edit/create/delete controls remain permission-gated, row action clicks stop propagation, and detail/delete/completion safeguards remain in place.
- Changed files: `src/pages/FabRelease.tsx`, `src/pages/fabRelease/FabReleaseControlCenter.tsx`, `src/pages/fabRelease/components.tsx`, `src/pages/fabRelease/fabReleaseControlCenter.derive.ts`, `src/pages/fabRelease/creation.ts`, `src/pages/fabRelease/filter.ts`, `src/pages/fabRelease/view.ts`, `src/pages/fabRelease/__tests__/fabReleaseParity.test.ts`, and this baseline document. No Fab Release workflow implementation was deleted.
- Stale-path search passed after removing the `command_ui` branch, classic shell, duplicate `DataTable`, CSS WANTS block, and historical feature-flag wording from the Fab Release path.
- Focused validation passed: 3 files and 29 tests covering existing Fab Release analytics/derive behavior plus view aliases, stage normalization, broad filtering, sequence filtering, allocator formatting/failure, and duplicate-creation guards.
- Validation passed: `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, and `npm run typecheck:noimplicitany`. Existing grandfathered strict/null and noImplicitAny errors remained ignored by the repository ratchet; no new enforced errors were present.
- Full suite passed: 247 test files and 2,944 tests. Production build passed with 4,320 transformed modules; the Fab Release chunk is 66.09 KB. Existing chunks larger than 500 KB still produce the established build warnings.
- Batch 31 commit: `561a09eb971c6c8ee628b48cb88be535466eced6`. PR #77 remains Draft. No deployment, merge, or PR readiness change occurred; unrelated worktree changes remained untouched.

## Batch 32: Schedule canonicalization

- Starting commit: `561a09eb971c6c8ee628b48cb88be535466eced6` (`refactor: make Fab Release canonical`).
- `ScheduleCommandCenter` is now the sole unconditional Schedule presentation shell.
- The legacy/classic Schedule branch, duplicate command UI search and phase controls, and feature-flag presentation split were removed.
- Schedule data loading, mutations, import/export workflows, effective-date handling, hierarchy operations, Gantt/list/lookahead behavior, drawers, modals, permissions, and cache invalidation remain owned by `Schedule.tsx` and the existing scheduling domain helpers.
- Header action parity is preserved for MS Project XML/MPP import, ICS export, PDF export, WBS Builder, Bulk Add, Add Task, hidden file input handling, and pending/disabled states.
- Search and phase controls remain in the operational body/Gantt/task-list surfaces; the unconnected duplicate controls were removed from the canonical shell.
- Before/after source measurements: `Schedule.tsx` 748 -> 643 lines; `ScheduleCommandCenter.tsx` 347 -> 353 lines. The command center grew only to retain the existing action surface while removing the duplicate branch.
- Build chunk measurements: Schedule route 150.23 KB -> 149.30 KB; ScheduleGantt 74.95 KB -> 74.92 KB; 4,320 -> 4,321 transformed modules. Existing large-chunk warnings remain.
- Batch 32 validation: focused Schedule suite 17 files / 193 tests before edits; focused canonical-shell suite 3 files / 54 tests after edits; broader Schedule suite 17 files / 196 tests after edits; lint, typecheck, JavaScript typecheck, strict typecheck, noImplicitAny check, and production build passed.
- Batch 32 commit: `615c9941c588ae9d8eed6d45ec574a420f3fa44d` (`refactor: make Schedule canonical`). PR #77 remains Draft. No deployment, merge, or migration occurred; unrelated worktree changes remained untouched.

## Batch 33: Work Packages canonicalization

- Starting commit: `615c9941c588ae9d8eed6d45ec574a420f3fa44d` (`refactor: make Schedule canonical`).
- `WpControlCenter` is now the unconditional Work Packages route shell. `WorkPackages.tsx` remains the owner of queries, project filtering, realtime invalidation, cache-family invalidation, permissions, mutations, allocator calls, selection state, modal state, and analytics inputs.
- Preserved project-scoped and all-project viewing, deleted/non-live project exclusion, drawings and delivery analytics inputs, loading state, create/edit/delete/detail workflows, drawing linkage, auto-open create, CSV export, Flow, Board, and the specialized `RegisterView`.
- The specialized `RegisterView` is the canonical register because it already provides direct edit/delete actions, row click isolation, readiness/labor signals, and selection behavior. The duplicate control-center DataTable/register path was removed rather than duplicated.
- Preserved ExceptionPanel triage and routing, phase/status/risk/search filters, SequenceFilter, Clear Filters, filtered counts, filtered select-all, visible selection reconciliation, selected-row CSV export protection, responsive workflow CSS, and stable body focus for decision-panel View All actions.
- Preserved bulk creation, official allocator-backed `getNextNumber(projectId, "wp_number")` calls, `WP-###` formatting, user-supplied numbers, fail-closed allocation, duplicate-number protection, and partial database-write reporting through `batchProcess`. No browser-generated fallback was added.
- Preserved bulk Complete and In Progress actions, pending guards, partial-failure feedback, cache invalidation, Fab Release invalidation, and existing status-only Work Package bulk updates. The database status contract allows the four Work Package statuses but does not enforce a paired percent-complete constraint; no new status/progress rule was introduced.
- Preserved `WPBulkAddModal`, `WPFormModal`, `WorkPackageDetailModal`, and one `DeleteDialog` composition. No Work Package implementation was deleted.
- Before/after source measurements: `WorkPackages.tsx` 575 -> 472 lines; `WpControlCenter.tsx` 576 -> 502 lines; `components.tsx` 668 -> 668 lines; `styles.ts` 666 -> 666 lines; `utils.js` 50 -> 50 lines; `wpControlCenter.derive.ts` 143 -> 154 lines. New `creation.ts` contains 55 lines of pure bulk-preparation logic.
- Route chunk measurement: Work Packages 72.53 KB -> 64.77 KB; the production build transformed 4,322 modules. Existing chunks larger than 500 KB still produce the established warnings.
- Stale-path checks passed: no `useFlag("command_ui")`, `commandUi`, classic/control-center conditional, duplicate modal block, duplicate BulkActionBar, `FilterBar`, `DataTable`, command UI skin wording, classic-path wording, or browser-number fallback remains in the Work Packages route/shell.
- Focused validation passed: 3 Work Packages test files and 30 tests. Full suite passed: 248 test files and 2,953 tests.
- `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, and `npm run typecheck:noimplicitany` passed. Strict and noImplicitAny retained only the existing grandfathered ignored errors; no new enforced errors were present.
- Production build passed with 4,322 transformed modules. No blockers or parity deviations remain. Batch 33 commit: `e39be7ac1aeac9481602ddbdee1357cd47a9945a` (`refactor: canonicalize Work Packages`). PR #77 remains Draft. No deployment, merge, or migration occurred; unrelated worktree changes remained untouched.

## Batch 34: RFI canonicalization

- Starting commit: `e39be7ac1aeac9481602ddbdee1357cd47a9945a` (`refactor: canonicalize Work Packages`).
- `RfiControlCenter` is now the sole unconditional RFI presentation shell. RFIs.jsx remains the authority for project-scoped queries, realtime invalidation, permissions, CRUD, bulk mutations, audit/downstream actions, alerts, official number allocation, PDF attachments, cache invalidation, and modal state.
- Preserved full RFI workflow parity: search, complete status and discipline filtering, sequence filtering, density controls, insight collapse, Today's Agenda, decision queues, risk/BIC/age/due/impact displays, canonical register rows, filtered select-all, source reconciliation, visible-row selected export, bulk update/edit/delete, import, create/edit/detail/nudge flows, status/date_answered handling, downstream navigation, list truncation, and project health/completion context.
- Removed the feature-flagged branch, duplicate page-level table/actions, and unreachable `RfiCommandCenter`. The richer RFI register, agenda, insights, and action surfaces are composed through the canonical control center without moving mutation authority into presentation components.
- Official RFI numbering remains RPC-backed through `getNextFormattedNumber` with project validation, fail-closed allocation, and duplicate-submit protection. Browser max-number fallback logic was removed from the shared RFI form.
- PDF attachment failures are reported per file after the RFI save; successful document links invalidate both RFI-document and project-document caches, while partial failures no longer misreport a saved RFI as an unsuccessful save.
- Changed files: `src/pages/RFIs.jsx`, `src/pages/rfis/RfiControlCenter.tsx`, `src/pages/rfis/RfiFilterToolbar.jsx`, `src/pages/rfis/RfiTable.jsx`, `src/pages/rfis/RFIs.css`, `src/pages/rfis/constants.js`, `src/pages/rfis/rfiControlCenter.derive.ts`, `src/components/rfis/RFIFormModal.jsx`, `src/pages/rfis/RfiCommandCenter.jsx` (deleted), and this baseline document. No RFI domain or database workflow was deleted.
- Source measurements: `RFIs.jsx` 632 -> 592 lines; `RfiControlCenter.tsx` 191 -> 256 lines. The canonical shell grew because the previously dormant register, agenda, insights, density, sequence, status, and action surfaces were composed into one presentation path.
- Focused validation passed: 11 RFI files and 77 tests. Full validation passed: 248 test files and 2,953 tests; lint, TypeScript, JavaScript typecheck, strict typecheck, and noImplicitAny typecheck all passed with only existing grandfathered errors ignored by the ratchets.
- Production build passed with 4,321 transformed modules. Existing chunks larger than 500 KB still produce the established warnings; the RFIs route chunk is 78.40 KB.
- PR #77 remains Draft. No deployment, merge, or migration occurred; unrelated worktree changes remained untouched.

## Batch 35: Submittals canonicalization and workflow integrity

- Starting commit: `e6ed305e1d0375c33c9e177f7ad1d13d36898ee9` (`phase0: canonicalize RFIs UI`). Branch: `agent/handoff-cleanup`.
- `SubmittalRegisterPanel` is now the unconditional `/Submittals` route presentation. The `command_ui` branch, duplicate CommandBar/KPI/PhoenixPanel/filter shell, and alternate list/detail return were removed; all operational queries, mutations, modal state, permissions, and independent Submittals flags remain page-owned.
- Preserved no-project/loading behavior, status/BIC/search filtering, stats and forecast signals, filtered select-all semantics, selected detail, creation/edit/delete, bulk edit/add/delete, rounds, carry-forward responses, sheet responses, spin-off lineage, per-drawing-type components, workday due logic, release override, fab-release RFI gate, audit logging, and cache invalidation.
- Async write integrity was hardened: invalidation and audit attempts are awaited, bulk success removes only successful IDs and retains failed selections, total failures keep retry dialogs open, modal submit buttons expose pending state, new-round parent updates clean up an inserted round on parent failure, sheet response updates preserve existing response IDs, and post-create drawing-type component writes report partial failure explicitly.
- Linked drawing-set locks now attempt every linked set but reject the workflow when any lock fails, preventing an approval from being reported as fully settled without its required locks. Existing server-side RLS/RPC release gates remain authoritative.
- Revision policy finding: the current implementation still permits manual text revisions and only flag-gated deterministic bumping on genuine resubmission; the requested letter-before-approval/numeric-after-IFC policy is not unambiguously encoded in the current domain contract and was not changed in this canonicalization batch.
- Special drawing requirement finding: released-parent date semantics and uploaded-file visibility/first-sheet requirements were not changed because their authoritative source paths are outside the Submittal route presentation cleanup.
- Source measurements: `Submittals.tsx` 1,083 -> 997 lines; `SubmittalRegisterPanel.tsx` is 240 lines. The deleted alternate shell was not replaced with a second route presentation.
- Pre-edit focused baseline: 14 Submittals-related test files, 253 tests passed. Final focused validation passed with 14 files and 255 tests; the full suite passed with 248 files and 2,955 tests.
- Final validation passed: `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, and `npm run typecheck:noimplicitany`. Strict/noImplicitAny reported only existing grandfathered ignored errors and no enforced errors.
- Production build passed with 4,321 transformed modules. The Submittals route chunk is 160.79 KB. Existing chunks larger than 500 KB still produce the established warnings.
- Changed Batch 35 files: `src/pages/Submittals.tsx`, `src/pages/submittals/SubmittalRegisterPanel.tsx`, `src/pages/submittals/submittalRegister.derive.ts`, `src/pages/submittals/SubmittalFormModal.tsx`, `src/pages/submittals/__tests__/submittalRegister.derive.test.ts`, `src/__tests__/components/Submittals.test.jsx`, `src/hooks/useSubmittals.ts`, `src/hooks/useSubmittalComponents.ts`, `src/hooks/__tests__/useSubmittals.test.ts`, `src/components/submittals/NewRoundModal.jsx`, `src/components/submittals/SheetResponseGrid.jsx`, `src/components/submittals/SubmittalBulkAddModal.jsx`, `src/components/submittals/SubmittalBulkEditModal.jsx`, `src/components/submittals/ProcessBoardPanel.tsx`, `src/components/submittals/processBoard.derive.ts`, and `src/components/shared/DeleteDialog.jsx`.
- No migrations, deployment, merge, or PR readiness change occurred. Unrelated worktree changes remained untouched.
## Batch 36 - Drawings source-of-truth and workflow reconciliation

- Starting commit: `7709a4a0927f6c947fd6449104671ef5e1023dac` (Batch 35 HEAD).
- Scope: reconciled Drawings, drawing-set, sheet, upload, approval, stage, revision, import, and cache behavior without a schema migration, production-data change, deployment, or merge.
- Authority: Submittals remain authoritative for formal review status and rounds; drawing sets remain authoritative for package identity, files, and package metadata; drawing rows remain authoritative for sheet metadata; legacy per-sheet approval and set approval fields remain compatibility mirrors. Display rollups may fall back to drawing stages only for legacy sets without a linked active Submittal.
- Stage writes: linked drawing sets are blocked from direct page-level formal stage mutation; the single-sheet legacy recovery path is limited to rows without a linked Submittal. Bulk formal stage changes across linked sets are blocked rather than mapped ambiguously. Approved, Approved as Noted, R&R/Rejected, IFC, OFS, and Released behavior remains governed by the existing Submittal stage mapping and fabrication gate rules.
- Identity and grouping: `drawing_set_id` is preferred for grouping, approval, and rename targeting. Same-name sets with different IDs remain separate. Legacy name fallback is retained only where no foreign key exists. Set-only parents remain visible, and failed child operations remain selected and visible for recovery.
- Upload and async behavior: upload, extraction, import, revision, approval, rename, delete, undo, and edit paths now settle writes before closing or reporting success, invalidate Drawing, DrawingSet, and relevant Submittal caches through the registered entity keys, preserve partial failures, and distinguish complete, partial, and failed outcomes. Empty extraction results remain recoverable instead of creating a falsely successful empty set.
- Revision policy: the new validation helper accepts letter-style revisions before IFC and numeric revisions after IFC/Released while rejecting ambiguous post-release labels. Existing history and supersession behavior remains unchanged. The current schema does not expose an unambiguous full revision-policy field model, so no schema work was invented in this batch.
- Subsets and spin-offs: existing Submittal spin-off lineage remains downstream and navigable. No separate drawing-set subset/spin-off lineage field was found, so this batch does not imply that a subset release completes its parent; dedicated drawing-set lineage remains a follow-up schema decision.
- Fabrication Complete By: no authoritative persisted field or existing drawing workflow surface was found. No phantom field, migration, or false UI claim was added; this remains a baseline follow-up.
- First-sheet behavior: existing first-sheet selection and file fallback behavior were preserved. No persisted first-sheet field was removed because current import, display, and downstream package paths still depend on the existing behavior.
- Focused validation: 5 test files passed, 91 tests passed (`drawingsUtils`, revision upload helpers, submittal stage mapping, drawing-set upload helpers, and drawing-log import).
- Full validation: `npm test -- --run` passed with 248 test files and 2,960 tests. `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, and `npm run typecheck:noimplicitany` passed. Strict and noImplicitAny report only the repository's existing grandfathered ignored errors.
- Production build: passed with 4,321 modules transformed. Existing chunks larger than 500 kB remain warned by Vite; Drawings is 123.52 kB, DrawingSetUploadModal is 40.27 kB, and RevisionUploadModal is 31.01 kB in the production output.
- Changed source/test files: `src/pages/Drawings.jsx`, drawing table/grid/dialog/upload/import/revision components, `src/components/drawings/drawingsUtils.js`, `src/lib/drawingUploadUtils.js`, and the focused drawing tests. Unrelated tracked and untracked worktree changes were preserved and excluded.
- Commit: `refactor: reconcile Drawings workflow authority`.
- Delivery: pushed only to `origin/agent/handoff-cleanup`; draft PR #77 remains open. No deployment, production migration, or merge was performed.

## Batch 38: repository-wide presentation-flag retirement and dead-path inventory

- Starting commit: `307dafbfeade773c69c158b5194fd4f5aa3f5153` (Batch 37 HEAD; pushed on `agent/handoff-cleanup`).
- Retired the remaining `command_ui` presentation infrastructure from runtime source. The typed production catalog now contains 8 operational keys; the historical SQL catalog row remains unchanged and no migration clears remote rollout state.
- Removed presentation-flag branches from Action Items, Budget Hours, Command Center, Dashboard, Drawing Viewer, Field Today, Procurement, Projects, Schedule of Values, Doc Control, revision dialogs, and 3D viewer chrome. Operational flags remain server-backed and unchanged.
- Added `docs/FEATURE_FLAG_AND_DEAD_PATH_INVENTORY.md` with flag ownership/disposition, route inventory, compatibility targets, visible dead-end evidence, and deletion-proof rules. The route registry currently contains 75 pages and 10 static metadata entries.
- Added `src/__tests__/commandUiRetirement.test.js` as a guard against reintroducing the retired runtime flag or branch identifier.
- Visible DMS provider/sync controls remain classified HIDE, and the generic unsupported-function warning remains classified FINISH; neither unrelated workflow was changed in this batch.
- No implementation files, migrations, schemas, RLS policies, RPCs, or operational flags were deleted. Canonical control-center components and their command stylesheet remain active code, not fallback infrastructure.
- Required validation, final commit SHA, and exact changed-file list are recorded in the final handoff after execution. PR #77 remains open and Draft. No deployment, merge, or production migration occurred.
