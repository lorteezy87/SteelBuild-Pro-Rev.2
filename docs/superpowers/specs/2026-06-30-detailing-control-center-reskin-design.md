# Detailing Control Center Re-skin — Design Spec

- **Date:** 2026-06-30
- **Status:** Approved (design) — pending spec review, then implementation plan
- **Author:** AI engineering agent (with owner)
- **Branch:** `claude/command-ui-detailing` (cut from latest `origin/main`)
- **Sub-project of:** the app-wide **Command UI** light Control Center redesign (the same effort that shipped ~20 `*ControlCenter.tsx` pages, e.g. RFIs, Deliveries, Procurement).

---

## 1. Context

The **Detailing module** — the Drawing & Submittal Control Center (`src/pages/DrawingSubmittalHub.tsx` + `src/pages/drawingSubmittalHub/`) — is the **moat workflow** (drawings + submittals + RFI linkage; CLAUDE.md §2.5, §20–21). It is also the **one remaining core module never converted to the `command_ui` Control Center kit**. Every other main page branches `if (commandUi) return <XControlCenter/>` onto the light kit (`src/components/command/` + `src/styles/command.css`); the hub still renders bespoke, inline-styled, against the dark/light theme tokens with no `[data-skin="command"]` set. (Confirmed: agent-memory `detailing-hub-not-on-command-kit`, and a fresh two-pass audit on 2026-06-30.)

Owner direction (2026-06-30): **"Finalize the UI/UX on the entire detailing module. Polish to enterprise-ready."** Brainstorming resolved that to a full re-skin onto the proven kit.

The effort is **too large for one spec**. It decomposes into 5 sequential sub-projects (§3). **This spec covers Sub-project 1 — Foundation + Control Board** — the first vertical slice that stands up the shell (hero + KPI strip + on-skin tab nav) and converts the default Control Board tab, from which the remaining tabs/pages/modals replicate.

### Decisions locked in brainstorming (2026-06-30)

| Decision | Choice |
| --- | --- |
| Direction | **Re-skin onto the `command_ui` kit** (not in-place polish). Match Deliveries/Procurement/RFIs. |
| Scope | **Everything in the flow** — hub + 8 tabs, standalone Drawings (Full Editor) + Submittals pages, ~14 modals, PDF/3D viewer chrome. |
| Theme | **Light-first.** The kit is a light island that ignores `data-theme`, so command_ui detailing is **always light** — dark-mode command_ui is a separate kit-wide effort, out of scope. |
| Build sequence | **Foundation-first, slice by slice.** Shell + shared primitives + Control Board first; then registers → boards/matrix → modals → viewer. Small, reviewable, field-verified PRs. |
| Rollout flag | **Gate on the existing global `command_ui` flag** (already `enabled` globally; `desktop_shell` off). No new flag. |
| Go-live cadence | **Go live each slice.** Each slice ships to all users on merge. ⇒ **graceful degradation is mandatory** (§4.4): un-converted tabs must stay legible during the transition. |
| Visual proof | **No mockup.** The kit look is proven across ~20 pages; proceed straight to spec/build. |

---

## 2. Goal & Non-Goals

### Goal

Re-skin the Detailing Control Center onto the light **Command UI** kit, **behavior-preserving** (identical data, read-models, mutations, helpers, exports, row actions, escalation, and the submittal/drawing workflow — only presentation changes), starting with the **shell + Control Board** vertical slice. Establish the reusable on-skin primitive (`cmd-tabs`) and the `derive.ts` mapping that every later slice reuses.

### Non-Goals (explicit — do NOT do in this slice or this project)

