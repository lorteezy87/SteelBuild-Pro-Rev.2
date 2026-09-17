# SteelBuild Pro UI Redesign Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry the approved SteelBuild-Pro industrial operating-system UI from the Phase 1 shell into the operational chain RFIs → Detailing/Submittals → Work Packages → Piece Register → Fab Release, while preserving each page's existing data, mutation, permission, canonicalization, and release-gate authority.

**Architecture:** Wave 2 is a presentation migration, not a workflow rewrite. Each domain keeps its current owning page/container and derives presentation from already-loaded evidence. Shared command primitives provide the same page grammar and visual semantics across the five modules. Existing validators, canonical piece selectors, submittal lifecycle derivations, RFI downstream logic, and fab-release gate data remain authoritative. Pages may reorganize visual hierarchy and columns, but must not manufacture status or duplicate business rules.

**Tech Stack:** Vite, React 18, TypeScript/TSX for new source files, existing JSX/TSX owners, TanStack Query, Supabase, Vitest, Testing Library, CSS custom properties, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-16-steelbuild-pro-ui-redesign-design.md`

## Global Constraints

- Dark and light themes receive equal visual emphasis and use the Phase 1 SteelBuild-Pro orange/steel token system.
- Brand orange `#FF5A1F` is for identity, selection, and primary actions; success, warning, danger, and informational state colors remain semantically independent.
- Keep command surfaces under `[data-skin="command"]` and consume `--cmd-*`/canonical token aliases. Do not wrap them in `.sbd-*` chrome or force one theme.
- Preserve route identities, deep links, query keys, mutation handlers, RLS assumptions, permission gates, audit behavior, source-of-truth rules, number allocation, and cache invalidation.
- Preserve Submittals as the approval source of truth and current set/revision semantics.
- Preserve Piece Register canonical leaf-piece selection, lot/container rules, import/reconciliation flows, relationships, production station logic, and logistics mutations.
- Fab Release must consume existing readiness/release-gate evidence; do not implement a second release validator in presentation code.
- RFI "Answered" is a correspondence state, not proof that downstream drawing/work-package/fab action is complete.
- Missing or unavailable evidence must remain unknown/unavailable; never convert it to a successful or empty state.
- New source files under `src/` must be `.ts`/`.tsx`; existing `.jsx` files may be edited where they already own behavior.
- Do not add new `<form>` wrappers or Radix Dialog usage.
- Keep keyboard navigation, compact/comfortable density, high contrast, font scale, and responsive behavior intact.
- Before claiming a task complete, run its focused tests plus `npm run lint`, `npm run check:no-new-js`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany`, `npm test`, and `npm run build` at the end of the wave.

---

## Task 1: Add Wave 2 shared operational primitives

**Files:**
- Create: `src/components/command/StatusBadge.tsx`
- Create: `src/components/command/ImpactBadge.tsx`
- Create: `src/components/command/DateRiskCell.tsx`
- Create: `src/components/command/WorkflowStage.tsx`
- Create: `src/components/command/DetailRail.tsx`
- Modify: `src/components/command/index.ts`
- Modify: `src/styles/command.css`
- Create: `src/components/command/__tests__/wave2Primitives.test.tsx`

**Public interfaces:**
- `StatusBadge({ label, tone, title? })` with tones `neutral | accent | success | warning | danger | info`.
- `ImpactBadge({ label, level })` with levels `none | low | medium | high | critical`; text is always rendered so color is never the sole signal.
- `DateRiskCell({ label?, value, risk, detail? })` with risk `neutral | upcoming | warning | overdue | unknown`.
- `WorkflowStage({ stages, currentStage, compact? })`; stages are `{ id, label, state?: "complete" | "current" | "blocked" | "upcoming", detail? }`.
- `DetailRail({ title?, sections, actions? })`; sections are `{ key, label, value, tone?, detail? }` and remain presentation-only.

- [ ] Write `wave2Primitives.test.tsx` first. Assert semantic text, accessible labels, keyboard-safe button behavior where interactive, unknown-date rendering, and that critical/warning labels remain visible without relying on color.
- [ ] Run `npx vitest run src/components/command/__tests__/wave2Primitives.test.tsx` and confirm RED because the primitives do not exist.
- [ ] Implement only the interfaces above using command tokens and add exports. Avoid domain-specific logic.
- [ ] Add compact, responsive, dark/light-safe CSS classes to `command.css`; no hard-coded page background/text values in React.
- [ ] Run the focused test and existing `referencePrimitives.test.tsx`; confirm GREEN.
- [ ] Commit as `ui: add Wave 2 operational command primitives`.

---

## Task 2: Migrate the RFI Control Center to the operational page grammar

**Files:**
- Modify: `src/pages/rfis/RfiControlCenter.tsx`
- Modify: `src/pages/rfis/RfiTable.tsx` if present, otherwise the existing canonical list/table component used by `RfiControlCenter`
- Modify: `src/pages/rfis/DetailPanel.jsx`
- Modify: `src/pages/rfis/RFIs.css`
- Modify: `src/pages/rfis/rfiControlCenter.derive.ts`
- Modify: `src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts`
- Modify: `src/pages/rfis/__tests__/RfiControlCenter.render.test.tsx`
- Modify: `src/pages/rfis/__tests__/RfiControlCenter.trust.test.tsx`
- Keep data/mutation authority in: `src/pages/RFIs.jsx`

**Presentation contract:**
- Header uses `PageHeader`; summary uses `OperationalSummary`; work queues use `AttentionQueue`.
- Default register order: `RFI # | Subject | Sent | Days Open | Required By | Ball in Court | Impact | Linked WP | Status`.
- Operational filters cover: overdue; due within 3 days; blocking detailing; blocking fab/release; field-impacting; unanswered external; answered with downstream work.
- Detail presentation becomes a two-column workspace: question/response/attachments/drawings/correspondence in the main body; status/BIC/dates/required-by/relationships/impact/downstream action in `DetailRail`.
- "Answered" must stay distinct from downstream completion.

