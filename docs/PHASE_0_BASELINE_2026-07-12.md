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
- **IN PROGRESS:** batches 14–26 canonicalized Budget Control, Reports, Resources, Portfolio, Risk, Billing, Settings, Vendors, Pay Applications, Production Status, Team, Field Hub, and Backcharge Defense; distinct secondary workflows remain; legacy URLs redirect to selected surfaces
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
- P0-07 remains in progress: continued migration away from `command_ui` fallback patterns.

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






