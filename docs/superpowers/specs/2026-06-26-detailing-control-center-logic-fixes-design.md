# Detailing Control Center — Logic, Data & Efficiency Fixes

**Date:** 2026-06-26
**Status:** Approved design — pending implementation plan
**Area:** Detailing Control Center (`DrawingSubmittalHub`) — the moat command center

---

## 1. Problem & Goals

A full audit of the Detailing Control Center (hub page + ~7 deterministic engines + data) found the
**architecture sound** (project‑scoped queries, correct memoization, lazy tabs, guarded deprecated‑field
fallbacks, mostly‑tested engines) but surfaced a cluster of **reasoning inconsistencies**, two
**data‑population gaps where coded features have nothing real to show**, and **scale risks**. This spec
fixes all of them ("full sweep").

### Verified findings (checked against production data, 2026-06-26)

1. **Three divergent "open RFI" definitions** drift on the status "Answered":
   - `drawingHealthScore.ts:67` `RFI_NON_OPEN = {draft,answered,closed,void,cancelled,canceled}` (lowercased) → Answered = closed.
   - `modelElementStatus.ts:78` `RFI_CLOSED = {Answered,Closed,Void}` (Title Case, no lowercasing) → Answered = closed.
   - `revisionImpactBoard.ts:17` `RFI_CLOSED = {closed,void,cancelled,canceled,resolved}` (lowercased) → **Answered = OPEN**.
   - A canonical `isRfiOpen` already exists (`src/lib/entityPredicates.js:25`, set `{Answered,Closed,Void}`) and `fabReleaseGate.js` already uses it. Real DB statuses are Title Case: `Closed`(335), `Open`(7), `Under Review`(6), `Incomplete Response`(2), `Answered`(1).

2. **The per‑piece RFI fab‑hold path is inert.** `buildHeldPieceMarkSet` (`modelElementStatus.ts:84-97`) reads `rfi.fab_hold` and `rfi.piece_marks`, but the `rfis` table has **neither column** (verified full column list). So it always hits `!rfi.fab_hold` → returns an empty set → no element is ever flagged `rfi_blocked` by piece mark. Package‑level RFI blocking (`readiness.rfiBlocked`, via `drawings.linked_rfi_ids` ↔ open RFIs) still works.

3. **The 3D Model Mapping area is effectively empty.** `model_elements` = 82,007 rows across 9 projects, all with `piece_mark`, but only **21** have `drawing_set_id` and **21** have `drawing_id`. `work_package_id` and `erection_area` are 0% populated; `drawing_no` (10% populated) matches a real `drawings.sheet_number` on only **17 of 8,282** elements (different numbering namespace). There is **no reliable key** linking elements to detailing packages — the linkage was never wired. BUT elements carry their own `fab_status` (47% populated: `erected` 25,023 · `not_started` 6,830 · `in_fabrication` 6,259 · `shipped` 230 · `fabricated` 113) and `sequence_number` (91%). The mapping engine (`modelElementStatus.ts`) **ignores `fab_status` entirely** and derives status only from the (missing) set linkage, so it buckets ≈100% as "unmapped" and renders "% mapped ≈ 0," implying a data‑completeness problem that isn't the real story.

4. **Overdue KPI double‑defines.** `DrawingSubmittalHub.tsx:721` = `Math.max(kpis.overdue, triage.overdue.length)` — merges the submittal‑hook definition with the hub's triage definition (packages + unlinked submittals) via `max()`.

5. **Scale:** the Drawing Register table and Revision Impact board are unvirtualized; the Submittal Register tab embeds the full `SubmittalsPage` (`:838`) which runs its own `useSubmittals` instead of taking the hub's already‑loaded data as props (the other tabs are wired correctly). `@tanstack/react-virtual` ^3.13.24 is already a dependency.

6. **Test gaps:** `drawingHealthScore.ts` and `modelElementStatus.ts` have **no unit tests** despite driving hub decisions.

### Goals

- One canonical definition of "open RFI" used by every engine.
- The 3D model status panel is **truthful** and uses the element's own `fab_status` where there's no detailing‑package link; remove the inert fab‑hold path.
- One unambiguous Overdue KPI.
- Large tables virtualized; the embedded Submittal tab doesn't redundantly fetch.
- Fill the two engine test gaps.