- [ ] Extend derive tests first for operational queues/filter predicates using existing RFI evidence. Include a case where an answered RFI still has downstream impact and therefore remains actionable.
- [ ] Run focused derive/render/trust tests and confirm the new assertions RED.
- [ ] Migrate `RfiControlCenter.tsx` from `PageHero/KpiStrip/DecisionPanel` to the Phase 1 primitives, reusing all existing callbacks and page-owned modal slots.
- [ ] Reorder/register columns and wire visual filter controls to existing state/derived evidence. Do not add write behavior.
- [ ] Recompose `DetailPanel.jsx` visually into main + rail without changing mutation callbacks, attachment behavior, or deep-link identity.
- [ ] Run RFI tests including `RfiInteractions.test.tsx`, status, mutation, overdue-alert, portfolio-scope, and table-layout tests; confirm GREEN.
- [ ] Commit as `ui: migrate RFI control center to SteelBuild operations layout`.

---

## Task 3: Unify Detailing and Submittals around the approval lifecycle

**Files:**
- Modify: `src/pages/drawingSubmittalHub/DetailingCommandShell.tsx`
- Modify: `src/pages/drawingSubmittalHub/DetailingCommandHeader.tsx`
- Modify: `src/pages/drawingSubmittalHub/ControlBoardPanel.tsx`
- Modify: `src/pages/drawingSubmittalHub/ApprovalMatrixPanel.tsx`
- Modify: `src/pages/submittals/SubmittalRegisterPanel.tsx`
- Modify: `src/styles/command.css`
- Modify/create focused tests under `src/pages/drawingSubmittalHub/__tests__/` and `src/pages/submittals/__tests__/`
- Keep data/mutation authority in: `src/pages/DrawingSubmittalHub.tsx` and `src/pages/Submittals.tsx`

