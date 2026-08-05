# Tablet PM Layout Kit Design

**Date:** 2026-07-27  
**Status:** Approved in brainstorm — awaiting written-spec review  
**Branch:** `cursor/tablet-pm-kit-design-3d17`

## Problem

SteelBuild Pro is a desktop-dense SPA. Below ~900px the shell already switches
to a hamburger drawer, and Field Today is phone-oriented, but core PM workflows
(Dashboard, Projects, RFIs, Drawings/Submittals) are not day-to-day usable on
iPad: wide tables trap horizontal scroll, create/edit modals are cramped, and
breakpoints disagree (`900` drawer vs `768` density CSS vs Control Center
`1100`/`680` stacks). TECH_DEBT already names “A11y audit + mobile/iPad polish
on core workflows.”

## Decision summary (approved)

| Topic | Choice |
|---|---|
| Outcome | **Full day-to-day PM** on tablet (browse + create/edit/approve), not triage-only |
| Device first | **Tablet-first** (iPad ~768–1024); phone later |
| Surfaces | Dashboard, Projects, RFIs, Drawings + Submittals |
| Approach | **Tablet layout kit** (shared primitives), then migrate surfaces |
| First slice shape | Shared shell + kit **before** domain page rewrites |
| Migration order | Dashboard → Projects → RFIs → Drawings/Submittals |
| Visual system | Existing Iron Forge / tokens; command_ui Control Centers stay light — layout/density only |

## Goals (v1)

1. Ship a **breakpoint contract** and **tablet layout kit** used consistently.
2. Make the **app shell** usable on iPad without forcing phone hamburger chrome.
3. Migrate the four PM surfaces so a PM can complete happy-path
   create → edit → status/approve on iPad without pinch-zoom or unreachable controls.
4. Raise an **a11y floor** on touched chrome: 44px targets, labeled icon buttons,
   focus-visible, sheet/drawer ARIA.

## Non-goals (v1)

- Phone-first redesign (`<768`) beyond not regressing the existing drawer.
- Native / Capacitor / React Native app.
- Deep redesign of Gantt, Piece Register, or Drawing Viewer markup/measure.
- Field Today / Field Hub rewrite (already field-oriented).
- Redesigning command_ui photographic / light Control Center visuals.
- Full WCAG audit / VPAT (kit sets a floor; systemic audit stays TECH_DEBT).

## Current baseline (context)

- SPA + PWA app-shell SW (`public/sw.js`); no native shell.
- `useResponsiveBreakpoint`: mobile drawer at **`<900px`**.
- `src/styles/responsive.css`: density at 768/640/480; tables often `min-width` + scroll.
- Hamburger + `MobileDrawer` already exist for phone-width shell.
- Field Today is the intentional phone capture lane — leave it alone in v1.

## Breakpoint contract

| Band | Width | Shell behavior |
|---|---|---|
| Phone | `< 768px` | Existing hamburger + off-canvas drawer |
| Tablet | `768–1023px` | **Narrow/collapsible left rail** (not hamburger); kit layouts active |
| Desktop | `≥ 1024px` | Current desktop shell |

**Cutover rule:** Replace the Layout `900px` “isMobile” drawer threshold with this
contract. Document any temporary dual-read during migration; do not leave three
competing definitions long-term.

`useResponsiveBreakpoint` (or successor) exposes `{ isPhone, isTablet, isDesktop }`
so pages branch once.

## Architecture

```text
Layout (shell)
  ├─ Phone (<768): HamburgerMenu + MobileDrawer
  ├─ Tablet (768–1023): CollapsibleNavRail + top project switcher
  └─ Desktop (≥1024): existing sidebar

Tablet kit (shared)
  ├─ TabletPage
  ├─ TabletFilterBar
  ├─ TabletListDetail
  ├─ TabletDataTable (+ column priority helper)
  ├─ TabletFormSheet
  └─ TabletActionBar

Domain pages (migrate in order)
  Dashboard → Projects → RFIs → Drawings/Submittals
```

Domain logic, hooks, and mutations stay where they are. Pages adopt kit
wrappers for chrome/layout; no parallel `/m` route tree.

## Kit primitives

