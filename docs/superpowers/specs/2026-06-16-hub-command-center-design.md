# Hub Command Center — Design Spec

- **Date:** 2026-06-16
- **Status:** ✅ Implemented — all 4 slices shipped 2026-06-17 (hub-as-main `26bfa58f` · health score `58b95239` · lock rules `4c34cd1e` · revision board `17dcddaf`)
- **Owner workflow:** Drawings + Submittals (the moat — CLAUDE.md §20–21)

## Goal

Make `DrawingSubmittalHub` the unmistakable command center for the
drawings/submittals workflow, and deepen it with three capabilities: a
deterministic **Drawing Health Score**, **obvious package-lock rules**, and a
**visual revision-impact board**. The standalone Drawings page becomes the
clearly-secondary "full editor."

## Locked decisions

1. **Build order:** (1) Hub-as-main → (2) Health Score → (3) Lock rules → (4) Revision impact board.
2. **Hub scope:** *Default + visibly demote* — repoint nav to the Hub and de-emphasize the standalone page; **no routes removed**.
3. **Health score:** 0–100 + letter grade (A–F) + color band.

## Architecture

- One initiative, **four independently-shippable, independently-validated slices** (one commit/deploy each).
- One new **pure engine**: `src/services/drawingHealthScore.ts`, mirroring
  `src/services/marginRiskEngine.ts` (deterministic, no React, vitest-tested,
  `signals → items → rollups` shape). It is the only cross-slice dependency
  (Control Board + Drawing Register consume it).
- **Reuse, don't rebuild:** `buildSetPackages` (`src/pages/drawingSubmittalHub/format.ts`),
  `computeDetailingReadiness` (`src/lib/detailingReadiness.js`),
  `computeRevisionImpact` (`src/lib/detailingRevisionImpact.js`),
  `selectChangedSheets`/`summarizePackageReport` (`src/lib/revisionPackageReport.js`),
  `setLock.js` (`lockSet`/`unlockSet`/`assertSetUnlocked` in `src/lib/drawingHub/`),
  the `fab_release_blocking_rfis` RPC, and `src/services/auditLogger.ts`.

---

## Slice 1 — Hub as the main experience (default + demote)

### Scope
- Repoint the primary Drawings/Detailing **nav entry** to `DrawingSubmittalHub`; give it the prominent placement.
- **Demote** the standalone Drawings page: a banner — **"Full editor (secondary) · ← Back to the Hub"** — and de-emphasis in nav. Keep the `/Drawings` route and the in-Hub **"Open full editor ↗"** link already added to the Register.

### Files / notes
- Nav source: `src/config/moduleRegistry.js` (⚠ icons are literal `\uXXXX` text — edit with ASCII-anchored regex, per prior nav work), `src/config/routes.js`, and the sidebar nav component. **Verify first** whether nav currently points at the Hub vs Drawings (the Hub is the "Detailing Control Center").
- `src/pages/Drawings.jsx` — add the demotion banner. The hub no longer embeds the Drawings page (Register replaced `<DrawingsPage embedded />` this session), so the page now renders only standalone; still guard the banner so it never shows in any embedded context.
- No data changes. **Risk: low.**

---

## Slice 2 — Drawing Health Score (0–100 + grade + color)

### Engine — `src/services/drawingHealthScore.ts`
`calculateDrawingHealthScore(setPackage, context) → DrawingHealthScore`
- `context`: `{ rfis?, revisions?, project?, openRfiIds?: Set<string>, today? }`
- Output:
  ```
  {
    setId, setName,
    score: 0..100,                 // 100 = perfect
    grade: "A"|"B"|"C"|"D"|"F",
    band: { key: "excellent"|"good"|"at_risk"|"critical", color, label },
    factors: {
      approval:      { score, weight, detail },          // terminal-approved outcome
      submittal:     { score, weight, detail, stage },   // round-trip progress / R&R churn
      openRfis:      { score, weight, detail, count },
      revisionRisk:  { score, weight, detail },
      aging:         { score, weight, detail, daysOverdue },
      readiness:     { score, weight, detail, flags },
      missingSheets: { score, weight, detail, count },
    },
    issues: [ { factor, severity: "critical"|"high"|"medium", detail } ],
  }
  ```

### Weighting (deduction caps; sum = 100) — *tweakable*
Open RFIs **20** · Revision risk **18** · Approval status **16** · Aging/overdue **14** · Submittal progress **12** · Readiness flags **12** · Missing sheets **8**.
Start at 100; each factor deducts up to its cap by severity. (Seven factors, matching the requested set.)