### Non‑goals (explicit)

- **Building real element→drawing‑set linkage** (a data‑integration feature touching the IFC import + schema). The user chose the `fab_status` + truthful‑labeling route instead.
- Touching `src/lib/commandCenter/*`, `src/lib/drawingHub/*`, `src/components/commandcenter/*` — these are **not used by the hub** but are **live for `CommandCenter.jsx` / `DrawingViewer`**, so they are not dead code.
- Internals of the embedded `Submittals` / `DocControlPanel` pages beyond the hub's data‑ownership wiring.

---

## 2. Architecture

Four independently shippable workstreams, correctness‑first. Each leaves the hub releasable; tests fold
into the workstream that introduces the behavior.

### Workstream 1 — Unify RFI open/closed reasoning

- Make `src/lib/entityPredicates.js` `isRfiOpen` the single source. Replace:
  - `drawingHealthScore.ts` `RFI_NON_OPEN` usage (line ~121) with `isRfiOpen`.
  - `modelElementStatus.ts` `RFI_CLOSED` usage (line ~89) with `isRfiOpen` (also drops the no‑lowercase bug risk).
  - `revisionImpactBoard.ts` `isRfiOpenRow` (line ~32) with `isRfiOpen`.
- **Net behavior change:** "Answered" RFIs become **closed** in the Revision Impact board's open‑RFI counts / fab‑blocked logic (matching the other two engines). The phantom statuses (`draft`, `cancelled`, `resolved`) do not appear in production data, so no other counts move.
- `isRfiOpen` lives in a `.js` file; importing into the `.ts` engines is fine (mixed repo). Keep a one‑line comment in each consumer pointing at the canonical predicate.
- **Tests:** a shared test asserting `isRfiOpen` for every real status; update any health/revision tests that encoded the old per‑engine behavior.

### Workstream 2 — 3D model status: remove dead path + truthful panel (leverage existing Fab mode)