- **No schema changes.** Every KPI/panel/row in the slice is fed by read-models the hub already computes (`triage`, `drawingKpis`, `kpis`, `fabReady`, `fleetHealth`, `setPackages`). No migrations.
- **No workflow / mutation changes.** Submittal stage flow (§20), drawing-set rollups (§21), fab-release gating, owner/due-date/detailing-state edits, escalation (RFI/PCO), revision-compare — all behave exactly as today.
- **No dark theme for the kit.** Light-only; command_ui = light island.
- **No changes to read-model logic** in `format.ts`/`DrawingSubmittalHub.tsx` — the derive layer consumes them, it does not rewrite them.
- **No conversion of the other 7 tabs / standalone pages / modals / viewer in Sub-project 1** — those are Sub-projects 2–5. SP1 must leave them **legible** (§4.4), not converted.

---

## 3. Decomposition — the 5 sub-projects

Each is its own spec → plan → build → field-verify cycle. All ship behind `command_ui`, go-live on merge.

| # | Sub-project | Scope | New on-skin primitives needed |
| --- | --- | --- | --- |
| **1** | **Foundation + Control Board** *(this spec)* | Flag branch + scoped-skin shell (`PageHero` + `KpiStrip` + tab nav) + `derive.ts`; convert the **Control Board** (`overview`) tab — FleetHealth + Triage — onto `DecisionPanel`/`DataTable`/`Pill`, preserving inline owner/due/detailing-state editors, escalate, compare. | `cmd-tabs`/`cmd-tab` (count badges, gold active) |
| **2** | **Registers** | Drawing Register, Submittal Register (embedded `SubmittalsPage`), Doc Control 4-view sub-nav. Re-skin the embedded Drawings/Submittals surfaces so they don't render dark inside the light hub. | `cmd-segmented` (sub-nav), reuse `DataTable`/`FilterBar` |
| **3** | **Boards & Matrix** | Process Board (kanban), Approval Matrix grid, Revision Impact board, StagePipeline chevrons. | `cmd-board`/`cmd-column`/`cmd-card`, `cmd-matrix`, `cmd-pipeline` |
| **4** | **Modals** | A single shared **command-dialog light skin** layer, then sweep the ~14 upload/revision/markup/approval/escalate modals (beyond the Deliveries precedent, which left its modals unstyled). | `cmd-dialog` skin |
| **5** | **Viewer & 3D** | PDF/drawing viewer chrome (`DrawingViewer`, annotation toolbar/zone panel) + the 3D Model tab chrome. | `cmd-viewer` chrome |

---

## 4. Shared architecture (all slices)

Mirrors the proven `Deliveries → DeliveryControlCenter` / `RFIs → RfiControlCenter` convention.

### 4.1 The data owner stays the data owner

`DrawingSubmittalHub.tsx` remains the **single source of truth** for queries, mutations, cache keys, URL tab state, and all read-models. We add a flag branch:

- **`command_ui` ON** → `return <DrawingSubmittalControlCenter {...readModels} {...handlers} controlBoard={…} />`. The Control Center is **presentation only** — it receives computed read-models + callbacks as props and calls the same mutation handlers. No new queries, no new mutations, no new cache keys. Existing hub/format tests stay valid because the data layer is untouched.
- **`command_ui` OFF** → today's bespoke hub, unchanged (the classic fallback; still used for the flag-off case and as the regression baseline).

### 4.2 New files (foundation, reused by every slice)

- `src/pages/drawingSubmittalHub/DrawingSubmittalControlCenter.tsx` — the light shell composition.
- `src/pages/drawingSubmittalHub/drawingControlCenter.derive.ts` — **pure**, unit-tested: read-models → kit props (`KpiCellDef[]`, `HeroChip[]`/`HeroStat[]`, Control Board sections, tones). New `.ts`, not folded into `format.ts`, so it is independently typed/tested and strict-null/no-implicit-any clean.
- `src/pages/drawingSubmittalHub/__tests__/drawingControlCenter.derive.test.ts` — tests for the pure helpers.

### 4.3 Scoped skin (NOT `<html>`-level)

