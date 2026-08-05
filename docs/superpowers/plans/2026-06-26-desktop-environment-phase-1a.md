# Desktop Environment — Phase 1A (Shell Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, dogfoodable Linux-desktop-style shell for SteelBuild Pro — left dock, applications launcher, top "Activities" bar, search — behind a feature flag, using the existing lucide icons as fallback art (no raster pack required yet).

**Architecture:** A new `DesktopShell` (and `Dock` / `Launcher` / `DesktopTopBar` / `ModuleSurface` / `ModuleIcon` sub-components) renders in place of the current `Layout` chrome when the `desktop_shell` feature flag is on for the user. `LayoutRoute` chooses between `Layout` and `DesktopShell`; the page `<Outlet>` renders inside either, so all routes/pages keep working unchanged. A new `[data-skin="desktop"]` stylesheet layers the dark-glass canvas onto the existing token system without replacing SteelBuild Dark. Launcher + dock both render from a new additive `launcherConfig` (derived from the existing `SIDEBAR_GROUPS`) via `ModuleIcon`, which shows a raster asset when present and falls back to the existing lucide icon otherwise.

**Tech Stack:** React 18, react-router 6, TanStack Query, Vite, Vitest + @testing-library/react (jsdom), lucide-react, CSS custom-property token system. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-26-desktop-environment-redesign-design.md`

**Scope note:** This is Phase 1A only — the shell foundation with lucide fallback icons. The photoreal raster icon pack + moat-screen reskin are **Plan 1B** (separate plan), authored after 1A is field-verified. RBAC-based hiding of launcher modules is deliberately NOT in 1A: the current app does not hide nav by role (it relies on RLS + `ProjectScopedRoute`), so the launcher mirrors the existing sidebar module set; per-role hiding is a later enhancement.

---

## Direction update (2026-06-26): photographic tiles

After Task 1 landed, the owner provided full-grid reference mockups: the launcher is
**photographic tiles** — a real construction photo per module, darkened with a gradient
scrim, with a white lucide outline icon + label on top — covering the **full** module
set (not a curated subset). This supersedes the glossy-3D-emblem icon direction. Deltas
vs the tasks below:
- **Task 2:** `iconAssetFor` → `photoFor(page)` (manifest `PHOTO_ASSETS`, empty until the
  photo pack ships); the full `LAUNCHER_MODULES` is the tile set. Everything else unchanged.
- **Task 3:** build **`ModuleTile`** (photo background + dark gradient scrim + centered
  white lucide icon + label; dark steel-gradient fallback when `photoFor` is null)
  instead of a glossy `ModuleIcon`.
- **Task 6 (Dock):** dock chips render the white lucide icon via `getPageIcon` on a
  compact dark-glass chip — no photo at dock size (no tile import needed).
- **Task 7 (Launcher):** renders the `ModuleTile` grid (full set) + category rail + search.
- **Asset pack (Plan 1B):** **construction photos** at `public/photos/desktop/<page>.webp`,
  not 3D icon art. See spec §5.1 (revised).

Where tasks below say `ModuleIcon`/`iconAssetFor`, read `ModuleTile`/`photoFor`.

---

## File structure

Created:
- `src/config/pageIcons.jsx` — the page→lucide icon map (extracted from `SidebarNav`) + `getPageIcon()`. One source of truth for the white outline icons. **(DONE — committed 5b5d5ec7)**
- `src/config/launcherConfig.js` — launcher/dock config derived from `SIDEBAR_GROUPS`: flat module list with category, dock defaults, `photoFor()` + `PHOTO_ASSETS`.
- `src/components/desktop/ModuleTile.jsx` — photo-backed launcher tile (photo + scrim + white lucide icon + label; dark-gradient fallback).
- `src/components/desktop/DesktopTopBar.jsx` — Activities bar (Home button, project pill, page title, clock, tray).
- `src/components/desktop/Dock.jsx` — compact dark dock chips (white lucide icon via `getPageIcon`) + Show Applications.
- `src/components/desktop/Launcher.jsx` — applications overview grid (`ModuleTile`) + category rail + search.
- `src/components/desktop/ModuleSurface.jsx` — window-chrome wrapper around page content.
- `src/components/desktop/DesktopShell.jsx` — composes the shell; sets `data-skin`; reuses overlays.
- `src/styles/desktop.css` — `[data-skin="desktop"]` canvas/dock/window/tile tokens + keyframes.
- Tests: `src/config/__tests__/pageIcons.test.jsx`, `src/config/__tests__/launcherConfig.test.js`, `src/components/desktop/__tests__/ModuleIcon.test.jsx`, `src/components/desktop/__tests__/Launcher.test.jsx`, `src/components/desktop/__tests__/Dock.test.jsx`.

Modified:
- `src/components/nav/SidebarNav.jsx` — import the icon map from `pageIcons` instead of defining it inline.
- `src/boot/LayoutRoute.jsx` — render `DesktopShell` when the flag is on, else `Layout`.
- `src/boot/AppRoutes.jsx` — add `/Launcher` route + flag-guarded index landing.
- `src/main.jsx` — import `desktop.css`.

---

## Conventions for every task

- Windows shell is PowerShell. Run vitest with `--maxWorkers=2` (Windows worker-pool gotcha).
- Per-test run: `npx vitest run <file> --maxWorkers=2 2>&1 | Select-Object -Last 40` then `Write-Host "EXIT: $LASTEXITCODE"`.
- Commit with explicit paths only (shared checkout). Do not `git add -A`. Work stays on branch `claude/desktop-redesign` (already created). Do not push.
- Test files that render components start with `// @vitest-environment jsdom`.

---

### Task 1: Extract the page→lucide icon map to a shared module

**Files:**
- Create: `src/config/pageIcons.jsx`
- Create: `src/config/__tests__/pageIcons.test.jsx`
- Modify: `src/components/nav/SidebarNav.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/config/__tests__/pageIcons.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { PAGE_ICON, FallbackIcon, getPageIcon } from "@/config/pageIcons";

describe("pageIcons", () => {
  it("maps a known page to a component", () => {
    expect(typeof PAGE_ICON.Dashboard).toBe("object"); // forwardRef component
    expect(getPageIcon("Dashboard")).toBe(PAGE_ICON.Dashboard);
  });

  it("falls back for an unknown page", () => {
    expect(getPageIcon("NoSuchPageXYZ")).toBe(FallbackIcon);
  });

  it("exposes a fallback component", () => {
    expect(FallbackIcon).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/__tests__/pageIcons.test.jsx --maxWorkers=2`