**Presentation contract:**
- Lifecycle is displayed as `IFA → OFA → BFA → OFS → IFC → Released`, using existing stage derivation rather than writing new workflow transitions.
- Package rows emphasize current stage, owner/ball-in-court, production-required date, unresolved comments, and release readiness.
- Add a Production Readiness Queue with columns `Package | Current Stage | Required IFC | Fab Start | Float | Blocker`, using already-derived schedule/review evidence and explicit unknown values when evidence is missing.
- Detail/register presentation keeps sheet register, revision history, approval state, comments, related RFIs/WPs/pieces, release eligibility, and transmission history connected.

- [ ] Add/extend shell tests first for the shared `PageHeader`/lifecycle presentation and Production Readiness Queue contract. Add an unknown-evidence case that renders `—`/unknown rather than a guessed float.
- [ ] Run `DetailingCommandShell`, `ApprovalMatrixPanel`, `ControlBoardPanel`, and Submittal Register focused tests; confirm the new expectations RED.
- [ ] Replace bespoke header/KPI chrome with Phase 1/Wave 2 primitives while retaining tab IDs, routing, project-number preference, holds count, and existing panel children.
- [ ] Add the lifecycle/queue presentation from existing derived set/submittal data. Do not change approval transition logic or set/revision writes.
- [ ] Migrate standalone Submittal Register chrome to the same visual language while leaving list/detail workflow components and callbacks authoritative.
- [ ] Run all drawing/submittal hub and submittal tests; confirm GREEN.
- [ ] Commit as `ui: unify detailing and submittal approval workspace`.

---

## Task 4: Migrate Work Packages to readiness-first execution control

**Files:**
- Modify: `src/pages/workPackages/WpControlCenter.tsx`
- Modify: `src/pages/workPackages/components.tsx`
- Modify: `src/pages/workPackages/styles.ts`
- Modify: `src/pages/workPackages/wpControlCenter.derive.ts`
- Modify: `src/pages/workPackages/__tests__/wpControlCenter.derive.test.ts`
- Modify/add presentation tests under `src/pages/workPackages/__tests__/`
- Keep data/mutation authority in: `src/pages/WorkPackages.tsx`

**Presentation contract:**
- Default register order: `WP | Description | Sequence | Tons | Pieces | Drawing Status | Material | Fab | Ship | Field | Risk`.
- Header/summary/queues use shared primitives.
- Package detail groups operational content into `Scope`, `Release Gate`, `Production`, `Logistics`, and `Field` sections.
- Readiness/risk labels are derived from current drawing, fab-release, canonical piece, delivery, and field evidence already present in the enriched model.

- [ ] Add derive/presentation tests first for the required columns and the five detail sections. Add an evidence-missing test that does not report a false ready state.
- [ ] Run WP focused tests and confirm RED on the new presentation contract.
- [ ] Migrate `WpControlCenter.tsx` from `PageHero/KpiStrip/DecisionPanel` to `PageHeader/OperationalSummary/AttentionQueue/WorkflowStage` while keeping every callback and slot unchanged.
- [ ] Recompose register/detail components and styling to the approved dense table/detail-rail grammar.
- [ ] Run WP analytics, canonical, creation, derive, form/detail modal, and presentation tests; confirm GREEN.
- [ ] Commit as `ui: redesign work package readiness workspace`.

---

## Task 5: Integrate the canonical Piece Register with the new command system

**Files:**
- Modify: `src/pages/PieceRegister.tsx`
- Modify: `src/pages/pieceRegister/PieceRegisterRegisterView.tsx`
- Modify: `src/pages/pieceRegister/PieceRegisterOverview.tsx`
- Modify: `src/styles/piece-control-command.css`
- Modify/create focused tests under `src/pages/pieceRegister/__tests__/`
- Do not change canonical repositories/selectors under `src/lib/pieceControl/**` unless a presentation test proves an existing derivation helper is required and the change is behavior-neutral.

**Presentation contract:**
- Main register columns: `Piece Mark | Qty | Main Mark | Shape | Weight | WP | Sequence | Drawing | Release | Fab | Load | Ship | Erect`.
- Piece Mark and core identifiers remain sticky on wide tables.
- Selected-row bulk actions appear contextually only when pieces are selected.
- Grouping/lots/splits visibly distinguish canonical pieces from split/container records without altering canonical selection rules.
- Existing Overview, Revision Impact, Register, Package Board, Import, Relationships, Production, Logistics, and Settings routes/views remain reachable.