The other Control Centers call `useCommandSkin()` to set `[data-skin="command"]` on `<html>` because their whole page is converted. The hub mid-transition has un-converted tabs, so we **scope `[data-skin="command"]` to the Control Center wrapper `<div>`** instead. The `command.css` selectors (`[data-skin="command"] .cmd-*`) work identically whether the attribute is on `<html>` or a container, as long as the `cmd-*` elements are descendants. This lets converted panels render in the light island while un-converted legacy panels (rendered outside the skinned subtree) resolve their normal themed surfaces.

### 4.4 Graceful degradation (because we go live each slice)

DOM structure: the Control Center root renders **two regions** — a skinned shell region `<div data-skin="command">` (hero + KPI + tab nav + any converted tab panel) and, when the active tab is **not yet converted**, a **sibling region with NO `data-skin`** that hosts the existing legacy component. So a converted tab is fully inside the light island; a legacy tab's content sits outside it and resolves the app's normal themed surfaces (its own background + tokens), never dark-text-on-white. The result is a clean horizontal seam — light shell above, themed panel below — that is legible in both regions. As each slice lands, its tab moves from the sibling region into the skinned region. **Every slice is field-verified in this in-between state** before it ships. (Owner accepted this trade in brainstorming.)

---

## 5. Sub-project 1 — Foundation + Control Board

### 5.1 Kit mapping — verified against existing read-models (no schema change)

All values below already exist in `DrawingSubmittalHub.tsx` render (lines ~692–908) — the derive layer reshapes them, it does not recompute them.

| Shell element | Backing read-model (existing) | Kit target |
| --- | --- | --- |
| Hero title / subtitle | static "Drawing & Submittal Control" + project subtitle | `PageHero` `title`/`subtitle`/`projectName` |
| Hero chips | `triage.overdue.length` (danger), `triage.atRiskCount` (warn), `drawingKpis.inReview` (info), `triage.unlinkedSubmittalItems.length` (warn) | `PageHero` `chips: HeroChip[]` |
| Hero action | Lead Times button → `setLeadModalOpen(true)` | `PageHero` `children` (on-skin `cmd-btn--ghost`) |
| KPI 1 Drawing Sets | `drawingKpis.totalSets` / sub `${totalSheets} active sheets` | `KpiStrip` cell, tone `neutral` |
| KPI 2 Sets Released | `drawingKpis.released` | tone `good` |
| KPI 3 Sets In Review | `drawingKpis.inReview` | tone `info` |
| KPI 4 Submittals | `kpis.total` / sub `${kpis.pending} pending` | tone `neutral` |
| KPI 5 Needs Action | `kpis.rejected` | tone `warn` |
| KPI 6 Overdue | `triage.overdue.length` / existing composed sublabel | tone `danger` |
| KPI 7 Fab Ready | `${fabReady.numerator}/${fabReady.denominator}` / sub `${fabReady.percent}% released` | tone `good` |
| Tab nav (8) | `TABS` (+ `model3d` when `viewer_3d`), `tabCounts[key]`, `activeTab`/`setActiveTab` | new `cmd-tabs`/`cmd-tab` |
| Control Board panels | `triage` (overdue / dueSoon / needsAction / next-decision), `fleetHealth`, `sequenceReadiness`, `revisionImpact`, `modelMapping` | `DecisionPanel` ×N + `DataTable` |
| Control Board row chips | submittal status/stage, due tone (`dueInfo`), `getActionTone` | `Pill` + `statusTone` (extend mapping for submittal stages) |

`KpiStrip` CSS is `repeat(7, 1fr)` — exactly the 7 KPIs. The 8th+ tab (`model3d`) only appears under `viewer_3d`, handled by the tab nav, not the KPI strip.

### 5.2 Layout (top to bottom)