Expected: FAIL — cannot resolve `@/config/pageIcons`.

- [ ] **Step 3: Create `src/config/pageIcons.jsx`**

Move the icon map out of `SidebarNav.jsx` verbatim. Full file:

```jsx
/**
 * pageIcons — page → lucide icon map (single source of truth).
 *
 * Extracted from SidebarNav so the desktop ModuleIcon fallback and the
 * sidebar share one icon vocabulary. Adding a page = one line here.
 */
import {
  LayoutDashboard, Terminal, Sparkles, Grid3x3, Briefcase, BarChart3,
  CalendarRange, CalendarDays, CheckSquare, HelpCircle, DollarSign, Mail,
  FileText, Eye, Box, ScanLine,
  Package, Truck, Wrench, Users2,
  Wallet, TrendingUp, Receipt,
  Folder, FileBarChart, Activity as ActivityIcon,
  ClipboardList, Shield, ShieldAlert, FlaskConical, Camera,
  Contact2, Building2, UserCog, Settings as SettingsIcon,
  Ruler, Calculator, HardHat, ArrowLeftRight,
  BookOpen,
} from "lucide-react";

export const PAGE_ICON = {
  Dashboard: LayoutDashboard,
  CommandCenter: Terminal,
  AIInsights: Sparkles,
  ExecutiveView: BarChart3,
  Projects: Briefcase,
  ProjectsHub: Briefcase,
  PortfolioOverview: Grid3x3,
  PortfolioHub: Grid3x3,

  Schedule: CalendarRange,
  ScheduleHub: CalendarRange,
  ProjectCalendar: CalendarDays,
  ActionItems: CheckSquare,
  RFIs: HelpCircle,
  RFIHub: HelpCircle,
  Submittals: FileText,
  ChangeOrders: DollarSign,
  ChangeRequests: DollarSign,
  EmailInbox: Mail,
  ProjectCloseout: Box,
  ProductionNotes: FileText,

  DrawingSubmittalHub: ScanLine,
  Drawings: FileText,
  DrawingViewer: Eye,
  Documents: Folder,

  WorkPackages: Package,
  Constraints: Shield,
  FabRelease: Wrench,
  ProductionStatus: Wrench,
  Procurement: Package,
  LookAheadSchedule: CalendarRange,
  Deliveries: Truck,
  ResourceHub: Users2,
  ResourceScheduling: Users2,
  ResourceManagement: Users2,
  RiskHub: ShieldAlert,
  BudgetHours: TrendingUp,

  CostHub: Wallet,
  Financials: Wallet,
  CostDashboard: TrendingUp,
  SOV: Receipt,
  PayApplications: Receipt,
  Backcharges: DollarSign,
  ContractManagement: FileText,
  Expenses: Wallet,

  ReportsHub: FileBarChart,
  Reports: FileBarChart,
  JobStatusReport: FileBarChart,
  Activity: ActivityIcon,
  AlertsCenter: ShieldAlert,

  FieldToday: HardHat,
  FieldHub: HardHat,
  Field: HardHat,
  DailyLogs: ClipboardList,
  Photos: Camera,
  Inspections: ScanLine,
  Safety: Shield,
  QualityControl: FlaskConical,
  Punchlist: CheckSquare,
  LEMs: ClipboardList,
  Warranty: Shield,

  Contacts: Contact2,
  Vendors: Building2,
  OrgMembers: Users2,
  Billing: DollarSign,
  UsersManagement: UserCog,
  Settings: SettingsIcon,
  ScopeExclusions: FileText,
  Tutorial: BookOpen,

  CalculatorsHub: Calculator,
  Calculator: Calculator,
  FeetInchesCalculator: Ruler,
  SteelWeightCalculator: Calculator,
  CranePickCalculator: HardHat,
  DecimalFractionConverter: ArrowLeftRight,
};

export const FallbackIcon = Grid3x3;

/** Lucide component for a page key, or the neutral fallback. */
export function getPageIcon(page) {
  return PAGE_ICON[page] || FallbackIcon;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/__tests__/pageIcons.test.jsx --maxWorkers=2`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `SidebarNav.jsx` to import the map**

In `src/components/nav/SidebarNav.jsx`:

1. Replace the large lucide import block (lines ~18-45) with only the icons SidebarNav uses directly OUTSIDE the page map:

```jsx
import {
  ChevronsLeft, ChevronsRight, Search, Clock, ChevronRight as ChevronRightIcon, Star,
} from "lucide-react";
import { PAGE_ICON, FallbackIcon } from "@/config/pageIcons";
```

2. Delete the inline `const PAGE_ICON = { ... }` object (lines ~59-133) and the `const FallbackIcon = Grid3x3;` line (~136). Everything else in the file is unchanged — the existing `PAGE_ICON[...] || FallbackIcon` call sites now resolve to the imported values.

- [ ] **Step 6: Verify the sidebar still type-checks, builds, and tests pass**

Run: `npx vitest run src/config/__tests__/pageIcons.test.jsx --maxWorkers=2`
Then: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 20`
Expected: tests PASS; build EXIT 0 (no "Grid3x3 is not defined" / unused-import errors).

- [ ] **Step 7: Commit**

```powershell
git add src/config/pageIcons.jsx src/config/__tests__/pageIcons.test.jsx src/components/nav/SidebarNav.jsx
git commit -m "refactor(nav): extract page->lucide icon map to src/config/pageIcons" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Launcher/dock config (derived from SIDEBAR_GROUPS)