| Primitive | Responsibility |
|---|---|
| `TabletPage` | Page padding, sticky header slot, action row |
| `TabletFilterBar` | Search + filters; wrap ≤2 lines; overflow → Filters sheet |
| `TabletListDetail` | Landscape: list \| detail. Portrait: list → detail as sheet/push |
| `TabletDataTable` | Column priority `essential` / `secondary` / `optional`; hide optional under 1024; horizontal scroll only if essentials still overflow |
| `TabletFormSheet` | Full-height create/edit sheet with sticky Save/Cancel; preferred over cramped centered modals on tablet |
| `TabletActionBar` | Primary/secondary actions for detail views, thumb-reachable |

**Rules**

- CSS variables / existing tokens only; no new brand palette.
- No `<form>` tags (repo rule); sheets call the same save handlers as desktop.
- Minimum **44×44** interactive targets in kit chrome.
- Prefer row tap → detail over icon-only hit targets in tables.
- No card-heavy hero chrome; match current command / Iron Forge density.

Suggested homes (implementation may adjust):

- Hook: `src/components/nav/useResponsiveBreakpoint.js` (extend) or sibling `.ts`
- Kit: `src/components/tablet/` (`.tsx` only for new files)
- Styles: `src/styles/tablet-kit.css` imported from `globals.css` / tokens path

## Shell behavior (tablet)

- Left nav remains; collapse to icon rail with expand affordance.
- Project pill / switcher stays in the top bar and remains reachable.
- Page-primary actions live in-page (`TabletPage` / `TabletActionBar`), not only in nav overflow.
- Safe-area insets continue to apply (existing `responsive.css` pattern).
- Fix unlabeled hamburger for phone band when touching shell a11y (`aria-label`).

## Migration phases

### Phase 0 — Kit + shell

Ship breakpoint contract, CSS, primitives, collapsible tablet rail. Smoke at
viewport widths **768 / 834 / 1024**. No domain feature claims until this passes.

### Phase 1 — Dashboard

Portfolio + project dashboard readable/actionable: KPI tiles stack, project
switch works, key queues open without horizontal trap. Modals touched in this
pass use `TabletFormSheet` where create/edit is invoked.

### Phase 2 — Projects

List + detail + create/edit + archive usable on iPad. Archive keeps typed
confirm + awaited mutation (see project-archive fix). Detail via list/detail or
sheet patterns from the kit.

### Phase 3 — RFIs

Register with priority columns; open / create / respond / status without
desktop-only dead ends. Comments and attachments reachable.

### Phase 4 — Drawings + Submittals (Detailing)

Package/register browse, status changes, create/link submittal, approval
actions. Drawing Viewer: usable tablet chrome to open a sheet; **deep**
markup/measure/canvas tools remain a later slice.

## Success criteria (per migrated phase)

On iPad-class width (landscape and portrait):

1. Happy path create → edit → status/approve completes without pinch-zoom.
2. Essential table columns usable without horizontal scroll; secondary may scroll.
3. Sheets/drawers trap focus, restore focus on close, expose dialog/drawer roles.
4. Icon-only controls in touched chrome have accessible names.
5. Manual VoiceOver / keyboard pass on the phase’s primary sheet + list.

## Testing strategy

| Layer | What |
|---|---|
| Unit | Breakpoint helper; column-priority helper (pure) |
| Component (jsdom) | Kit primitives: render, priority hiding, sheet open/close |
| E2E / manual viewport | Playwright or manual fixtures at **768** and **1024** per phase happy path |
| Lint | New code `.ts`/`.tsx`; no new `src/**/*.js(x)` |

No new native toolchain. Mock Supabase in unit/component tests (repo rule).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Control Centers too dense for kit alone | Layout/density only; no command_ui visual redesign in v1 |
| Wide registers still need h-scroll | Essentials stay visible; scroll is fallback for optional columns |
| Breakpoint thrash with existing 900px drawer | Single contract in Phase 0; delete dual paths ASAP |
| Scope balloon into Viewer/Gantt/Piece Register | Explicit non-goals; separate specs later |
| A11y infinite chase | Floor on touched surfaces only; full audit stays TECH_DEBT |

## Open follow-ups (explicitly later)

- Phone-first pass applying the same kit below 768.
- Drawing Viewer measurement / markup tablet UX.
- Piece Register + Gantt tablet layouts.
- Gated axe / Playwright a11y CI.

## Approval record

- Outcome: full PM on tablet (not triage-only) — approved  
- Device: tablet-first — approved  
- Slice shape: shared kit first, then four surfaces — approved  
- Approach: tablet layout kit — approved  
- Design §1 scope/architecture — approved  
- Design §2 shell & kit — approved  
- Design §3 migration & testing — approved  