1. `PageHero` — detailing icon (`FileStack`/`Layers3`), title, purpose line, project + 4 status chips, Lead Times action.
2. `KpiStrip` — the 7 KPI cells (§5.1).
3. The existing **zero-state legibility note** (no drawing sets yet but submittals exist) — re-skinned on the light island.
4. **Tab nav** (`cmd-tabs`) — 8 tabs with count badges + gold active state.
5. **Control Board panel** (active tab `overview`): FleetHealth summary + Triage decision panels (Overdue · Due Soon · Needs Action · Next Decision) using `DecisionPanel`/`DataTable`, preserving inline **owner**, **due-date**, **detailing-state**, and **readiness** editors, the **Escalate** (RFI/PCO) action, and **Compare revision**.

### 5.3 Wiring (behavior-preserving)

The Control Board panel receives `triage`, `kpis`, `drawingKpis`, `fleetHealth`, `sequenceReadiness`, `revisionImpact`, `modelMapping`, `modelElementRows` and the exact handler set already passed to `TriageBoard` (`onUpdateOwner`, `onUpdateDueDate`, `onAdvanceDetailing`, `onToggleReadiness`, `onEscalate`, `onCompareRevision`, `onImportModelElements`, `onOpenTab`, `isSaving`). It calls the same mutations (`updateOwnerMut`, `updateDueDateMut`, `updateDetailingStateMut`, `updateReadinessFlagMut`) — no change to write paths, cache invalidation, or the `["drawing-register", projectId]` key.

### 5.4 Legacy tabs in SP1

Tabs `process`, `drawings`, `submittals`, `matrix`, `revimpact`, `doccontrol`, `model3d` render their **existing** components, **outside** the command-skinned subtree (§4.4), so they stay legible. They convert in Sub-projects 2–5.

### 5.5 Modals reachable from Control Board

`EscalateModal`, `RevisionSummaryCard`, `RFIFormModal`, `LeadTimesModal`, `RevisionCompareModal` render in portals outside the light island → they will look themed/dark in SP1. That is **expected** and fixed wholesale in Sub-project 4 (`cmd-dialog` skin). Flag in field-verify; do not patch piecemeal in SP1.

---

## 6. New code (file-by-file, SP1)

**New:**
- `src/pages/drawingSubmittalHub/DrawingSubmittalControlCenter.tsx` — shell + Control Board composition (presentation).
- `src/pages/drawingSubmittalHub/drawingControlCenter.derive.ts` — pure read-model → kit-prop mappers + tone helpers.
- `src/pages/drawingSubmittalHub/__tests__/drawingControlCenter.derive.test.ts` — unit tests.

**Modified (minimal):**
- `src/pages/DrawingSubmittalHub.tsx` — add `const commandUi = useFlag("command_ui")` and the `if (commandUi) return <DrawingSubmittalControlCenter …/>` branch; pass existing read-models/handlers. No data/mutation changes.
- `src/styles/command.css` — add the `cmd-tabs`/`cmd-tab` block (scoped under `[data-skin="command"]`), plus any Control-Board-specific on-skin classes (inline editors, fleet strip).
- `src/components/command/index.ts` — only if a new shared component is extracted (otherwise untouched).

**Untouched:** `format.ts` read-model logic, `components.tsx` (legacy `TriageBoard` etc. stay for the flag-off branch and SP1 legacy tabs), all mutations, all other pages.

**Flag:** `command_ui` already exists and is global — **no flag seed needed**.

---

## 7. Theming / scoped skin