**Files:**
- Create: `src/config/launcherConfig.js`
- Create: `src/config/__tests__/launcherConfig.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/config/__tests__/launcherConfig.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  LAUNCHER_MODULES, LAUNCHER_CATEGORIES, DOCK_DEFAULT_PAGES,
  iconAssetFor, modulesForCategory, searchModules,
} from "@/config/launcherConfig";

describe("launcherConfig", () => {
  it("derives a flat module list with page, label, category", () => {
    expect(LAUNCHER_MODULES.length).toBeGreaterThan(10);
    const dash = LAUNCHER_MODULES.find((m) => m.page === "Dashboard");
    expect(dash).toMatchObject({ page: "Dashboard", category: "OVERVIEW" });
    expect(typeof dash.label).toBe("string");
  });

  it("categories start with ALL and include each sidebar group", () => {
    expect(LAUNCHER_CATEGORIES[0]).toBe("ALL");
    expect(LAUNCHER_CATEGORIES).toContain("DETAILING");
    expect(LAUNCHER_CATEGORIES).toContain("COST");
  });

  it("dock defaults reference real modules", () => {
    expect(DOCK_DEFAULT_PAGES).toContain("DrawingSubmittalHub");
    for (const page of DOCK_DEFAULT_PAGES) {
      expect(LAUNCHER_MODULES.some((m) => m.page === page)).toBe(true);
    }
  });

  it("iconAssetFor returns null until the raster pack ships (Phase 1B)", () => {
    expect(iconAssetFor("Dashboard")).toBeNull();
    expect(iconAssetFor("NoSuchPage")).toBeNull();
  });

  it("modulesForCategory filters; ALL returns everything", () => {
    expect(modulesForCategory("ALL").length).toBe(LAUNCHER_MODULES.length);
    const cost = modulesForCategory("COST");
    expect(cost.length).toBeGreaterThan(0);
    expect(cost.every((m) => m.category === "COST")).toBe(true);
  });

  it("searchModules matches label case-insensitively", () => {
    const r = searchModules("deliver");
    expect(r.some((m) => m.page === "Deliveries")).toBe(true);
    expect(searchModules("").length).toBe(LAUNCHER_MODULES.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/__tests__/launcherConfig.test.js --maxWorkers=2`
Expected: FAIL — cannot resolve `@/config/launcherConfig`.

- [ ] **Step 3: Create `src/config/launcherConfig.js`**

```js
/**
 * launcherConfig — desktop launcher + dock configuration.
 *
 * Additive layer over moduleRegistry: derives a flat module list (with a
 * category per the existing SIDEBAR_GROUPS) plus the dock default set and the
 * raster-icon asset resolver. moduleRegistry shape is left untouched so its
 * dev-time schema validator keeps passing.
 *
 * iconAssetFor returns null in Phase 1A (no raster pack yet) — ModuleIcon then
 * renders the lucide fallback. Phase 1B fills ICON_ASSETS.
 */
import { SIDEBAR_GROUPS } from "@/config/moduleRegistry";

/** Flat list: { page, label, category } in sidebar order. */
export const LAUNCHER_MODULES = SIDEBAR_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ page: it.page, label: it.label, category: g.label })),
);

/** Rail categories: ALL + each sidebar group, in order. */
export const LAUNCHER_CATEGORIES = ["ALL", ...SIDEBAR_GROUPS.map((g) => g.label)];

/** Default dock pages — the moat + the most-used destinations. */
export const DOCK_DEFAULT_PAGES = [
  "Dashboard",
  "DrawingSubmittalHub",
  "RFIs",
  "ScheduleHub",
  "FabRelease",
  "Deliveries",
  "CostHub",
  "FieldToday",
];

/**
 * Raster icon assets by page key. EMPTY in Phase 1A — filled in Phase 1B when
 * the generated pack lands under public/icons/desktop/. Each value is a base
 * path (no extension); ModuleIcon appends @1x/@2x/@3x + .webp.
 */
export const ICON_ASSETS = {};

/** Base asset path for a page, or null to use the lucide fallback. */
export function iconAssetFor(page) {
  return ICON_ASSETS[page] || null;
}

/** Modules in a category; "ALL" returns the full list. */
export function modulesForCategory(category) {
  if (!category || category === "ALL") return LAUNCHER_MODULES;
  return LAUNCHER_MODULES.filter((m) => m.category === category);
}

/** Case-insensitive label/page search; empty query returns everything. */
export function searchModules(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return LAUNCHER_MODULES;
  return LAUNCHER_MODULES.filter(
    (m) => m.label.toLowerCase().includes(q) || m.page.toLowerCase().includes(q),
  );
}

/** Dock module objects (resolved + filtered to known pages). */
export function dockModules(pages = DOCK_DEFAULT_PAGES) {
  return pages
    .map((p) => LAUNCHER_MODULES.find((m) => m.page === p))
    .filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/__tests__/launcherConfig.test.js --maxWorkers=2`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/config/launcherConfig.js src/config/__tests__/launcherConfig.test.js
git commit -m "feat(desktop): add launcher/dock config derived from SIDEBAR_GROUPS" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ModuleIcon component (raster with lucide fallback)

**Files:**
- Create: `src/components/desktop/ModuleIcon.jsx`
- Create: `src/components/desktop/__tests__/ModuleIcon.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/desktop/__tests__/ModuleIcon.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ModuleIcon from "@/components/desktop/ModuleIcon";

describe("ModuleIcon", () => {
  it("renders the lucide fallback (svg) when no raster asset exists", () => {
    const { container } = render(<ModuleIcon page="Dashboard" size={64} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an <img> with srcset when an assetBase is provided", () => {
    const { container } = render(
      <ModuleIcon page="Dashboard" size={64} assetBase="/icons/desktop/dashboard" />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("srcset")).toContain("@2x.webp");
  });

  it("uses the label for accessibility", () => {
    const { getByLabelText } = render(<ModuleIcon page="Deliveries" label="Deliveries" size={48} />);
    expect(getByLabelText("Deliveries")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/desktop/__tests__/ModuleIcon.test.jsx --maxWorkers=2`
Expected: FAIL — cannot resolve `@/components/desktop/ModuleIcon`.

- [ ] **Step 3: Create `src/components/desktop/ModuleIcon.jsx`**

```jsx
/**
 * ModuleIcon — renders a module's icon for the desktop dock/launcher.
 *
 * Prefers the generated raster art (when present) and falls back to the shared
 * lucide icon so the shell never renders an empty slot while the pack is being
 * produced (Phase 1A ships with the fallback only).
 *
 * Props:
 *   page      route key (drives asset + fallback lookup)
 *   label     accessible name (defaults to page)
 *   size      px square (default 56)
 *   assetBase optional explicit base path override (no extension)
 */
import React from "react";
import { getPageIcon } from "@/config/pageIcons";
import { iconAssetFor } from "@/config/launcherConfig";

export default function ModuleIcon({ page, label, size = 56, assetBase }) {
  const name = label || page || "";
  const base = assetBase ?? iconAssetFor(page);

  if (base) {
    return (
      <img
        className="desk-module-icon"
        src={`${base}@2x.webp`}
        srcSet={`${base}@1x.webp 1x, ${base}@2x.webp 2x, ${base}@3x.webp 3x`}
        width={size}
        height={size}
        alt={name}
        aria-label={name}
        draggable={false}
        style={{ width: size, height: size, display: "block", objectFit: "contain" }}
      />
    );
  }

  // Fallback: lucide glyph inside a dark-glass tile so it still reads as an
  // "app icon" rather than a bare line glyph.
  const Glyph = getPageIcon(page);
  const inner = Math.round(size * 0.5);
  return (
    <span
      className="desk-module-icon desk-module-icon--fallback"
      role="img"
      aria-label={name}
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.28),
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "var(--desk-tile, linear-gradient(180deg,#222b3a,#0b0e14))",
        border: "1px solid var(--desk-tile-edge, rgba(255,255,255,0.12))",
        boxShadow: "var(--desk-tile-shadow, 0 6px 12px rgba(0,0,0,0.5))",
        color: "var(--desk-tile-glyph, #e8ebf2)",
      }}
    >
      <Glyph size={inner} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/desktop/__tests__/ModuleIcon.test.jsx --maxWorkers=2`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/ModuleIcon.jsx src/components/desktop/__tests__/ModuleIcon.test.jsx