### Per-factor scoring
- **openRfis** — `drawings.linked_rfi_ids` is a **CSV of rfi_NUMBERS** (not uuids); match normalized to `rfis.rfi_number`. Open = `rfis.status` not in `{draft, answered, closed}`. Each open RFI deducts; cap at weight.
- **revisionRisk** — from `computeRevisionImpact` severity; `critical`/`high` deduct heavily, amplified when downstream (`fabricated`/`delivered`/`inField`).
- **approval** — is the governing submittal terminal-approved (`Approved`/`Approved as Noted`/`Released for Fabrication`)? Approved → 0; not yet approved → partial, scaled by distance from approval; Rejected → large. Legacy fallback: `drawing_sets.set_approval_status`, consulted only when no governing submittal.
- **submittal** — round-trip *progress* (`derivedSetStage` / `ball_in_court`, `submittalStageMapping.js`): R&R churn and a stalled ball-in-court deduct; clean forward progress → small/0.
- **aging** — days overdue past the set due date (`drawing_sets.due_date`, else earliest sheet `due_date`), scaled. Not overdue → 0. **Local-midnight dates only** (`src/utils/dates.js` / `dateMath.js` — AZ/UTC gotcha).
- **readiness** — `computeDetailingReadiness` flags: `rfiBlocked`, `revisionImpacted`, `materialImpacted`, `longLeadImpact` each deduct.
- **missingSheets** — `drawing_sets.sheet_count` vs active `sheets.length`; `fullySuperseded` set → max deduction.

### Bands / grades
A ≥90 · B ≥80 · C ≥70 · D ≥60 · F <60. Band: excellent ≥90 · good ≥75 · at_risk ≥60 · critical <60. Colors from SteelBuild Dark tokens (success/warning/error).

### Display
- **Drawing Register** (`src/pages/drawingSubmittalHub/components.tsx` `DrawingRegisterTable`): new **sortable "Health" column** — band chip + score + grade; click → breakdown popover (per-factor contribution bars + `issues`).
- **Control Board** (Hub overview tab): **"Fleet health" rollup** — grade distribution + worst-N sets (lowest scores), each clickable to the set.

### Tests
`src/services/__tests__/drawingHealthScore.test.js` (vitest) — per-factor isolation + composite; date-relative (`daysAgo`) like `marginRiskEngine.test.js`.

---

## Slice 3 — Lock rules made obvious

Lock state largely **exists** (`drawing_sets.is_locked/locked_at/locked_by/locked_reason`,
auto-lock via `lockLinkedSetsIfApproved`, service-layer `assertSetUnlocked`
guard throwing `DRAWING_SET_LOCKED`, admin unlock in `ViewerHeader`). The gaps
are clarity + an unlock audit.

### Scope
- **Persistent lock banner** (Register row + viewer header): "🔒 Locked — {locked_reason}" (e.g. "released for fabrication"); friendly-parse the raw `DRAWING_SET_LOCKED` error wherever it surfaces (toast).
- **Proactively disable** edit / revision-upload / delete actions on a locked set with a tooltip ("Locked — an admin must unlock"), instead of failing after the click.
- **Unlock = admin + required reason:** an unlock modal capturing a mandatory reason; persist an audit entry.

### Files / decision
- `src/lib/drawingHub/setLock.js` — `unlockSet({ setId, reason, userId })` writes an audit entry via `auditLogger` (keep nulling the lock columns).
- `src/components/drawings/viewer/ViewerHeader.jsx` — unlock button → reason modal (admin-only).
- `DrawingRegisterTable` + `DrawingsTable.jsx` — lock banner/badge + disabled actions when `parent.is_locked`.
- **Decision:** reuse `src/services/auditLogger.ts` for the unlock-reason trail — **no new table**. Lock stays service-layer (no new RLS); note this as a known limitation (out of scope below).

---

## Slice 4 — Revision impact board (visual "what changed / what's affected")

### Scope
New Hub **"Revision Impact"** tab — a board, one row per changed sheet:
- **changed sheet** — `selectChangedSheets` (`revisionPackageReport.js`)
- **linked work package** — `drawing_sets.linked_work_package_ids` → `work_packages`
- **affected RFIs** — `drawings.linked_rfi_ids` → `rfis` (open highlighted)
- **fab-release blocked?** yes/no — `fab_release_blocking_rfis` RPC / the fab gate
- **affected model elements** — *best-effort (see risk)*

### Risk / open data question
There is **no direct sheet→piece_mark link**. Derive affected `model_elements`
best-effort via the set's linked work package / sequence/area match, and label
the column **"approximate."** Confirm the exact linkage at build time; if none is
usable, render "—" with a note rather than guess. The other four columns are clean.

### Files
- New `src/pages/drawingSubmittalHub/RevisionImpactBoard.tsx` + wire into the hub `TABS` (`format.ts`) and tab render. Reuse `revisionPackageReport.js` + `detailingRevisionImpact.js`.

---

## Out of scope (YAGNI)
- Server-side (RLS/trigger) lock enforcement — keep service-layer; note the limitation.
- A persisted health-score table — computed read-model only.
- Retiring the standalone Drawings page — demote only.
- Any AI in the health score — deterministic only.

## Validation (per slice)
Targeted vitest for engine/logic, then `npm run lint` + `npm run typecheck` +
`node ./node_modules/vite/bin/vite.js build`; commit + deploy each slice; report
what changed, what was tested, and residual risk.