- New on-skin classes live under `[data-skin="command"]` in `command.css` (never leak to the classic app).
- `[data-skin="command"]` is set on the **Control Center wrapper div** (§4.3), not `<html>`.
- Tokens are the kit's existing light palette: `--cmd-surface` white cards, `--cmd-border` gray edges, **gold accent `--cmd-gold` #F2A706** for active tab/primary/focus, semantic `--cmd-good/warn/danger/info/review`. Every text element sets color explicitly (the kit's "light island in a dark app" rule).
- **Accessibility upgrades folded in** (the audit's a11y gaps): real `:focus-visible` rings on tabs/inputs/buttons, `aria-label`s on icon-only controls, `aria-current` on the active tab, ≥44px touch targets on tab/row controls, status conveyed by text+pill not color alone.

---

## 8. Rollout & validation

- **Flag:** `command_ui` (already global-ON). SP1 goes live to all users on merge.
- **Validation ladder (pre-deploy, CLAUDE.md §9):** `lint`, `typecheck`, `typecheck:js`, `typecheck:strict`, `typecheck:noimplicitany`, `vitest run --maxWorkers=2` (full; Windows gotcha), `vite build`. New `derive.ts` unit-tested; existing hub/format tests must stay green (proves behavior preserved).
- **Field-verify (required, CLAUDE.md §32 — moat workflow):** owner signs in as `nickl@shsteelaz.com`, opens the Detailing Control Center, confirms: KPI parity vs the legacy hub, Control Board triage rows + Next Decision correct, inline owner/due/detailing-state edits still persist, Escalate (RFI/PCO) works, Compare-revision opens, tab switching + the **legacy-tab seam** look acceptable, responsive at iPad width, focus rings visible. The agent cannot auth into the live app, so this is owner-driven; SP1 is labeled **code-verified, NOT field-verified** until the owner confirms.
- **Deploy:** CI-gated `main` (push a **verified SHA**, never `HEAD:main` — shared checkout, ~concurrent agents). Watch `gh run`. Add an `AGENT_CLAIMS.md` row for the detailing files before editing (a parallel dark-theme effort touches the same area).
- **Isolation:** implement in a git worktree on `claude/command-ui-detailing`.

---

## 9. Out of scope / explicit follow-ons

1. **Sub-projects 2–5** (registers, boards/matrix, modals, viewer) — each its own spec → plan → build, reusing this foundation.
2. **Dark-mode command_ui** for the whole kit (a separate kit-wide effort).
3. **Standalone-route conversion** of `/Drawings` (Full Editor) and `/Submittals` beyond their embedded-in-hub appearance (folded into SP2 scope, sequenced there).
4. Retiring the legacy bespoke hub once command_ui is permanent (a later cleanup once the flag is genuinely universal).

---

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Half-skinned hub looks broken between slices | Scoped skin + graceful degradation (§4.4); legacy tabs render legibly in app theme; field-verify the seam each slice. |
| Behavior regression in triage edits / escalation | Data/mutation layer in `DrawingSubmittalHub.tsx` untouched; Control Center is presentation-only; existing hub/format tests must stay green. |
| Scoped CSS leaks into classic app or other Control Centers | Every rule under `[data-skin="command"]`; build with flag off and confirm the legacy hub unchanged; confirm no `<html>`-level skin set. |
| KPI/triage values drift from legacy | `derive.ts` is pure + unit-tested with parity assertions against the read-model shapes; field-verify KPI numbers match the legacy hub side-by-side. |
| "Looks done" but not field-verified (the fab-status cautionary tale) | Owner field-verify gate is mandatory before "done"; label code-verified-only until then. |
| Concurrent-agent churn on shared files (`command.css`, hub) | Worktree isolation; `AGENT_CLAIMS.md` row; deploy a verified SHA; rebase on reject. |
| Modals look dark in SP1 | Expected; documented (§5.5); fixed wholesale in SP4. Do not patch piecemeal. |

---

## 11. Definition of done (Sub-project 1)

- Detailing Control Center renders the light shell (hero + 7-KPI strip + on-skin tab nav) and a fully converted **Control Board** tab on real read-models, behind `command_ui`.
- All KPIs/chips/triage rows map to existing read-models (no fiction, no schema change); values match the legacy hub.
- Inline owner/due/detailing-state/readiness edits, Escalate (RFI/PCO), and Compare-revision behave identically to the classic hub.
- Un-converted tabs render legibly (graceful degradation verified).
- New `derive.ts` unit-tested; full validation ladder green; build green.
- Owner has **field-verified** in the running app (or it is explicitly labeled code-verified-only with a field-verify TODO).
- The `cmd-tabs` primitive + `derive.ts` pattern are reusable by Sub-project 2 without rework.