git commit -m "feat(desktop): add ModuleIcon with raster-then-lucide fallback" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Desktop skin stylesheet

**Files:**
- Create: `src/styles/desktop.css`
- Modify: `src/main.jsx`

- [ ] **Step 1: Create `src/styles/desktop.css`**

```css
/*
 * Desktop skin — the Linux-desktop-environment look, scoped to
 * [data-skin="desktop"] on <html> (set by DesktopShell while mounted).
 * Layers on top of the existing token system; does not replace SteelBuild Dark.
 */
[data-skin="desktop"] {
  --desk-canvas: radial-gradient(130% 100% at 50% -15%, #243140 0%, #141c26 48%, #0a0e15 100%);
  --desk-grid: rgba(120, 160, 220, 0.05);
  --desk-dock-bg: linear-gradient(180deg, rgba(20, 27, 36, 0.7), rgba(10, 14, 20, 0.5));
  --desk-dock-edge: rgba(120, 140, 170, 0.14);
  --desk-topbar-bg: linear-gradient(180deg, rgba(8, 11, 16, 0.72), rgba(8, 11, 16, 0.35));
  --desk-window-bg: linear-gradient(180deg, rgba(22, 29, 39, 0.92), rgba(14, 19, 26, 0.95));
  --desk-window-edge: #2b3445;
  --desk-window-header: linear-gradient(180deg, #222c39, #19212c);
  --desk-tile: linear-gradient(180deg, #222b3a 0%, #121826 55%, #070a11 100%);
  --desk-tile-edge: rgba(255, 255, 255, 0.12);
  --desk-tile-shadow: 0 6px 12px rgba(0, 0, 0, 0.5);
  --desk-tile-glyph: #e8ebf2;
}

[data-skin="desktop"] .desk-canvas {
  position: relative;
  min-height: 100vh;
  background: var(--desk-canvas);
}
[data-skin="desktop"] .desk-canvas::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--desk-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--desk-grid) 1px, transparent 1px);
  background-size: 34px 34px;
  pointer-events: none;
  z-index: 0;
}

[data-skin="desktop"] .desk-dock-btn { transition: transform 120ms ease, filter 120ms ease; }
[data-skin="desktop"] .desk-dock-btn:hover { transform: translateX(2px) scale(1.06); }
[data-skin="desktop"] .desk-dock-btn:active { transform: scale(0.96); }
[data-skin="desktop"] .desk-launch-tile { transition: transform 120ms ease; }
[data-skin="desktop"] .desk-launch-tile:hover { transform: translateY(-3px); }

[data-motion="reduced"] [data-skin="desktop"] .desk-dock-btn,
[data-motion="reduced"] [data-skin="desktop"] .desk-launch-tile { transition: none; }
```

- [ ] **Step 2: Find where global stylesheets are imported**

Run: `Select-String -Path src/main.jsx -Pattern "\.css" `
Expected: shows the existing `import "...css"` lines (e.g. tokens / steelbuild-dark / globals).

- [ ] **Step 3: Add the desktop.css import**

In `src/main.jsx`, add this line immediately after the last existing CSS import:

```jsx
import "@/styles/desktop.css";
```

- [ ] **Step 4: Verify the build picks it up**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 20`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```powershell
git add src/styles/desktop.css src/main.jsx
git commit -m "feat(desktop): add [data-skin=desktop] stylesheet" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: DesktopTopBar

**Files:**
- Create: `src/components/desktop/DesktopTopBar.jsx`

- [ ] **Step 1: Create `src/components/desktop/DesktopTopBar.jsx`**

Reuses the existing nav atoms so behavior matches `Layout`. Full file:

```jsx
/**
 * DesktopTopBar — the "Activities" bar for the desktop shell.
 * Left: Activities/Home (opens launcher) + project pill.
 * Center: active page title.
 * Right: search, bell, theme, user, clock.
 */
import React from "react";
import { Grid3x3, Search } from "lucide-react";
import ProjectPillDropdown from "@/components/nav/ProjectPillDropdown";
import BellDropdown from "@/components/nav/BellDropdown";
import ThemeToggleButton from "@/components/nav/ThemeToggleButton";
import UserSignOutBlock from "@/components/nav/UserSignOutBlock";

function prettyTitle(page) {
  if (!page) return "Dashboard";
  return page.replace(/([A-Z])/g, " $1").trim();
}

export default function DesktopTopBar({
  currentPageName, onShowLauncher, onOpenSearch, user, onLogout,
  alerts, unreadCount, onMarkAllRead, onViewAllAlerts,
}) {
  return (
    <nav
      aria-label="Primary"
      style={{
        height: 30, minHeight: 30, padding: "0 12px",
        display: "flex", alignItems: "center", gap: 12,
        background: "var(--desk-topbar-bg)",
        color: "var(--text-primary)", position: "relative", zIndex: 50, flexShrink: 0,
      }}
    >
      <button
        onClick={onShowLauncher}
        aria-label="Show applications"
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none",
          border: "none", cursor: "pointer", color: "var(--accent)",
          fontFamily: "var(--font-body)", fontSize: 12, padding: "2px 4px",
        }}
      >
        <Grid3x3 size={15} strokeWidth={1.9} aria-hidden="true" /> Activities
      </button>

      <ProjectPillDropdown align="left" />

      <span style={{
        margin: "0 auto", fontSize: 12, color: "var(--text-secondary)",
        fontFamily: "var(--font-body)",
      }}>
        {prettyTitle(currentPageName)}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onOpenSearch} aria-label="Search"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
        >
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <ThemeToggleButton />
        <BellDropdown
          alerts={alerts} unreadCount={unreadCount}
          onMarkAllRead={onMarkAllRead} onViewAll={onViewAllAlerts}
        />
        <UserSignOutBlock user={user} onLogout={onLogout} />
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 20`
Expected: EXIT 0 (this proves the imports resolve; the component is rendered in Task 9).