- [ ] Extend Piece Register presentation/register tests first for header migration, required column order, sticky identity class/attribute, and contextual bulk bar behavior. Confirm canonical leaf/container test coverage remains intact.
- [ ] Run focused Piece Register tests and confirm RED on new presentation expectations.
- [ ] Replace top-level `PageHero/KpiStrip/DecisionPanel` chrome with `PageHeader/OperationalSummary/AttentionQueue` while preserving all query/mutation/selection code.
- [ ] Restyle the register view to the required column hierarchy and sticky identifiers. Reuse existing sort/filter/selection APIs.
- [ ] Apply dark/light/compact density styling through `piece-control-command.css`; do not encode lifecycle truth in CSS.
- [ ] Run all Piece Register and piece-control component tests; confirm GREEN.
- [ ] Commit as `ui: integrate Piece Register with SteelBuild command system`.

---

## Task 6: Redesign Fab Release around explicit gate authority

**Files:**
- Modify: `src/pages/fabRelease/FabReleaseControlCenter.tsx`
- Modify: `src/pages/fabRelease/components.tsx`
- Modify: `src/pages/fabRelease/styles.ts`
- Modify: `src/pages/fabRelease/fabReleaseControlCenter.derive.ts`
- Modify: `src/pages/fabRelease/__tests__/fabReleaseControlCenter.derive.test.ts`
- Modify/add focused presentation tests under `src/pages/fabRelease/__tests__/`
- Keep query/mutation/release authority in: `src/pages/FabRelease.tsx`

**Presentation contract:**
- Header and summary use shared command primitives.
- Ready/blocked/recently-released queues use `AttentionQueue` and show package identity, readiness, blocker, and next-action context.
- Blocked releases surface concrete existing evidence, e.g. `RELEASE BLOCKED — 2 IFC sheets missing · RFI 018 unresolved`, but only from authoritative gate/flag data that actually exists.
- If blocker evidence is unavailable, use explicit unknown/unavailable copy rather than inventing a reason.

- [ ] Add derive tests first for deterministic blocker summarization from existing `FabSignals.flags`/drawing evidence, including multiple blockers and unknown evidence. Do not test or implement a new permission/release validator.
- [ ] Run Fab Release derive/parity tests and confirm RED on the new presentation summary.
- [ ] Migrate `FabReleaseControlCenter.tsx` to `PageHeader/OperationalSummary/AttentionQueue/WorkflowStage`, preserving all toolbar/filter/body slots and `onOpenWP` behavior.
- [ ] Update row/detail components to display authoritative release-gate summaries and use shared badges/date-risk cells.
- [ ] Run Fab Release parity, release-status, export, analytics, derive, and canonical release tests; confirm GREEN.
- [ ] Commit as `ui: make fab release gate status explicit`.

---

## Task 7: Wave 2 integration, accessibility, and full verification

**Files:**
- Modify only the migrated Wave 2 CSS/tests needed to fix integration regressions.
- Update this plan's checkboxes as tasks complete.

- [ ] Run targeted suites for command primitives, RFI, detailing/submittals, work packages, Piece Register, and Fab Release.
- [ ] Verify dark theme, light theme, high-contrast mode, compact density, comfortable density, keyboard row navigation, mobile/tablet responsive paths, and selected-row bulk behavior using existing component/acceptance tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run check:no-new-js`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run typecheck:js`.
- [ ] Run `npm run typecheck:strict`.
- [ ] Run `npm run typecheck:noimplicitany`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Confirm the GitHub CI workflow is green on the Wave 2 head commit, including dependency audit and Supabase drift jobs.
- [ ] Keep PR #422 draft until the full redesign wave is reviewed; do not merge or deploy unless explicitly requested.
- [ ] Commit final integration fixes as `ui: complete SteelBuild redesign wave 2 verification`.
