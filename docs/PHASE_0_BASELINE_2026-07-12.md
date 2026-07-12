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
