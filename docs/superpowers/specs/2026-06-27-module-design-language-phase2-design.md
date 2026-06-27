# SteelBuild Pro — Module Design Language (Phase 2 Design Spec)

Date: 2026-06-27
Status: Approved design — pending implementation plan
Owner: Nick (product owner)
Author: AI engineering agent (brainstorming session)

---

## 1. Goal

Phase 1 gave SteelBuild Pro a premium desktop **shell + photographic launcher**. Phase 2
brings the **module screens behind each tile** up to the same bar, so the polish doesn't
stop at the front door. Each module is redesigned to the highest quality, but built from
a **single shared design language / component kit** so all ~31 screens feel like one
product.

Success = clicking any tile opens a screen that looks as considered and premium as the
launcher, while staying **dense, functional, and behavior-preserving** for real steel
workflows. This is a deliberate differentiator vs. competitor PM tools.

This continues the Phase 1 direction (see
`docs/superpowers/specs/2026-06-26-desktop-environment-redesign-design.md`) and the same
override of the CLAUDE.md "dense/quiet operational UI" default applies — but only to the
*chrome and framing* of screens. The data, tables, and controls stay dense and usable.

## 2. Confirmed decisions (from brainstorming)

1. **Depth: per-module redesign** on top of a shared kit — each screen's layout/IA is
   rethought for the new look, composed from common primitives (not 31 unrelated one-offs,
   not just a blanket polish layer).
2. **Header: photo-accent band** — every module opens with a slim (~100px) darkened
   banner that reuses the module's launcher photo (`photoFor(page)`), with icon + title +
   context subtitle + a right-aligned headline-KPI cluster + primary actions. Gradient
   fallback when no photo (mirrors the tile fallback).
3. **Shared kit first, modules in their own cycles after.** THIS spec covers the kit +
   proving it on **one flagship module: the Detailing Control Center**
   (`DrawingSubmittalHub` — the moat + the role-aware default landing). Each subsequent
   module (or domain batch) is its own spec → plan → implementation cycle, moat-first.
4. **Behavior-preserving.** Redesigns re-arrange existing data/logic into the kit
   primitives; they do not rewrite domain logic, mutations, hooks, or RLS.
5. **Flag-gated.** Lives under the desktop skin; off by default, owner-override on for
   dogfooding (same model as `desktop_shell`).

## 3. Non-goals

- No domain-logic, schema, RLS, or workflow changes (visual/layout only).
- No photography on the data body — the photo is the header banner only.
- Not redesigning all 31 modules in this spec — only the kit + the flagship.
- No migration off the `sbd-*` token system or to Tailwind-as-primary.

## 4. The kit (components)

New kit home: `src/components/desktop/module/`. All components consume the existing token
system + the Phase 1 `desktop.css` tokens; all are theme-, density-, contrast-, and
reduced-motion-aware; all expose `className` for per-screen composition.

### 4.1 `ModuleHeader`
Photo-accent identity band. Props: `page`, `title`, `subtitle?`, `stats?` (array of
`{label, value, tone?}`), `actions?` (ReactNode), `tabs?` (see 4.7), `photoSrc?` override.
- Reuses `photoFor(page)` as a `background <img>` (lazy) with a dark scrim; gradient
  fallback when null (same logic/spirit as `ModuleTile`).
- Left: module lucide icon (`getPageIcon`) + title + subtitle. Right: `StatTile` cluster
  (3–5 headline KPIs) + primary actions. White text on the dark band in both themes.
- Height ~96–112px desktop; collapses to a compact stacked variant on mobile.
- Accessible: header is a `<header>`; the decorative photo is `aria-hidden`; stats and
  actions are real, labeled controls.

### 4.2 `SectionCard`
The universal content grouping. Glass card evolving `sbd-card` + desktop tokens: 1px
border, 11–12px radius, subtle blur, `--desk-window-*`-aligned surfaces (light-theme
aware). Slots: `title`, `icon?`, `headerAction?` (e.g. "View all"), `children`. No
card-in-card nesting (per CLAUDE.md §25).

### 4.3 `StatTile`
KPI unit: muted label + value colored by semantic/phase tone (`gold/blue/teal/green/
amber/neutral/danger`). Used in `ModuleHeader` clusters and in-page KPI strips. Numbers
go through the existing rounding/`sbd-num` conventions.

### 4.4 `DataTable` pattern
Refined table styling (a documented pattern + small wrappers, not a heavy new grid):
muted uppercase column headers, hairline row separators, hover, sortable headers,
right-aligned numerics (`sbd-num`), inline **status pills**, and built-in empty/loading
rows. Reuses/evolves `sbd-table`. Large lists keep existing virtualization/pagination.

