# SteelBuild Pro — "Desktop Environment" Redesign (Design Spec)

Date: 2026-06-26
Status: Approved design — pending implementation plan
Owner: Nick (product owner)
Author: AI engineering agent (brainstorming session)

---

## 1. Goal

Give SteelBuild Pro a distinctive, premium UI/UX modeled on a polished Linux/GNOME
desktop environment: a photoreal, glossy, high-resolution look with a left **dock**
of detailed module icons, an **applications launcher** home screen, a top
**"Activities" bar**, and **search** — applied consistently across the whole app.

Success = SteelBuild Pro looks and feels like the reference GNOME desktop
screenshots, with intricate, photorealistic module icons acting as quick-links,
while keeping the dense construction-PM workflows fully usable. This is a
deliberate differentiator vs. competitor PM tools.

This OVERRIDES the CLAUDE.md default "preserve dense, quiet operational UI / no
marketing-style layouts" guidance for the *shell and home* surfaces — at the
explicit direction of the product owner. Dense work screens remain dense; only the
*environment* around them becomes the desktop metaphor.

## 2. Confirmed decisions (from brainstorming)

1. **Direction:** photoreal, launcher-first desktop environment — match the
   screenshots, not flat tiles.
2. **Icon fidelity:** maximally photorealistic.
3. **Icon production:** AI-generated **raster** icon pack (PNG/WebP), one
   consistent 3D-glossy style. Author the art-direction brief + per-module prompts;
   generate via an image model; integrate the assets.
4. **Navigation model:** launcher-first. Land on the desktop launcher; click an icon
   to open a module full-screen; persistent glossy left **dock** for
   favorites/quick-switch; top-bar **search** jumps anywhere. The current labeled
   text sidebar is **retired** (kept flag-gated as fallback).
5. **Rollout:** **phased, moat-first**, behind a feature flag.
6. **Dock icons:** the dock/side buttons use the **same photoreal pack** as the
   launcher (sized for the dock) — never flat chips.

## 3. Current-state baseline (what we build on)

- App shell: `src/Layout.jsx` (topbar ~36px + `SidebarNav` 240px / 56px rail + main
  content). Bootstrap split lives in `src/boot/` (`AppProviders`, `AppRoutes`,
  `AuthenticatedApp`, `LayoutRoute`, `PageLoader`, `AppLoader`).
- Nav source of truth: `src/config/moduleRegistry.js` (`SIDEBAR_GROUPS`,
  `ALL_MODULES`; icons currently stored as literal `\uXXXX` escapes) and
  `src/config/routes.js` (page registry: lazy component + label + `projectScoped`).
  `SidebarNav.jsx` renders icons via a lucide `PAGE_ICON` map.
