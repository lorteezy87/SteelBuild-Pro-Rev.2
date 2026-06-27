# Handoff — SteelBuild Pro "Industrial Command System" redesign (2026-06-27)

You are continuing a large, multi-phase UI/UX redesign of SteelBuild Pro (Vite + React +
Supabase) at `C:\dev\SteelBuild-Pro-Rev.2`. Read `CLAUDE.md` first. Work on branch
`claude/desktop-redesign` (shared checkout, concurrent agents — `git pull`/coordinate).

## The goal
Turn the app into a premium dark "construction command center": a photographic **launcher
dashboard** + every module page redesigned into a **workbench** that inherits that visual
language. Authoritative design brief: **`docs/superpowers/specs/2026-06-27-industrial-command-system-direction.md`**
(palette `#05080D`/`#131C28`, gold `#D7A928` brand accent, de-terminal typography, standardized
badge vocabulary, workbench page rhythm: hero → KPI strip → tabs → work-queue + decision/risk
panel → filters → table). Earlier specs: `2026-06-26-desktop-environment-redesign-design.md`
(Phase 1), `2026-06-27-module-design-language-phase2-design.md` (kit).

## What's DONE and DEPLOYED (production)
- **Phase 1 — desktop shell + launcher** is LIVE on https://steelbuild-pro.com (commit
  `9fd86a5c` on `main`, CI green). Flag-gated by `desktop_shell` (OFF globally, ON only for
  owner `nickl@shsteelaz.com`), so production users still see the classic layout.
- Photographic launcher: all **31 module tiles** (in `public/photos/desktop/<PageKey>.webp`),
  dock, top "Activities" bar, search. Source: `src/components/desktop/` (DesktopShell, Dock,
  Launcher, ModuleTile, DesktopTopBar, ModuleSurface) + `src/config/launcherConfig.js`,
  `src/config/pageIcons.jsx`. Photo optimizer: `scripts/optimize-desktop-photos.mjs` (drop raw
  square tiles in `public/photos/desktop/_raw/`, run it; `sharp` self-installs to gitignored
  `scripts/.imgtools/`).

## What's DONE on the BRANCH but NOT deployed
- **Phase 2A — module kit** (`src/components/desktop/module/`, all typed `.tsx`):
  `ModuleHeader` (photo-accent band, reuses `photoFor(page)`), `SectionCard`, `StatTile`,
  `StatusPill`, `DataTable`, `ModuleTabs`, `states/{EmptyState,ErrorState,PermissionDenied,
  LoadingSkeleton}`, barrel `index.js`. Styles in `src/styles/desktop.css` (scoped under
  `[data-skin="desktop"]`). Kit refined to the Industrial-Command tokens (workbench card
  gradient/shadow, de-terminal KPI labels, standardized badge tones, `.desk-btn-*` utilities).
- **Phase 2B — Detailing Control Center flagship** (`src/pages/DrawingSubmittalHub.tsx` +
  `src/pages/drawingSubmittalHub/components.tsx`) fully re-housed onto the kit:
  - Group A: photo `ModuleHeader` (flag-branched: ModuleHeader when `desktop_shell` on, original
    `CommandBar` when off).
  - Groups B/C/D: overview `TriageBoard` sections, the Drawing Register tab, Approval Matrix,
    and Revision Impact wrapped in `SectionCard`s with `StatusPill` chips — **behavior-preserving**
    (the dual register codepaths + all data/logic/mutations untouched; guardrail tests stay green).
- All green on the branch: lint (modulo the foreign file below), `typecheck:strict`,
  `typecheck:noimplicitany`, full vitest (**1843 tests**), build. Plan: `docs/superpowers/plans/
  2026-06-27-detailing-flagship-phase2b.md`; kit plan: `2026-06-27-module-kit-phase2a.md`.

## ⚠️ THE OPEN DECISION (act on this first)
Owner chose: **flip the desktop skin ON for everyone** (roll the whole new experience —
launcher + workbenches — to all users). BUT there is a blocker and a prerequisite:

1. **Flag-off styling gap (why it isn't shipped yet):** the Phase 2B hub re-house is NOT
   flag-gated, but the kit's CSS only activates under `[data-skin="desktop"]`. So with the flag
   OFF, the Detailing hub's `SectionCard`s render as **unstyled blocks** — a visual regression.
   Flipping `desktop_shell` global makes everyone get `data-skin="desktop"`, which resolves the
   styling — but means **every one of ~75 pages now renders inside `DesktopShell`/`ModuleSurface`
   for all users**, and only Detailing is redesigned (other modules show classic content inside
   the desktop window).
2. **Prerequisite before flipping global:** the desktop shell has only been field-verified on the
   launcher. Before enabling `desktop_shell` globally you MUST field-verify the shell across the
   main screens (Dashboard, Detailing, RFIs, Schedule, Fab Release, Cost, Field, etc.) with the
   flag ON — sign in as `nickl@shsteelaz.com`, click into each, confirm nothing is broken inside
   `ModuleSurface`, mobile works, light theme works. Fix regressions, THEN flip.
3. **How to flip:** `desktop_shell` is a row in the `feature_flags` table (Supabase project
   `kjrwqagyeswwoxpjkcko`); set `enabled=true` (via `/FeatureFlagsAdmin` or
   `update feature_flags set enabled=true where flag_key='desktop_shell'`). Deploy the branch
   first (below) so the code is live, THEN flip, and watch for issues.

Recommended safe sequence: **(a)** field-verify the shell across screens (flag on) → **(b)** fix
regressions → **(c)** deploy the branch to `main` → **(d)** flip the flag global → **(e)** continue
redesigning the remaining module workbenches (RFI Control Center is next per the directive).

## How to deploy (CI-gated)
Production is `main` → CI (`.github/workflows/ci.yml`: lint+typecheck+test+build) → Vercel.
Push a **verified SHA** to main (NEVER `git push origin HEAD:main` — shared checkout race):
`git push origin <sha>:main`, then `gh run watch <id>` / `gh run list --branch main`. Run the
full local ladder first (lint, typecheck:strict, typecheck:noimplicitany, `npx vitest run
--maxWorkers=2`, `node ./node_modules/vite/bin/vite.js build`).

## Gotchas / shared-checkout hazards
- **Foreign uncommitted work:** `src/pages/FeetInchesCalculator.jsx` has a large foreign
  uncommitted change (another agent, has unused-var lint errors) — **do NOT touch/commit it**;
  it's not on the branch's commits so it won't deploy, but local `npm run lint` will fail on it.
  `package.json`/`package-lock.json`/`.gitignore` also have foreign uncommitted edits — never
  `git add -A`; stage explicit paths only.
- **Login:** the real app/Supabase account is **`nickl@shsteelaz.com`** (the Claude context email
  `nicholasl@` has NO account → 400 on login, and flag overrides keyed to it don't work).
- **Validation:** vitest needs `--maxWorkers=2` on Windows. CI enforces `typecheck:strict` +
  `typecheck:noimplicitany` (shrink-only ignore lists). New kit was `.jsx`→`.tsx` because untyped
  `.jsx` consumed by `.tsx` pages infers bad props (`stats` → `never[]`, required `photoSrc`) —
  keep kit components typed.
- **Photo tiles + ModuleTile** render the full image as the tile face (no overlay) when a photo
  exists, lucide-icon fallback otherwise. Tiles are square 1:1, complete (icon+label baked in).
- Field-verification of moat/UI is required per CLAUDE.md §32 ("done = field-verified") — you
  can't auth into the live app, so hand field-verify steps to the owner.

## Suggested next actions (in order)
1. Field-verify the desktop shell across the main screens with `desktop_shell` on (owner does
   this, or you drive `npm run dev` + give a checklist). Fix any regressions on the branch.
2. Deploy the branch (current Detailing workbench + kit) to `main` once verified.
3. Flip `desktop_shell` global per the owner's decision; monitor.
4. Continue the module workbench redesigns per the Industrial Command System brief, moat-first:
   **RFI Control Center next** (hero header + KPI strip + RFI Work Queue + Highest-Risk panel),
   then Schedule, Change Orders, Budget Control, Vendors, Deliveries, … each on the kit,
   behavior-preserving, validated, field-verified.
5. Optional cleanup: components.tsx imports the (now-typed) kit with `as unknown as` casts — can
   be removed; the `compact` prop on `TriageList` is now inert.

Branch tip at handoff: latest Detailing/kit commits on `claude/desktop-redesign` (Group D =
`7efadd77`, kit refinement = `f3d2f34d`, direction doc = `bb39674f`). `main` = `9fd86a5c`.