### 4.5 Charts
Recharts rendered inside `SectionCard`s on the accent + construction-phase palette
(detailing gold, fab blue, delivery teal, erection green), tooltip/legend themed.

### 4.6 States kit
Consistent, reusable `EmptyState` (icon + headline + one-line body + CTA),
`LoadingSkeleton` (card/table/header skeletons), `ErrorState`, and `PermissionDenied`
— all themed for dark + light. Replaces ad-hoc per-screen states.

### 4.7 In-module tabs
Standardize the existing hub `?x_tab=` pattern (Detailing Hub, Cost Hub, etc.) into one
tab style rendered in/under `ModuleHeader`, preserving the current query-param routing.

### 4.8 Layout
A responsive section grid (`auto-fit`/12-col) with one spacing rhythm; the body renders
inside the Phase 1 `ModuleSurface` window. Dark + light themes; respects
`data-density`, `data-contrast`, `data-motion`, and `--accent`.

## 5. Flagship proof: Detailing Control Center (`DrawingSubmittalHub`)

The kit is proven by rebuilding the Detailing Control Center with it:
`ModuleHeader` (detailing photo + drawings/submittals/RFI headline KPIs + actions + the
existing hub tabs) over the existing tab content re-housed in `SectionCard`s/`DataTable`s,
with the States kit wired in. **All existing hub behavior, data, mutations, tabs, the 3D
viewer, the revision-intelligence flows, and RLS stay intact** — this is a presentation
re-housing, validated by the existing hub tests + field verification.

## 6. Architecture / file structure

- Create `src/components/desktop/module/`: `ModuleHeader.jsx`, `SectionCard.jsx`,
  `StatTile.jsx`, `DataTable.jsx` (+ helpers), `states/` (`EmptyState`, `LoadingSkeleton`,
  `ErrorState`, `PermissionDenied`), `ModuleTabs.jsx`, and a barrel `index.js`.
- Extend `src/styles/desktop.css` with module-kit tokens/classes (card, header band,
  table, stat) under `[data-skin="desktop"]` (+ light/contrast variants).
- Header photo reuse: `photoFor` from `src/config/launcherConfig.js` (no new asset work).
- Flagship: refactor `src/pages/DrawingSubmittalHub` presentation to consume the kit
  (logic/hooks untouched).
- Gate: reuse `desktop_shell` (the kit only renders inside the desktop skin) or a sibling
  flag if staged rollout is wanted — decided at planning time.

## 7. Theming, density, accessibility

- Dark + light: kit tokens have `[data-theme="light"]` variants; the photo header stays a
  dark image card in both (white text legible via scrim).
- Density/contrast/motion: kit honors `data-density`, `data-contrast`, `data-motion`.
- A11y: focus-visible rings (Phase 1 desktop.css rule covers buttons/tiles; extend to kit
  controls), real headings/landmarks, labeled controls, AA contrast (scrim guarantees
  header text contrast over arbitrary photos), keyboard-navigable tables/tabs.

## 8. Testing

- Unit tests (vitest, jsdom, `--maxWorkers=2`): `ModuleHeader` (renders title/stats/photo
  fallback/actions), `StatTile`, `SectionCard`, `DataTable` (headers/pills/empty/sort),
  States kit, `ModuleTabs` (query-param sync).
- Flagship: the existing `DrawingSubmittalHub` tests must still pass (behavior-preserving);
  add tests only for new presentational wiring.
- Full ladder before any deploy (lint, typecheck:strict, typecheck:noimplicitany, test,
  build) + **field-verify the flagship in the running app**.

## 9. Rollout / decomposition

1. **This spec → plan:** build the kit + rebuild the flagship (Detailing Control Center).
   Ship behind the flag, dogfood.
2. **Per-module cycles (separate specs/plans), moat-first:** Drawings, Submittals, RFIs,
   Schedule, Fab Release, Dashboard, then the rest by domain batch — each rebuilt on the
   kit, behavior-preserving, validated + field-verified.
3. No silent scope creep: each cycle is its own reviewed increment.

## 10. Risks & mitigations

- **31 redesigns drifting apart** → the shared kit is the single source of visual truth;
  redesigns compose it, don't fork it. Flagship locks the patterns first.
- **Behavior regressions while re-housing** → behavior-preserving rule + existing tests +
  field verification each cycle; logic/hooks/RLS untouched.
- **Header vertical cost on dense screens** → compact band (~100px), collapses on mobile;
  body stays dense.
- **Photo-text contrast over bright photos** → fixed dark scrim guarantees AA (carried
  from Phase 1 tile work).
- **Scope/size** → decomposed into kit + per-module cycles; only kit + flagship here.
- **Performance** → header photos lazy-load + reuse cached tile assets; tables keep
  existing virtualization; narrow query invalidation preserved.
