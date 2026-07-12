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