- Role-aware landing: `src/lib/landingForRole.js` → `IndexRoute` (only applied when
  the user hasn't pinned a landing in Settings).
- Theming: `src/styles/tokens.css` (CSS custom-property token system; dark default +
  light + accent presets + high-contrast + font-scale), `steelbuild-dark.css`
  overlay, `tailwind-compat.css`; `src/components/shared/ThemeContext.jsx` sets
  `data-theme` / `data-accent` / `data-contrast` / `data-motion` / `--font-scale` on
  `<html>` and persists `sbp-*` localStorage keys.
- Icons: `lucide-react`. Global search: `cmdk` (`GlobalSearchModal`).
- Feature flags: homegrown `feature_flags` table; `useFeatureFlag` / `useFlag`;
  admin at `/FeatureFlagsAdmin`.
- RBAC/RLS: `user_projects.role` (owner/admin/pm/field/viewer); project-scoped routes
  guarded by `ProjectScopedRoute`; RLS authoritative at the DB.

Implication: the redesign is **additive at the shell layer** and **token/CSS-level**
for screens. No domain engines, hooks, or RLS change.

## 4. Architecture

### 4.1 New desktop shell (components)

A new shell renders when the `desktop_shell` flag is on; the existing `Layout.jsx`
chrome remains as the fallback (flag off). New components (proposed under
`src/components/desktop/`):

- **`DesktopShell`** — top-level chrome: composes `DesktopTopBar` + `Dock` +
  `ModuleSurface`; owns "active module" + "launcher open" UI state. Mounted from a
  new `LayoutRoute` variant in `boot/`.
- **`DesktopTopBar`** — the "Activities" bar: Home/launcher button + project pill
  (left); active-module title + clock (center); system tray — search, notifications,
  theme toggle, density, account (right). Thin, glass.
- **`Dock`** — persistent glossy left dock of favorite module icons (photoreal, via
  `ModuleIcon`) + active-module highlight + a "Show Applications" button that opens
  the launcher. Favorites are user-configurable (persisted in localStorage initially;
  see §10 open items for server-side later).
- **`Launcher`** — the applications overview / home: photoreal icon grid + category
  rail (All, Detailing, Production, Field, Cost, Reports, Admin, Tools) + search box.
  Becomes the role-aware default landing (extends `landingForRole`/`IndexRoute`).
- **`ModuleSurface`** — content area; renders the routed module inside an optional
  "window" frame (header bar + content), flattening to full-bleed on mobile.
- **`ModuleIcon`** — resolves a module's raster icon via `srcset`
  (`@1x/@2x/@3x`); **falls back to the existing lucide icon** when the asset is
  missing, so the app never breaks while the pack is incomplete. Used by both Dock
  and Launcher (and anywhere a "big" module icon is shown).

### 4.2 Navigation

- **One registry drives everything.** Extend each `moduleRegistry` entry with:
  - `iconAsset` — base path to the raster icon (e.g. `desktop/detailing`),
  - `category` — launcher rail grouping,
  - `dockDefault` — whether it appears in the default dock.
  No parallel nav system is introduced.
- **RBAC-filtered.** Launcher and Dock render only modules the user's role can
  access, reusing existing role checks + `projectScoped` semantics. RLS stays
  authoritative — UI filtering is convenience only, never a security boundary.
- **Search** reuses the existing `cmdk` global search (Cmd/Ctrl-K and the top-bar
  search trigger) to jump to any module/record.
- **Old sidebar** (`SidebarNav`) is retained behind the flag as the fallback nav and
  is retired in Phase 3.

### 4.3 Theming

- Add a new **"SteelBuild Desktop"** skin to `ThemeContext` via a new `data-skin`
  attribute on `<html>` (e.g. `data-skin="desktop"`), **layered on** the existing
  token system. It does **not** replace SteelBuild Dark; both coexist and the user
  can switch back.
- New tokens/styles in a new `src/styles/desktop.css`: the **near-black blueprint
  canvas** (deep radial gradient + faint blueprint grid + vignette), **dock/window
  glass** surfaces, **glossy elevation** shadows, **icon-tile bevels**, and
  window-chrome treatments. Reuse existing accent + phase color tokens.
- Desktop skin becomes the default once mature (Phase 2/3); selectable in Settings →
  Display throughout.

## 5. Photoreal icon pipeline

The differentiator. ~30 module icons produced as a cohesive raster set.

### 5.1 Art-direction spec (one master style)

Locked style (2026-06-27, REVISED): **complete square photo tiles.** Each launcher
module is a single, finished **square (1:1)** image — a cinematic construction
photograph with the module's white outline icon AND its label **baked into the image**
(per the owner's RFIs reference: a "STEEL BUILD PRO" hard-hat worker reading a shop
drawing on a tablet, darkened, with a white question-bubble icon + "RFIs" centered, in
a rounded dark frame). The app shows the full tile image as-is and does NOT overlay its
own icon/label when a photo exists.

- **Tile:** a square card — a construction scene (steel stacks, detailing on-screen, a
  welder throwing sparks, erection cranes, flatbeds of steel, stacked hard hats,
  paperwork, contracts, bolts, dashboards) darkened with a vignette, the module's
  **white outline icon** centered, the **label** in clean white sans-serif beneath, a
  subtle rounded dark frame. One cohesive family across all tiles.
- **Rendering:** `ModuleTile` displays the image full-bleed (aspect 1:1, `object-fit:
  cover`), no overlay. The button's `aria-label` carries the accessible name (screen
  readers don't read baked-in pixels).
- **Fallback:** a module with no image yet renders a dark steel-gradient tile + the
  shared white **lucide** icon + label (app-drawn) — so the launcher is coherent before
  the set is complete.
- **Full launcher set:** EVERY module in the real nav gets a tile.
- **Text caveat:** image models render text unreliably — verify baked-in labels for
  spelling across all ~31 (the `aria-label` stays correct regardless). A tile whose
  text comes out wrong can be regenerated or left on the app-drawn fallback.
- **Output:** `public/photos/desktop/<PageKey>.webp`, square, ≤~200 KB, lazy-loaded;
  the `scripts/optimize-desktop-photos.mjs` pipeline fits-to-1024 (no crop) + encodes.
- **Icons elsewhere stay vector:** dock chips and all in-app inline icons use the white
  lucide outline set — no raster there.
- The owner's reference mockups in this session are the **direction reference**.

### 5.2 Module → icon concept map (initial ~30)

| Module | Category | Icon concept | Phase color |
|---|---|---|---|
| Dashboard | Overview | gauge / dial | gold |
| Command Center | Overview | radar / control console | steel-gray |
| Portfolio Overview | Overview | stacked project cards | steel-gray |
| Projects | Overview | building / site | steel-gray |
| Detailing Control Center | Detailing | rolled blueprint + I-beam | gold |
| Drawings | Detailing | drawing sheet + pencil | gold |
| Submittals | Detailing | stamped submittal package | gold |
| Schedule | PM | calendar + Gantt bars | purple |
| RFIs | PM | document + "?" + magnifier | slate |
| Action Items | PM | checklist | slate |
| Work Packages | Production | crate w/ steel banding | cyan-steel |
| Fab Release | Production | foundry flame + beam | steel blue |
| Production Status | Production | shop / conveyor | steel blue |
| Procurement | Production | purchase order / cart | steel blue |
| Budget Hours | Production | stopwatch + hours | amber |
| Risk | Production | warning shield | red |
| Resources | Production | crew / crane | steel blue |
| Deliveries | Delivery | flatbed truck + steel load | teal |
| Field Today | Field | hard hat | green |
| Field Hub | Field | site map / boots-on-ground | green |
| Budget Control | Cost | ledger / control panel | amber |
| Change Orders | Cost | contract + delta | amber |
| SOV | Cost | schedule-of-values table | amber |
| Pay Applications | Cost | invoice (AIA G702) | amber |
| Backcharges | Cost | debit slip | amber |
| Expenses | Cost | receipt | amber |
| Documents | Docs | folder / file stack | violet |
| Reports | Reports | bar-chart document | violet |
| Team | Admin | people | steel-gray |
| Billing | Admin | card / subscription | steel-gray |
| Vendors | Admin | handshake / supplier | steel-gray |
| Settings | Admin | gear | steel-gray |
| Calculators (Tools) | Tools | calculator | steel-gray |
| 3D Model | Detailing | isometric building/cube | steel-gray |

(Exact final list reconciled against the live `moduleRegistry` at implementation
time; the map above is the working set.)

### 5.3 Workflow

1. Author the master style brief + one generation prompt per module (consistent
   wording, varying only the emblem + color).
2. Generate the set with an image model (one batch/seed for consistency).
3. Drop assets into `public/icons/desktop/<module>@{1,2,3}x.webp` (+ a manifest).
4. `ModuleIcon` references via `moduleRegistry.iconAsset`; missing assets fall back
   to lucide. Fill the pack incrementally without breaking the app.
5. (Optional, later) wire an image-gen step directly into the asset workflow.

- Small inline icons inside screens **stay lucide** (vector, themeable, crisp).
  Raster is reserved for the big Dock/Launcher icons. This is the pragmatic hybrid.

## 6. Reskinning work screens (moat-first)

Work screens keep their layout, logic, and tests. They inherit the desktop look
through (a) the new `data-skin` theme tokens, (b) the `ModuleSurface` window chrome,
and (c) targeted glossy-control polish — **mostly CSS/token-level, not rewrites** —
so runtime behavior and existing unit tests are preserved.

Phase-1 (moat) screens: Detailing Control Center (`DrawingSubmittalHub`), Drawings,
Submittals, RFIs, Schedule (`ScheduleGantt`), Fab Release, Dashboard.

## 7. Mobile / tablet

- Launcher → phone-style scrollable app grid.
- Dock → bottom tab bar of favorites.
- Top bar condenses; window chrome → full-bleed.
- Reuses the existing responsive breakpoint + mobile-drawer infrastructure.

## 8. Safety & rollout

- Feature flag **`desktop_shell`** (homegrown `feature_flags`) with per-user override
  for owner/admin dogfooding. Flag off = current `Layout`/`SidebarNav` unchanged.
- **Phase 1:** desktop shell + launcher + icon pack + moat-screen reskin (flag-on for
  owner/admins) → dogfood → flip default-on.
- **Phase 2:** roll the desktop look across remaining screens.
- **Phase 3:** retire the old sidebar; make desktop skin the default.
- Each phase runs the full CLAUDE.md validation ladder (lint, typecheck, typecheck:js,
  typecheck:strict, typecheck:noimplicitany, test, build) **and is field-verified in
  the running app** — not declared done on build-green alone.

## 9. Testing

- Unit (vitest; `--maxWorkers=2` on Windows): launcher filtering by role/category/
  search; dock favorites add/remove/persist; `ModuleIcon` resolution + lucide
  fallback; `moduleRegistry` extension integrity (every module has category + valid
  iconAsset or fallback).
- Build + lint + typecheck ladder each phase.
- Field-verification: exercise the actual launcher → open module → dock-switch →
  search flow in the running app per phase.

## 10. Risks, mitigations & open items

- **Icon consistency across ~30 renders** → strict single-style brief; generate as one
  set/seed; review pass.
- **Raster weight** → WebP + `srcset` + lazy-load the launcher grid.
- **Discoverability without a labeled sidebar** → strong search + category rail +
  labels under icons + dock tooltips.
- **Launcher grid performance** → lazy/virtualize if the icon count grows; follow
  CLAUDE.md perf rules.
- **RBAC** → render only accessible modules; never weaken RLS for UI convenience.
- **Mobile parity** → validate the phone/tablet launcher + bottom-dock early.
- **Open item:** dock-favorites persistence — localStorage for Phase 1; consider a
  per-user server-side preference later.
- **Open item:** whether `3D Model` and any flag-gated modules appear in the launcher
  by default (resolve against live registry + flags at implementation).

## 11. Out of scope

- The full windowed/multi-window "OS" (draggable, multiple modules open at once) —
  considered and deferred; may be a future phase.
- Any change to domain engines, hooks, schema, RLS, or workflow logic.
- Replacing lucide for inline in-screen icons.

## 12. Done means

- Shell, dock, launcher, search, and the new skin work in the running app behind the
  flag; the moat screens are reskinned and field-verified; the icon pipeline +
  `ModuleIcon` fallback are in place; tests + the full validation ladder pass; rollout
  flag + phases documented. Each phase is field-verified, not merely build-green.