- [ ] **Step 3: Commit**

```powershell
git add src/components/desktop/DesktopTopBar.jsx
git commit -m "feat(desktop): add DesktopTopBar (Activities bar)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Dock

**Files:**
- Create: `src/components/desktop/Dock.jsx`
- Create: `src/components/desktop/__tests__/Dock.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/desktop/__tests__/Dock.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import Dock from "@/components/desktop/Dock";

describe("Dock", () => {
  it("renders a button per default dock module", () => {
    const { getByLabelText } = render(
      <Dock currentPageName="Dashboard" onNavigate={() => {}} onShowLauncher={() => {}} />,
    );
    expect(getByLabelText("Detailing Control Center")).toBeTruthy();
    expect(getByLabelText("Deliveries")).toBeTruthy();
  });

  it("navigates when a dock button is clicked", () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <Dock currentPageName="Dashboard" onNavigate={onNavigate} onShowLauncher={() => {}} />,
    );
    fireEvent.click(getByLabelText("Deliveries"));
    expect(onNavigate).toHaveBeenCalledWith("Deliveries");
  });

  it("calls onShowLauncher from the Show Applications button", () => {
    const onShowLauncher = vi.fn();
    const { getByLabelText } = render(
      <Dock currentPageName="Dashboard" onNavigate={() => {}} onShowLauncher={onShowLauncher} />,
    );
    fireEvent.click(getByLabelText("Show applications"));
    expect(onShowLauncher).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/desktop/__tests__/Dock.test.jsx --maxWorkers=2`
Expected: FAIL — cannot resolve `@/components/desktop/Dock`.

- [ ] **Step 3: Create `src/components/desktop/Dock.jsx`**

```jsx
/**
 * Dock — persistent glossy left dock of module quick-links.
 *
 * Renders ModuleIcon buttons for the user's dock set (localStorage override or
 * DOCK_DEFAULT_PAGES) + a Show Applications button that opens the launcher.
 * Mirrors the active module with an accent outline.
 */
import React, { useMemo } from "react";
import { Grid3x3 } from "lucide-react";
import ModuleIcon from "./ModuleIcon";
import { dockModules } from "@/config/launcherConfig";

const DOCK_LS_KEY = "sbp-desktop-dock";

function loadDockPages() {
  try {
    const raw = localStorage.getItem(DOCK_LS_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch { return null; }
}

export default function Dock({ currentPageName, onNavigate, onShowLauncher }) {
  const items = useMemo(() => dockModules(loadDockPages() || undefined), []);

  return (
    <aside
      aria-label="Dock"
      style={{
        width: 56, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center", gap: 10, padding: "10px 0",
        margin: "8px 0 8px 8px", borderRadius: 16,
        background: "var(--desk-dock-bg)", border: "1px solid var(--desk-dock-edge)",
        position: "relative", zIndex: 10,
      }}
    >
      {items.map((m) => {
        const active = m.page === currentPageName;
        return (
          <button
            key={m.page}
            className="desk-dock-btn"
            onClick={() => onNavigate(m.page)}
            aria-label={m.label}
            aria-current={active ? "page" : undefined}
            title={m.label}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              borderRadius: 13,
              outline: active ? "2px solid var(--accent)" : "none",
              outlineOffset: 2,
            }}
          >
            <ModuleIcon page={m.page} label={m.label} size={40} />
          </button>
        );
      })}

      <button
        className="desk-dock-btn"
        onClick={onShowLauncher}
        aria-label="Show applications"
        title="Show applications"
        style={{
          marginTop: "auto", width: 40, height: 40, borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "var(--text-secondary)",
          background: "var(--desk-tile)", border: "1px solid var(--desk-tile-edge)",
          boxShadow: "var(--desk-tile-shadow)",
        }}
      >
        <Grid3x3 size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/desktop/__tests__/Dock.test.jsx --maxWorkers=2`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/Dock.jsx src/components/desktop/__tests__/Dock.test.jsx
git commit -m "feat(desktop): add Dock (glossy module quick-links)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Launcher (applications overview)

**Files:**
- Create: `src/components/desktop/Launcher.jsx`
- Create: `src/components/desktop/__tests__/Launcher.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/desktop/__tests__/Launcher.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import Launcher from "@/components/desktop/Launcher";

describe("Launcher", () => {
  it("renders the module grid and category rail", () => {
    const { getByText, getAllByText } = render(<Launcher onNavigate={() => {}} />);
    expect(getByText("ALL")).toBeTruthy();
    expect(getAllByText("Deliveries").length).toBeGreaterThan(0);
  });

  it("filters by search query", () => {
    const { getByPlaceholderText, queryByText } = render(<Launcher onNavigate={() => {}} />);
    fireEvent.change(getByPlaceholderText(/type to search/i), { target: { value: "deliver" } });
    expect(queryByText("Deliveries")).toBeTruthy();
    expect(queryByText("Fab Release")).toBeNull();
  });

  it("navigates when a module tile is clicked", () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(<Launcher onNavigate={onNavigate} />);
    fireEvent.click(getByLabelText("Open Deliveries"));
    expect(onNavigate).toHaveBeenCalledWith("Deliveries");
  });

  it("filters by category when a rail item is chosen", () => {
    const { getByText, queryByText } = render(<Launcher onNavigate={() => {}} />);
    fireEvent.click(getByText("COST"));
    expect(queryByText("Deliveries")).toBeNull();
    expect(queryByText("Change Orders")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/desktop/__tests__/Launcher.test.jsx --maxWorkers=2`
Expected: FAIL — cannot resolve `@/components/desktop/Launcher`.

- [ ] **Step 3: Create `src/components/desktop/Launcher.jsx`**

```jsx
/**
 * Launcher — the applications overview (desktop home).
 * Photoreal module grid (ModuleIcon) + category rail + live search.
 * Pure presentational: navigation is delegated via onNavigate(page).
 */
import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import ModuleIcon from "./ModuleIcon";
import { LAUNCHER_CATEGORIES, modulesForCategory, searchModules } from "@/config/launcherConfig";

export default function Launcher({ onNavigate }) {
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");

  const modules = useMemo(() => {
    if (query.trim()) return searchModules(query);
    return modulesForCategory(category);
  }, [category, query]);

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative", zIndex: 1 }}>
      {/* Grid + search */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "18px 20px", overflowY: "auto" }}>
        <div style={{
          alignSelf: "center", display: "flex", alignItems: "center", gap: 8,
          background: "rgba(8,11,16,0.55)", border: "1px solid var(--desk-window-edge)",
          borderRadius: 20, padding: "6px 16px", marginBottom: 22, minWidth: 280,
        }}>
          <Search size={15} strokeWidth={1.8} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            aria-label="Search applications"
            style={{
              background: "transparent", border: "none", outline: "none",
              color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-body)", width: 220,
            }}
          />
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
          gap: "22px 10px", alignContent: "start",
        }}>
          {modules.map((m) => (
            <button
              key={m.page}
              className="desk-launch-tile"
              onClick={() => onNavigate(m.page)}
              aria-label={`Open ${m.label}`}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                background: "none", border: "none", cursor: "pointer", padding: 4,
              }}
            >
              <ModuleIcon page={m.page} label={m.label} size={68} />
              <span style={{
                color: "var(--text-secondary)", fontSize: 11, fontFamily: "var(--font-body)",
                textAlign: "center", lineHeight: 1.25, maxWidth: 96,
              }}>
                {m.label}
              </span>
            </button>
          ))}
          {modules.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: 13, gridColumn: "1 / -1" }}>
              No modules match “{query}”.
            </p>
          )}
        </div>
      </div>

      {/* Category rail */}
      <nav aria-label="Categories" style={{
        width: 132, flexShrink: 0, padding: "20px 14px", overflowY: "auto",
        borderLeft: "1px solid var(--desk-window-edge)",
      }}>
        {LAUNCHER_CATEGORIES.map((c) => {
          const active = c === category && !query.trim();
          return (
            <button
              key={c}
              onClick={() => { setCategory(c); setQuery(""); }}
              style={{
                display: "block", width: "100%", textAlign: "left", background: "none",
                border: "none", cursor: "pointer", padding: "6px 4px",
                fontFamily: "var(--font-body)", fontSize: 11.5, letterSpacing: "0.02em",
                color: active ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {c}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/desktop/__tests__/Launcher.test.jsx --maxWorkers=2`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/Launcher.jsx src/components/desktop/__tests__/Launcher.test.jsx
git commit -m "feat(desktop): add Launcher (applications overview)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: ModuleSurface (window chrome)

**Files:**
- Create: `src/components/desktop/ModuleSurface.jsx`

- [ ] **Step 1: Create `src/components/desktop/ModuleSurface.jsx`**

```jsx
/**
 * ModuleSurface — wraps page content in a desktop "window".
 * On mobile it flattens to full-bleed (no chrome).
 */
import React from "react";

export default function ModuleSurface({ title, isMobile, children }) {
  if (isMobile) {
    return (
      <main id="main-content" tabIndex={-1} aria-label="Main content"
        style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", color: "var(--text-primary)" }}>
        {children}
      </main>
    );
  }
  return (
    <div style={{
      flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
      margin: "8px 8px 8px 0", borderRadius: 12, overflow: "hidden",
      border: "1px solid var(--desk-window-edge)", background: "var(--desk-window-bg)",
      position: "relative", zIndex: 1,
    }}>
      <div style={{
        height: 30, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 14px",
        background: "var(--desk-window-header)", borderBottom: "1px solid var(--desk-window-edge)",
        color: "var(--text-secondary)", fontSize: 12, fontFamily: "var(--font-body)",
      }}>
        {title}
      </div>
      <main id="main-content" tabIndex={-1} aria-label="Main content"
        style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", color: "var(--text-primary)" }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 20`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```powershell
git add src/components/desktop/ModuleSurface.jsx
git commit -m "feat(desktop): add ModuleSurface window chrome" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: DesktopShell (compose + overlays + data-skin)

**Files:**
- Create: `src/components/desktop/DesktopShell.jsx`

- [ ] **Step 1: Create `src/components/desktop/DesktopShell.jsx`**

Mirrors `Layout`'s data wiring (auth, project, alerts, search) so pages behave identically. Full file:

```jsx
/**
 * DesktopShell — the Linux-desktop-style app chrome (flag: desktop_shell).
 * Sets [data-skin="desktop"] while mounted; composes DesktopTopBar + Dock +
 * (Launcher overlay | ModuleSurface(children)). Reuses Layout's overlays so all
 * page functionality (search, toasts, error banner) is preserved.
 */
import React, { Suspense, useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { AuthContext } from "@/lib/AuthContext";
import { useTheme } from "@/components/shared/ThemeContext";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useResponsiveBreakpoint } from "@/components/nav/useResponsiveBreakpoint";
import { useGlobalSearchShortcut } from "@/components/nav/useGlobalSearchShortcut";
import { useDensityRestore } from "@/components/nav/useDensityRestore";
import { useLayoutNavData } from "@/components/nav/useLayoutNavData";
import { useDocumentTitleForRoute } from "@/components/nav/useDocumentTitleForRoute";
import { useFocusMainOnRouteChange } from "@/components/nav/useFocusMainOnRouteChange";
import ProjectErrorBanner from "@/components/nav/ProjectErrorBanner";
import SkipToMainContentLink from "@/components/nav/SkipToMainContentLink";
import { PAGE_LABELS } from "@/config/moduleRegistry";
import DesktopTopBar from "./DesktopTopBar";
import Dock from "./Dock";
import Launcher from "./Launcher";
import ModuleSurface from "./ModuleSurface";

const GlobalSearchModal = lazyWithRetry(() => import("@/components/search/GlobalSearchModal"));
const Toaster = lazyWithRetry(() => import("sonner").then((m) => ({ default: m.Toaster })));

export default function DesktopShell({ currentPageName, children }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isMobile = useResponsiveBreakpoint();

  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;
  const logout = authCtx?.logout || (() => {});

  const [searchOpen, setSearchOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);

  useDensityRestore();
  useGlobalSearchShortcut(setSearchOpen);

  const { activeProject } = useProjectContext();
  const { unreadAlerts, unreadCount, markAllRead } = useLayoutNavData(activeProject?.id || null, { includeModuleCounts: false });

  useDocumentTitleForRoute(currentPageName, activeProject);
  useFocusMainOnRouteChange(currentPageName);

  // Own the desktop skin attribute for the shell's lifetime.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-skin", "desktop");
    return () => root.removeAttribute("data-skin");
  }, []);

  // Close the launcher whenever the route changes (a module opened).
  useEffect(() => { setLauncherOpen(false); }, [currentPageName]);

  const handleNavigate = (page) => navigate(createPageUrl(page));
  const title = PAGE_LABELS[currentPageName] || currentPageName || "Dashboard";

  return (
    <div className={`desk-canvas ${isDark ? "steelbuild-dark" : ""}`} style={{
      minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <SkipToMainContentLink />

      <DesktopTopBar
        currentPageName={currentPageName}
        onShowLauncher={() => setLauncherOpen((v) => !v)}
        onOpenSearch={() => setSearchOpen(true)}
        user={user}
        onLogout={logout}
        alerts={unreadAlerts}
        unreadCount={unreadCount}
        onMarkAllRead={markAllRead}
        onViewAllAlerts={() => handleNavigate("AlertsCenter")}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative", zIndex: 1 }}>
        {!isMobile && (
          <Dock currentPageName={currentPageName} onNavigate={handleNavigate} onShowLauncher={() => setLauncherOpen((v) => !v)} />
        )}

        {launcherOpen ? (
          <Launcher onNavigate={handleNavigate} />
        ) : (
          <ModuleSurface title={title} isMobile={isMobile}>
            <ProjectErrorBanner />
            {children}
          </ModuleSurface>
        )}
      </div>

      {/* Mobile: dock becomes a bottom bar */}
      {isMobile && (
        <Dock currentPageName={currentPageName} onNavigate={handleNavigate} onShowLauncher={() => setLauncherOpen((v) => !v)} />
      )}

      {searchOpen && (
        <Suspense fallback={null}>
          <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <Toaster theme={isDark ? "dark" : "light"} richColors closeButton position="bottom-right" />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 20`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```powershell
git add src/components/desktop/DesktopShell.jsx
git commit -m "feat(desktop): add DesktopShell composing shell + overlays" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Wire the feature flag into LayoutRoute

**Files:**
- Modify: `src/boot/LayoutRoute.jsx`

- [ ] **Step 1: Replace `src/boot/LayoutRoute.jsx` with the flag-aware version**

```jsx
import { Outlet, useLocation } from "react-router-dom";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import Layout from "@/Layout";
import DesktopShell from "@/components/desktop/DesktopShell";
import { useFlag } from "@/hooks/useFeatureFlag";

/**
 * LayoutRoute — mounts the app chrome ONCE and keeps it across navigations.
 * Chooses DesktopShell (flag: desktop_shell) or the classic Layout. Both render
 * the page <Outlet>, so all routes work identically under either shell.
 */
export default function LayoutRoute() {
  const location = useLocation();
  const currentPageName = location.pathname.replace(/^\//, "") || "Dashboard";
  const desktopShell = useFlag("desktop_shell");

  const Shell = desktopShell ? DesktopShell : Layout;

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Shell currentPageName={currentPageName}>
        <Outlet />
      </Shell>
    </PageErrorBoundary>
  );
}
```

- [ ] **Step 2: Verify the existing boot test still passes (flag defaults off)**

Run: `npx vitest run src/boot/__tests__/IndexRoute.test.jsx --maxWorkers=2`
Expected: PASS — `useFlag` returns false by default, so `Layout` is selected; existing behavior unchanged.

- [ ] **Step 3: Verify build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 20`
Expected: EXIT 0.

- [ ] **Step 4: Commit**

```powershell
git add src/boot/LayoutRoute.jsx
git commit -m "feat(desktop): select DesktopShell when desktop_shell flag is on" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Launcher route + flag-guarded landing

**Files:**
- Modify: `src/boot/AppRoutes.jsx`
- Modify: `src/boot/__tests__/IndexRoute.test.jsx` (add one case)

- [ ] **Step 1: Add a failing test for the flag-guarded landing**

Open `src/boot/__tests__/IndexRoute.test.jsx`. Add this test inside the existing top-level `describe` (it follows the file's existing mocking style — reuse the helpers already defined there; the snippet below assumes the file's existing `renderIndex`/mocks. If the file mocks `useFlag`, set it true; if not, add `vi.mock("@/hooks/useFeatureFlag", () => ({ useFlag: () => true }))` at the top with the other mocks):

```jsx
it("redirects to /Launcher on first load when desktop_shell is on and no explicit pref", () => {
  // desktop_shell mocked true (see top-of-file mock); no default_landing pref;
  // fresh session (LANDING_REDIRECT_KEY unset).
  sessionStorage.removeItem("sbp-landing-redirected");
  const { container } = renderIndexAt("/"); // existing helper that renders IndexRoute in a MemoryRouter
  // Navigate renders nothing; assert the redirect target was requested.
  expect(window.location.pathname.endsWith("/Launcher") || container.innerHTML === "").toBe(true);
});
```

Note: match the assertion mechanism the existing tests use (they assert on the rendered `<Navigate>` target or on a captured location). Reuse that exact mechanism rather than `window.location`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/boot/__tests__/IndexRoute.test.jsx --maxWorkers=2`
Expected: FAIL — IndexRoute does not yet branch on the flag.

- [ ] **Step 3: Add the flag-guarded branch + the /Launcher route in `AppRoutes.jsx`**

In `src/boot/AppRoutes.jsx`:

a) Add imports near the top:

```jsx
import { useFlag } from "@/hooks/useFeatureFlag";
const LauncherPage = lazyWithRetry(() => import("@/pages/LauncherPage"));
```

b) Inside `IndexRoute()`, immediately AFTER the `explicitTarget` line and BEFORE the `savedSelection` block, add:

```jsx
  // Desktop shell: the launcher is the home. When the flag is on and the user
  // has no explicit landing pref, land on the launcher (role-agnostic, so no
  // need to wait for the per-project role to resolve). Honors the same
  // once-per-session guard as the other targets.
  const desktopShell = useFlag("desktop_shell");
  if (desktopShell && !explicitTarget && !alreadyRedirected) {
    try { sessionStorage.setItem(LANDING_REDIRECT_KEY, "1"); } catch { /* ignore */ }
    return <Navigate to="/Launcher" replace />;
  }
```

c) Inside `AppRoutes()`, add this route just before the `Landing` route:

```jsx
        <Route
          path="Launcher"
          element={
            <LazyRoute label="Launcher">
              <LauncherPage />
            </LazyRoute>
          }
        />
```

- [ ] **Step 4: Create the `/Launcher` page wrapper**

Create `src/pages/LauncherPage.jsx`:

```jsx
/**
 * LauncherPage — route target for "/Launcher". Renders the desktop Launcher
 * grid as page content so it appears inside whichever shell is active. Under
 * the classic Layout it simply shows the app grid; under DesktopShell the
 * shell's own launcher overlay is the primary entry, and this route is the
 * deep-link/landing target.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import Launcher from "@/components/desktop/Launcher";

export default function LauncherPage() {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", flex: 1, minHeight: "100%", flexDirection: "column" }}>
      <Launcher onNavigate={(page) => navigate(createPageUrl(page))} />
    </div>
  );
}
```

- [ ] **Step 5: Run the boot test to verify it passes**

Run: `npx vitest run src/boot/__tests__/IndexRoute.test.jsx --maxWorkers=2`
Expected: PASS (existing cases + the new flag-guarded case).

- [ ] **Step 6: Verify build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 20`
Expected: EXIT 0.

- [ ] **Step 7: Commit**

```powershell
git add src/boot/AppRoutes.jsx src/boot/__tests__/IndexRoute.test.jsx src/pages/LauncherPage.jsx
git commit -m "feat(desktop): add /Launcher route + flag-guarded launcher landing" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Full validation ladder

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint 2>&1 | Select-Object -Last 40` then `Write-Host "EXIT: $LASTEXITCODE"`
Expected: EXIT 0 (fix any unused-import warnings from the SidebarNav refactor).

- [ ] **Step 2: Typecheck (all gates)**

Run each, expecting EXIT 0:
```powershell
npm run typecheck 2>&1 | Select-Object -Last 20; Write-Host "EXIT: $LASTEXITCODE"
npm run typecheck:strict 2>&1 | Select-Object -Last 20; Write-Host "EXIT: $LASTEXITCODE"
npm run typecheck:noimplicitany 2>&1 | Select-Object -Last 20; Write-Host "EXIT: $LASTEXITCODE"
```

- [ ] **Step 3: Full test suite**

Run: `npx vitest run --maxWorkers=2 2>&1 | Select-Object -Last 60` then `Write-Host "EXIT: $LASTEXITCODE"`
Expected: EXIT 0 — all existing + new tests pass.

- [ ] **Step 4: Production build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 40` then `Write-Host "EXIT: $LASTEXITCODE"`
Expected: EXIT 0.

- [ ] **Step 5: Commit (only if any fixups were needed)**

```powershell
git add <explicit fixup paths>
git commit -m "chore(desktop): validation-ladder fixups for phase 1a" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Enable the flag + field verification

**Files:** none (runtime + data)

- [ ] **Step 1: Create the `desktop_shell` flag (off globally, on for the owner)**

Add the flag so it's manageable in `/FeatureFlagsAdmin`. Either create it in that UI, or apply this one row via Supabase MCP `execute_sql` (data, not a migration):

```sql
insert into feature_flags (flag_key, enabled, user_overrides, description)
values ('desktop_shell', false, '{"nicholasl@shsteelaz.com": true}'::jsonb, 'Linux-desktop-style shell (launcher + dock)')
on conflict (flag_key) do update set user_overrides = excluded.user_overrides;
```

(Confirm the `feature_flags` column names against the live table with `list_tables` before running — adjust `description`/`user_overrides` if they differ.)

- [ ] **Step 2: Run the app and field-verify (the real bar — not build-green)**

Run: `npm run dev` and sign in as the owner account, then verify in the browser:
- The app loads into the **desktop shell** (dark-glass canvas, left dock, Activities bar).
- The index route ("/") lands on the **Launcher**; the icon grid renders (lucide fallback tiles), category rail filters, and the search box filters.
- Clicking a launcher tile **opens that module** inside the window surface; the dock shows the active module highlighted.
- The **Activities/Show-Applications** button reopens the launcher; clicking a dock icon switches modules.
- Top-bar **search** opens the global search modal; the **bell**, **theme toggle**, **project pill**, and **sign-out** all work.
- Toggle the flag override OFF for the owner → app returns to the classic `Layout` with the text sidebar (proves the fallback path).
- Resize to a phone width → dock renders as a bottom bar; launcher grid scrolls; a module is readable.

- [ ] **Step 3: Record the verification outcome**

In the PR/summary, state explicitly which bar was met: "field-verified in dev — launcher landing, dock switching, module open, search, and flag-off fallback all confirmed in-browser." Note any item that could only be code-verified.

---

## Self-review

**1. Spec coverage (Phase 1 scope):**
- Desktop shell components (DesktopShell/TopBar/Dock/Launcher/ModuleSurface) → Tasks 5-9. ✓
- ModuleIcon with lucide fallback → Task 3. ✓
- One registry drives dock+launcher → Task 2 (derived from SIDEBAR_GROUPS). ✓
- `data-skin="desktop"` theme layered on tokens, SteelBuild Dark preserved → Tasks 4, 9. ✓
- Search reuses cmdk global search → Tasks 5, 9 (GlobalSearchModal + useGlobalSearchShortcut). ✓
- Launcher-first landing, classic Layout kept as fallback → Tasks 10, 11. ✓
- Feature-flag gated, owner dogfood override → Tasks 10, 13. ✓
- Mobile (dock→bottom bar, full-bleed surface) → Tasks 8, 9. ✓
- Icon pipeline scaffolding (iconAssetFor/ICON_ASSETS empty, fallback) → Tasks 2, 3. ✓
- Field-verification each phase → Task 13. ✓
- Deferred to Plan 1B (documented): raster icon pack production + art brief, moat-screen reskin, RBAC-based launcher hiding, dock-favorites editing UI + server persistence.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". The two test snippets that adapt to the existing `IndexRoute.test.jsx` harness (Task 11) explicitly instruct to reuse that file's existing render/assert mechanism — this is a real instruction, not a placeholder, because that harness's exact helpers must be matched in-place.

**3. Type/name consistency:** `iconAssetFor`, `LAUNCHER_MODULES`, `LAUNCHER_CATEGORIES`, `DOCK_DEFAULT_PAGES`, `modulesForCategory`, `searchModules`, `dockModules` (Task 2) are used consistently in Tasks 3, 6, 7. `getPageIcon`/`PAGE_ICON`/`FallbackIcon` (Task 1) used in Tasks 1, 3. `ModuleIcon` props (`page`, `label`, `size`, `assetBase`) consistent across Tasks 3, 6, 7. `DesktopShell`/`Dock`/`Launcher`/`DesktopTopBar`/`ModuleSurface` prop names consistent across Tasks 5-11. `useFlag("desktop_shell")` used identically in Tasks 10, 11.