**Refinement (discovered during planning):** the 3D viewer **already** has a separate, working **"Fab" color mode** — `src/lib/fabStatus.js` (`FAB_STATUS_META`, `FAB_STATUS_ORDER` = `not_started→in_fabrication→fabricated→shipped→erected`, matching the DB exactly) + `buildFabByGuid`/`buildFabByMark` in `viewerColoring.js` color pieces directly from `element.fab_status`, and `fabStatus.js` explicitly documents itself as *"distinct from the detailing‑readiness engine."* So the element's own `fab_status` is **already usable in the viewer**, and the viewer's detailing "status" mode legend is already honest ("use the Fab mode" for hand‑set status). Folding `fab_status` into the detailing buckets (the spec's original wording) would duplicate and blur that deliberate separation. The cleaner fix — same user outcome — is:

- **Remove the inert path.** Delete `buildHeldPieceMarkSet` and the `rfi.fab_hold` / `rfi.piece_marks` reads from `modelElementStatus.ts`; drop the `heldPieceMarks` param from `resolveElementStatus`/`summarizeElementStatuses`; remove its import + call in `DrawingSubmittalHub.tsx` (~line 29, 347). The `rfi_blocked` bucket stays driven by package‑level `readiness.rfiBlocked`. (This also removes the only RFI‑status check in this file, so WS1 doesn't touch it.) Keep the detailing `ElementStatusKey` union unchanged.
- **Make the hub's `ModelMappingSection` panel truthful** (`drawingSubmittalHub/components.tsx`, ~lines 405–437):
  - Relabel "Mapped to packages — N%" → "**Linked to detailing packages — N%**" so the ~0% reads as "elements aren't tied to detailing packages yet" (the real story) rather than implying missing data.
  - Add a **fabrication‑status breakdown** below it: counts per `FAB_STATUS_ORDER` from the elements' own `fab_status`, using `FAB_STATUS_META` labels/colors (the panel already receives the `elements` array), with a one‑line pointer to the viewer's Fab mode. This surfaces the real, populated data (~47%) instead of an empty detailing mapping.
- **New helper:** add `summarizeFabStatus(elements)` to `src/lib/fabStatus.js` → `{ counts: Record<status, number>, withFabStatus: number, total: number, pct: number }`, with a unit test. The panel renders from it.
- **`mappedPct` stays** (it's correct — it IS the package‑linkage coverage); only its **label** changes. No change to `ElementStatusKey`, `BUCKETS`, `ELEMENT_STATUS_META`, `ELEMENT_BUCKET_ORDER`, `viewerColoring.js`, or `Model3DTab` coloring — keeping the blast radius small.
- **Tests:** update `modelElementStatus.test.ts` for the dropped `heldPieceMarks` param (remove the held‑mark cases); add `summarizeFabStatus` tests.

### Workstream 3 — KPI / reasoning cleanups

- **Overdue KPI:** drop `Math.max(...)`. Canonical definition = the hub's triage overdue (`triage.overdue.length`, which counts overdue packages + overdue unlinked submittals = what the board lists). Use it for the KPI tile and add a tooltip: "Overdue drawing‑set packages + unlinked submittals past their required date." (Removes the silent two‑definition merge.)
- **Critical Work Queue dedup:** sort the merged `[...overdue, ...needsAction, ...dueSoon]` by `itemUrgency` **before** the `Map`‑based dedup so the top‑12 is deterministic priority order (today insertion order can surface a lower‑priority duplicate first).

### Workstream 4 — Efficiency / scale

- **Virtualize** the Drawing Register table (`components.tsx` `DrawingRegisterTable`) and the Revision Impact board (`RevisionImpactBoard`) using `@tanstack/react-virtual` — apply windowing only above a row threshold (e.g. >100 rows) so small projects render unchanged.
- **Embedded Submittal tab:** read `SubmittalsPage` first. If it can cleanly accept `submittals` / `kpis` / `roundsBySubmittal` as optional props, pass the hub's data and skip its internal fetch; if its internal `useSubmittals` is load‑bearing (filters/aging/cycle‑time that need the raw hook), confirm the shared React Query key dedupes the network call and document that instead of refactoring. Decide during implementation; do not destabilize the standalone `Submittals` route.

---

## 3. Data & reasoning summary

- "Open RFI" → one predicate (`entityPredicates.isRfiOpen`), Title‑Case `{Answered,Closed,Void}` = closed.
- 3D element status → set‑readiness when linked, else element `fab_status`, else unknown; panel labels reflect reality.
- Overdue KPI → single triage‑based definition.
- No schema changes. No new dependencies. No changes to the IFC import or the `Submittals` standalone page's behavior.

---

## 4. Testing

- **Unit:** shared `isRfiOpen` agreement test; new `drawingHealthScore` tests (factor deductions, grade/band, fleet rollup, empty/missing‑date inputs); new `modelElementStatus` tests (precedence: set‑linked vs `fab_status` fallback vs unknown; piece‑mark normalization retained where still used); update `revisionImpactBoard` tests for the Answered‑closed change.
- **Full ladder:** lint · typecheck · typecheck:js · typecheck:strict · typecheck:noimplicitany · `npm test` (use `--maxWorkers=2` for a clean local signal on Windows) · production build — all green; no growth of the strict/noImplicitAny ignore lists.
- **Field verification (required before "done"):** in the running app on a real project's Detailing Control Center — the Overdue KPI matches the board, the 3D Model tab shows honest labels + fab‑status coloring (not "0% mapped"), the Revision Impact board's open‑RFI counts reflect Answered‑as‑closed, and the Drawing Register / Revision Impact tabs scroll smoothly on a large project.

---

## 5. Out of scope / follow‑ups

- Real model‑element → drawing‑set linkage (import + schema work) — a separate project.
- Adding `rfi.fab_hold` / `rfi.piece_marks` columns + per‑piece RFI hold UI (only worthwhile if that workflow is actually wanted).
- Consolidating the hub's urgency logic with `commandCenter/urgencyEngine` (two surfaces, both currently correct).
- Age‑based sorting for no‑date triage items; surfacing "blocking" work packages in the hub (audit observations, not in this scope).
