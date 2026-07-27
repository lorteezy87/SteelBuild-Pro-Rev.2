# Dual Theme Dark Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete dual theme across SteelBuild Pro — system preference when unset, Control Centers dark via SteelBuild Dark–mapped `--cmd-*`, and an exhaustive hex/rgba burn-down so light and dark both render coherently.

**Architecture:** `ThemeContext` resolves theme from `sbp-theme` or `prefers-color-scheme` and only persists after an explicit user/server choice. `LayoutRoute` stops forcing light. `command.css` gains an additive `[data-skin="command"][data-theme="dark"]` remap onto `--sbd-*`. Domain batches replace surface/text/border hardcoded colors with tokens; semantic stage hex stays centralized and allowlisted.

**Tech Stack:** React 18, Vite, Vitest/jsdom, CSS custom properties (`tokens.css`, `steelbuild-dark.css`, `command.css`), existing ThemeContext / command kit.

**Spec:** `docs/superpowers/specs/2026-07-27-dual-theme-dark-completion-design.md`

## Global Constraints

- Dual theme; Control Centers participate in both via `--cmd-*` (never wrap command pages in raw `.sbd-*` chrome).
- Unset `sbp-theme` → `prefers-color-scheme`; explicit toggle/Settings/server prefs win and persist.
- Command dark maps onto existing SteelBuild Dark (`--sbd-*` / dark `--bg-*`); do not invent a new night brand.
- Light command rules stay; dark is additive.
- Do not grow `scripts/strict-typecheck.mjs` / `scripts/noimplicitany-typecheck.mjs` ignore lists.
- New code is `.ts`/`.tsx` only (`npm run check:no-new-js`).
- Per batch: lint + applicable typecheck gates + targeted vitest; spot-check light still looks correct.
- Hardcoded hex allowed only for allowlisted semantic/data encodings (document reason).

## File map (create / modify)

| File | Responsibility |
| --- | --- |
| `src/lib/themeResolution.ts` | Pure theme resolve helpers (testable) |
| `src/lib/__tests__/themeResolution.test.ts` | Unit tests for resolve/persist rules |
| `src/components/shared/ThemeContext.jsx` | Wire system pref + explicit-only persist + OS listener |
| `src/boot/LayoutRoute.jsx` | Remove light force |
| `src/styles/command.css` | Dark `--cmd-*` remap + dark-safe chip/hero/table fills |
| `src/styles/piece-control-command.css` | Replace light-only hardcodes with `--cmd-*` / dark-safe tokens |
| `src/pages/dashboard/dashboardTheme.css` | Finish dark path; no light force under `.steelbuild-dark` |
| `src/styles/base.css` | Select/input contrast under dark command if needed |
| Domain dirs (Tasks 6–11) | Hex/rgba → tokens burn-down |
| `AGENT_CLAIMS.md`, `CLAUDE.md`, `AGENTS.md`, light-rollout spec | Dual-theme truth + retire light-only lock |

---

### Task 1: Theme resolution helpers + failing tests

**Files:**
- Create: `src/lib/themeResolution.ts`
- Create: `src/lib/__tests__/themeResolution.test.ts`

**Interfaces:**
- Produces:
  - `THEME_STORAGE_KEY = "sbp-theme"`
  - `readStoredTheme(storage): "dark" \| "light" \| null`
  - `readSystemTheme(matchMediaFn): "dark" \| "light"`
  - `resolveInitialTheme({ storage, matchMedia }): { theme: "dark" \| "light"; source: "user" \| "system" }`
  - `shouldPersistTheme(source): boolean` → `source === "user"`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/themeResolution.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  readStoredTheme,
  readSystemTheme,
  resolveInitialTheme,
  shouldPersistTheme,
  THEME_STORAGE_KEY,
} from "@/lib/themeResolution";

function memoryStorage(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

describe("themeResolution", () => {
  it("readStoredTheme returns null when unset", () => {
    expect(readStoredTheme(memoryStorage())).toBeNull();
  });

  it("readStoredTheme returns dark/light when valid", () => {
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: "dark" }))).toBe("dark");
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: "light" }))).toBe("light");
  });

  it("readStoredTheme ignores invalid values", () => {
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: "purple" }))).toBeNull();
  });

  it("readSystemTheme follows prefers-color-scheme", () => {
    const darkMq = vi.fn(() => ({ matches: true }));
    const lightMq = vi.fn(() => ({ matches: false }));
    expect(readSystemTheme(darkMq as unknown as typeof window.matchMedia)).toBe("dark");
    expect(readSystemTheme(lightMq as unknown as typeof window.matchMedia)).toBe("light");
  });

  it("resolveInitialTheme prefers stored over system", () => {
    const r = resolveInitialTheme({
      storage: memoryStorage({ [THEME_STORAGE_KEY]: "light" }),
      matchMedia: (() => ({ matches: true })) as unknown as typeof window.matchMedia,
    });
    expect(r).toEqual({ theme: "light", source: "user" });
  });

  it("resolveInitialTheme uses system when unset", () => {
    const r = resolveInitialTheme({
      storage: memoryStorage(),
      matchMedia: (() => ({ matches: true })) as unknown as typeof window.matchMedia,
    });
    expect(r).toEqual({ theme: "dark", source: "system" });
  });

  it("shouldPersistTheme only for user source", () => {
    expect(shouldPersistTheme("user")).toBe(true);
    expect(shouldPersistTheme("system")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/lib/__tests__/themeResolution.test.ts
```

Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Implement helpers**

```ts
// src/lib/themeResolution.ts
export const THEME_STORAGE_KEY = "sbp-theme";
export type ThemeMode = "dark" | "light";
export type ThemeSource = "user" | "system";

const ALLOWED = new Set<ThemeMode>(["dark", "light"]);

export type ThemeStorage = {
  getItem(key: string): string | null;
};

export function readStoredTheme(storage: ThemeStorage): ThemeMode | null {
  try {
    const v = storage.getItem(THEME_STORAGE_KEY);
    if (v && ALLOWED.has(v as ThemeMode)) return v as ThemeMode;
  } catch {
    /* ignore */
  }
  return null;
}

export function readSystemTheme(
  matchMediaFn?: typeof window.matchMedia,
  fallback: ThemeMode = "dark",
): ThemeMode {
  try {
    const mq = matchMediaFn ?? (typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined);
    if (!mq) return fallback;
    return mq("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return fallback;
  }
}

export function resolveInitialTheme(opts: {
  storage: ThemeStorage;
  matchMedia?: typeof window.matchMedia;
  fallback?: ThemeMode;
}): { theme: ThemeMode; source: ThemeSource } {
  const stored = readStoredTheme(opts.storage);
  if (stored) return { theme: stored, source: "user" };
  return {
    theme: readSystemTheme(opts.matchMedia, opts.fallback ?? "dark"),
    source: "system",
  };
}

export function shouldPersistTheme(source: ThemeSource): boolean {
  return source === "user";
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/lib/__tests__/themeResolution.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/themeResolution.ts src/lib/__tests__/themeResolution.test.ts
git commit -m "feat: add theme resolution helpers for system preference"
```

---

### Task 2: Wire ThemeContext + stop LayoutRoute light force

**Files:**
- Modify: `src/components/shared/ThemeContext.jsx`
- Modify: `src/boot/LayoutRoute.jsx`
- Test: `src/lib/__tests__/themeResolution.test.ts` (already green; manual contract below)

**Interfaces:**
- Consumes: `resolveInitialTheme`, `shouldPersistTheme`, `THEME_STORAGE_KEY` from `@/lib/themeResolution`
- Produces: ThemeProvider that (a) inits from stored or system, (b) persists theme only when `source === "user"`, (c) follows OS `change` while source is system, (d) `setTheme` / `toggleTheme` / `applyPreferences({theme})` set source to `"user"`

- [ ] **Step 1: Update ThemeContext**

Replace theme init + persistence. Keep accent/fontScale/contrast/motion behavior unchanged (they still persist always).

Key changes inside `ThemeProvider`:

```jsx
import {
  resolveInitialTheme,
  shouldPersistTheme,
  THEME_STORAGE_KEY,
} from "@/lib/themeResolution";

// inside ThemeProvider:
const initial = resolveInitialTheme({
  storage: typeof localStorage !== "undefined" ? localStorage : { getItem: () => null },
  matchMedia: typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined,
});
const [theme, setThemeState] = useState(initial.theme);
const [themeSource, setThemeSource] = useState(initial.source); // "user" | "system"

useEffect(() => {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // ... existing accent/contrast/motion/font-scale + steelbuild-dark class ...
  try {
    if (shouldPersistTheme(themeSource)) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    localStorage.setItem(KEY.accent, accent);
    localStorage.setItem(KEY.fontScale, fontScale);
    localStorage.setItem(KEY.contrast, contrast);
    localStorage.setItem(KEY.motion, motion);
  } catch {}
}, [theme, themeSource, accent, fontScale, contrast, motion]);

// Follow OS only while unresolved by user
useEffect(() => {
  if (themeSource !== "system") return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (e) => setThemeState(e.matches ? "dark" : "light");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}, [themeSource]);

const setTheme = useCallback((next) => {
  if (!ALLOWED.theme.has(next)) return;
  setThemeSource("user");
  setThemeState(next);
}, []);
const toggleTheme = useCallback(() => {
  setThemeSource("user");
  setThemeState((t) => (t === "dark" ? "light" : "dark"));
}, []);
// In applyPreferences: if applying theme, also setThemeSource("user")
```

Update the file header comment to document system preference when `sbp-theme` is absent.

- [ ] **Step 2: Simplify LayoutRoute**

Remove `useTheme` import/usage and the light-forcing effect. Keep page-name derivation + Layout outlet:

```jsx
import { Outlet, useLocation } from "react-router-dom";
import PageErrorBoundary from "@/components/shared/ErrorBoundary";
import Layout from "@/Layout";
import { PAGES } from "@/config/routes";

/**
 * LayoutRoute — mounts the app chrome (Layout) ONCE and keeps it across
 * navigations; the page <Outlet> renders inside it.
 * Theme resolution lives entirely in ThemeContext (stored pref or system).
 */
export default function LayoutRoute() {
  const location = useLocation();
  const pathSegments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const segment = pathSegments.length === 0 ? "Dashboard" : pathSegments[0];
  const canonicalPageName =
    Object.keys(PAGES).find((pageName) => pageName.toLowerCase() === segment.toLowerCase()) || segment;
  const currentPageName = canonicalPageName || "Dashboard";

  return (
    <PageErrorBoundary label="Layout" key="layout-boundary">
      <Layout currentPageName={currentPageName}>
        <Outlet />
      </Layout>
    </PageErrorBoundary>
  );
}
```

- [ ] **Step 3: Verify helpers still pass + lint touched files**

```bash
npx vitest run src/lib/__tests__/themeResolution.test.ts
npm run lint
```

Expected: tests PASS; lint clean for touched files.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/ThemeContext.jsx src/boot/LayoutRoute.jsx
git commit -m "feat: resolve theme from system preference; stop layout light force"
```

---

### Task 3: Command kit dark token map

**Files:**
- Modify: `src/styles/command.css`

**Interfaces:**
- Consumes: `--sbd-*` / `--bg-*` / `--status-*` from SteelBuild Dark when `html.steelbuild-dark` + `data-theme="dark"`
- Produces: dark `--cmd-*` + dark-safe fills under `[data-skin="command"][data-theme="dark"]` (and `html.steelbuild-dark[data-skin="command"]` for safety)

- [ ] **Step 1: Add fill tokens to the light `[data-skin="command"]` block**

At the top of the existing light block (after current `--cmd-*` defs), add chip/surface fill tokens so light keeps today’s look via variables:

```css
[data-skin="command"] {
  /* existing --cmd-bg … --cmd-review */
  --cmd-chip-bg: #e9edf2;
  --cmd-chip-good-bg: #d6f0de;
  --cmd-chip-warn-bg: #fbe5c0;
  --cmd-chip-danger-bg: #f9d2ce;
  --cmd-chip-info-bg: #d7e5fb;
  --cmd-icon-wash: #fdf3da;
  --cmd-kpi-icon-bg: #f1f4f8;
  --cmd-row-hover: #f7f9fc;
  --cmd-hero-fade: rgba(255, 255, 255, 0.42);
  --cmd-on-gold: #20160a;
  --cmd-pill-good-fg: #04331d;
  --cmd-pill-warn-fg: #422c00;
  --cmd-pill-neutral-fg: #3d4753;
}
```

Replace hardcoded uses in the same file (`#e9edf2`, `#d6f0de`, `#fbe5c0`, `#f9d2ce`, `#d7e5fb`, `#fdf3da`, `#f1f4f8`, `#f7f9fc`, hero white gradients, `#20160a` on primary/active) with these vars.

Hero background-image example:

```css
background-image: linear-gradient(
    90deg,
    var(--cmd-surface) 14%,
    var(--cmd-hero-fade) 44%,
    rgba(255, 255, 255, 0) 100%
  ),
  var(--cmd-hero-photo, url("/photos/steelbuildpro-hero.svg"));
```

- [ ] **Step 2: Add the dark remap block (additive, after the light block, before detailing-cc)**

```css
/* Dual theme — command dark maps onto SteelBuild Dark (Phase 4). */
html.steelbuild-dark[data-skin="command"],
[data-skin="command"][data-theme="dark"] {
  --cmd-bg: var(--sbd-bg-base, var(--bg-page));
  --cmd-surface: var(--sbd-bg-surface, var(--bg-surface));
  --cmd-border: var(--sbd-border, var(--border-default));
  --cmd-text: var(--sbd-text, var(--text-primary));
  --cmd-text-muted: var(--sbd-text-muted, var(--text-muted));
  --cmd-gold: var(--sbd-gold, var(--accent-light));
  --cmd-good: var(--sbd-success, var(--status-success));
  --cmd-warn: var(--sbd-warning, var(--status-warning));
  --cmd-danger: var(--sbd-error, var(--status-error));
  --cmd-info: var(--sbd-info, var(--status-info));
  --cmd-review: var(--sbd-review, var(--status-review));
  /* Text-on-chip: lighter tones for dark pastel fills */
  --cmd-good-text: #6ee7b7;
  --cmd-warn-text: #fcd34d;
  --cmd-danger-text: #fca5a5;
  --cmd-chip-bg: rgba(255, 255, 255, 0.08);
  --cmd-chip-good-bg: rgba(52, 211, 153, 0.16);
  --cmd-chip-warn-bg: rgba(224, 176, 48, 0.16);
  --cmd-chip-danger-bg: rgba(248, 113, 113, 0.16);
  --cmd-chip-info-bg: rgba(96, 165, 250, 0.16);
  --cmd-icon-wash: rgba(224, 176, 48, 0.18);
  --cmd-kpi-icon-bg: rgba(255, 255, 255, 0.06);
  --cmd-row-hover: rgba(255, 255, 255, 0.04);
  --cmd-hero-fade: rgba(5, 8, 16, 0.55);
  --cmd-on-gold: #20160a;
  --cmd-pill-good-fg: #04331d;
  --cmd-pill-warn-fg: #422c00;
  --cmd-pill-neutral-fg: var(--cmd-text);
}
```

Ensure `.cmd-chip--*`, `.cmd-kpi--* .cmd-kpi__icon`, `.cmd-pill--neutral`, `.cmd-table tr.is-clickable:hover td`, `.cmd-hero__icon` consume the new vars.

- [ ] **Step 3: Retarget detailing-cc aliases to `--cmd-*` fills**

In the `.detailing-cc` block, replace forced light hex (`#f7f9fc`, `#f1f4f8`, `#3f4a57`, pastel muteds) with `var(--cmd-row-hover)`, `var(--cmd-kpi-icon-bg)`, `var(--cmd-text-muted)`, `var(--cmd-chip-*-bg)`, etc., so dark remap flows through. Update the comment: kit follows active `--cmd-*` (light or dark), not “always-light.”

- [ ] **Step 4: Grep gate for remaining light-only hex in command.css kit chrome**

```bash
rg -n '#[0-9a-fA-F]{3,8}' src/styles/command.css | rg -v 'cmd-|/\*|Phase|detailing' | head -60
```

Replace any remaining chrome hex in shared `cmd-*` rules with vars. Allowlisted: none in shared kit chrome after this task.

- [ ] **Step 5: Commit**

```bash
git add src/styles/command.css
git commit -m "feat: map command kit dark tokens onto SteelBuild Dark"
```

---

### Task 4: Piece Register command CSS + select/input dark safety

**Files:**
- Modify: `src/styles/piece-control-command.css`
- Modify: `src/styles/base.css` (only if native select/option contrast breaks under dark command)

**Interfaces:**
- Consumes: `--cmd-*` from Task 3
- Produces: piece-control surfaces that flip with theme

- [ ] **Step 1: Audit light-only hardcodes**

```bash
rg -n 'rgba\(255,\s*255,\s*255|#fff|#ffffff|#f[0-9a-f]{5}|#e[0-9a-f]{5}' src/styles/piece-control-command.css | head -80
```

- [ ] **Step 2: Tokenize chrome**

Examples already present:

```css
/* before */
border: 1px solid rgba(228, 232, 238, 0.9);
background: rgba(255, 255, 255, 0.92);

/* after */
border: 1px solid var(--cmd-border);
background: var(--cmd-surface);
color: var(--cmd-text);
```

Apply across piece-mode bars, panels, tables, buttons. Prefer `--cmd-*` over inventing piece-specific colors.

- [ ] **Step 3: Verify base select rules**

Confirm light-command select fix in `base.css` still scopes correctly. If dark command selects are unreadable, add a narrow additive rule under `html.steelbuild-dark[data-skin="command"] select` using `--cmd-surface` / `--cmd-text` — do not regress light.

- [ ] **Step 4: Commit**

```bash
git add src/styles/piece-control-command.css src/styles/base.css
git commit -m "fix: theme-tokenize piece-control command chrome for dark mode"
```

---

### Task 5: Shell / nav / dashboard reference chrome

**Files:**
- Modify: `src/pages/dashboard/dashboardTheme.css`
- Modify as needed: `src/Layout.jsx`, `src/components/nav/*` (only hardcoded chrome)
- Audit: `src/components/nav/ThemeToggleButton.jsx` (should already work)

**Interfaces:**
- Produces: dashboard-reference-shell and app chrome that follow `data-theme` / `.steelbuild-dark` without forcing light surfaces in dark

- [ ] **Step 1: Audit**

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' src/pages/dashboard/dashboardTheme.css src/Layout.jsx src/components/nav --glob '!**/__tests__/**' | head -100
```

- [ ] **Step 2: Finish dark path in `dashboardTheme.css`**

Keep the existing `.steelbuild-dark .dashboard-reference-shell` block; extend it for any remaining light-forced rules (search `#ffffff` / `#fff` under `.dashboard-reference-shell` that lack a dark override). Prefer `var(--bg-*)` / `var(--text-*)` / `var(--sbd-*)` over new hex.

- [ ] **Step 3: Tokenize Layout/nav inline chrome**

Replace inline `style={{ background: '#…', color: '#…' }}` for surfaces/text/borders with CSS vars. Leave intentional brand mark colors only if allowlisted with a one-line comment.

- [ ] **Step 4: Lint + commit**

```bash
npm run lint
git add src/pages/dashboard/dashboardTheme.css src/Layout.jsx src/components/nav
git commit -m "fix: theme-tokenize shell and dashboard reference chrome"
```

---

### Task 6: Drawings / Detailing / DrawingViewer burn-down

**Files:**
- Modify under: `src/components/drawings/**`, `src/pages/drawingViewer/**`, `src/pages/drawingSubmittalHub/**`, detailing panels as needed
- Do **not** bypass command kit: inside command pages use `--cmd-*` / existing aliases

**Interfaces:**
- Consumes: theme tokens
- Allowlist: centralized stage/BIC maps in `src/components/design-system/tokens.js` (contrast-check; comment `// semantic stage — allowlisted`)

- [ ] **Step 1: Inventory**

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' src/components/drawings src/pages/drawingViewer src/pages/drawingSubmittalHub --glob '!**/__tests__/**' -c | sort -t: -k2 -nr | head -40
```

- [ ] **Step 2: Tokenize surface/text/border offenders**

Replacement matrix:

| Pattern | Replace with |
| --- | --- |
| `background: '#fff' / '#ffffff' / '#F8FAFC'` | `var(--bg-surface)` or `var(--cmd-surface)` in command |
| `background: '#0B0E11' / '#050810' / navy` | `var(--bg-page)` / `var(--bg-surface)` |
| `color: '#fff'` on chrome | `var(--text-primary)` |
| `color: '#64748B' / muted grays` | `var(--text-muted)` |
| `border: '1px solid #E2E8F0'` | `1px solid var(--border-default)` |

Keep canvas/PDF ink colors and centralized stage hex.

- [ ] **Step 3: Grep gate**

```bash
rg -n "background:\s*['\"]#|color:\s*['\"]#|border(?:Color)?:\s*['\"]#" src/components/drawings src/pages/drawingViewer src/pages/drawingSubmittalHub --glob '!**/__tests__/**' | head -80
```

Every remaining hit must be allowlisted semantic/data color or artwork.

- [ ] **Step 4: Targeted tests + lint + commit**

```bash
npm run lint
npx vitest run src/components/drawings src/pages/drawingViewer --passWithNoTests
git add src/components/drawings src/pages/drawingViewer src/pages/drawingSubmittalHub
git commit -m "fix: tokenize drawings/detailing/viewer chrome for dual theme"
```

---

### Task 7: Schedule / Gantt burn-down

**Files:**
- Modify: `src/components/schedule/**`, `src/components/gantt/**`, `src/lib/ganttTheme.js` (prefer VAR exports for chrome)
- Pages: schedule command center residual inline styles if any

**Interfaces:**
- Chrome → `--sbd-gantt-*` / `GANTT_*_VAR`
- Phase bar categorical hex may remain in `GANTT_PHASE_HEX` / `GANTT_GRADIENT` (allowlisted data encoding)

- [ ] **Step 1: Inventory**

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' src/components/schedule src/components/gantt src/lib/ganttTheme.js --glob '!**/__tests__/**' -c | sort -t: -k2 -nr
```

- [ ] **Step 2: Switch chrome call sites from HEX to VAR**

Where components style grid/panel/today line with `GANTT_*_HEX` or raw navy, use:

```js
import { GANTT_PHASE_VAR, GANTT_TODAY_HEX } from "@/lib/ganttTheme";
// panel bg
background: "var(--sbd-gantt-panel)"
// today line may keep GANTT_TODAY_HEX (#FF6B00) — matches --sbd-gantt-today
```

- [ ] **Step 3: Grep gate + tests + commit**

```bash
npm run lint
npx vitest run src/components/schedule src/components/gantt src/lib --passWithNoTests
git add src/components/schedule src/components/gantt src/lib/ganttTheme.js
git commit -m "fix: theme-tokenize schedule/gantt chrome for dual theme"
```

---

### Task 8: DMS / Documents burn-down

**Files:**
- Modify: `src/components/dms/**`, relevant `src/pages/documents/**` / Documents pages

- [ ] **Step 1: Inventory**

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' src/components/dms src/pages/documents src/pages/Documents.jsx --glob '!**/__tests__/**' -c | sort -t: -k2 -nr
```

- [ ] **Step 2: Tokenize chrome** using the same matrix as Task 6. Prefer `--cmd-*` inside command-skinned document centers.

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add src/components/dms src/pages/documents src/pages/Documents.jsx
git commit -m "fix: tokenize DMS/documents chrome for dual theme"
```

---

### Task 9: Submittals / RFIs residual panels & modals

**Files:**
- Modify: `src/components/submittals/**`, `src/components/rfis/**` (if present), residual modals under `src/pages/rfis/**`, `src/pages/submittals/**`
- Do not restyle command kit primitives with `.sbd-*` wrappers

- [ ] **Step 1: Inventory modals/panels with hex**

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(' src/components/submittals src/pages/submittals src/pages/rfis --glob '!**/__tests__/**' -c | sort -t: -k2 -nr
```

- [ ] **Step 2: Tokenize** modal shells, headers, footers, form fields to `var(--bg-elevated)` / `var(--bg-surface)` / `var(--text-*)` / `var(--border-*)` (or `--cmd-*` when rendered under command skin).

- [ ] **Step 3: Lint + commit**

```bash
npm run lint
git add src/components/submittals src/pages/submittals src/pages/rfis
git commit -m "fix: tokenize submittal/RFI residual chrome for dual theme"
```

---

### Task 10: Financials / reports / charts

**Files:**
- Modify: `src/components/financials/**`, report pages under `src/pages/reports/**` / `src/pages/Reports*`, chart call sites
- Prefer: `getChartTheme()` from `src/components/shared/RechartsThemeConfig.jsx`

- [ ] **Step 1: Inventory**

```bash
rg -n '#[0-9a-fA-F]{3,8}' src/components/financials src/pages/reports src/pages/Reports.jsx src/pages/costHub --glob '!**/__tests__/**' -c | sort -t: -k2 -nr
```

- [ ] **Step 2: Charts**

Replace hardcoded series/axis/tooltip colors with:

```js
import { getChartTheme } from "@/components/shared/RechartsThemeConfig";
const chartTheme = getChartTheme();
// stroke={chartTheme.colors.primary} etc.
```

- [ ] **Step 3: Panels/tables** → tokens per Task 6 matrix.

- [ ] **Step 4: Lint + commit**

```bash
npm run lint
git add src/components/financials src/pages/reports src/pages/Reports.jsx src/pages/costHub
git commit -m "fix: theme-tokenize financials/reports/charts for dual theme"
```

---

### Task 11: Long-tail pages + allowlist ledger

**Files:**
- Remaining `src/pages/**` and `src/components/**` offenders outside Tasks 3–10
- Create: `docs/superpowers/specs/2026-07-27-dual-theme-hex-allowlist.md` (short ledger of intentional remaining hex)

- [ ] **Step 1: Global inventory (exclude styles token definitions)**

```bash
rg -n '#[0-9a-fA-F]{3,8}' src/pages src/components --glob '!**/__tests__/**' --glob '!**/design-system/tokens.js' -c | sort -t: -k2 -nr | head -60
```

- [ ] **Step 2: Fix or allowlist**

For each hot file: tokenize chrome, or add a one-line allowlist comment + entry in the allowlist doc:

```md
| Path | Hex | Reason |
| --- | --- | --- |
| src/components/design-system/tokens.js | PHASE_HEX.* | Semantic phase encoding |
| src/lib/ganttTheme.js | GANTT_PHASE_HEX.* | Categorical gantt marks |
```

Calculators: verify-only — if already on self-contained shells with tokens, leave layout; only fix broken contrast.

- [ ] **Step 3: Closing grep gate**

```bash
rg -n "background:\s*['\"]#|color:\s*['\"]#|border(?:Color)?:\s*['\"]#" src/pages src/components --glob '!**/__tests__/**' --glob '!**/design-system/tokens.js' | wc -l
```

Drive toward zero non-allowlisted chrome hits. Document any remainder in the allowlist file with reason.

- [ ] **Step 4: Full verification**

```bash
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm test
npm run build
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/pages src/components docs/superpowers/specs/2026-07-27-dual-theme-hex-allowlist.md
git commit -m "fix: finish dual-theme hex burn-down and allowlist ledger"
```

---

### Task 12: Docs, claims, and Phase 4 closure

**Files:**
- Modify: `AGENT_CLAIMS.md` — retire `opus-command-ui-lock` light-only directive; keep dual-theme maintenance note; release `cursor-dual-theme-dark-0b3b` claim when implementation ends
- Modify: `CLAUDE.md` — replace Iron Forge primary/`--color-primary` paragraph with SteelBuild dual-theme truth (CSS vars, `--accent` gold dark / teal light accents, Barlow/Inter/IBM Plex Mono, command kit `--cmd-*`, radius as shipped)
- Modify: `AGENTS.md` Cursor Cloud / styling bullets if they imply dark-only or light-only
- Modify: `docs/superpowers/specs/2026-06-28-light-command-theme-global-rollout-design.md` — mark Phase 4 superseded by `2026-07-27-dual-theme-dark-completion-design.md`
- Modify: `docs/superpowers/specs/2026-07-27-dual-theme-dark-completion-design.md` — Status → Implemented (or Implementing) as appropriate

- [ ] **Step 1: Update CLAUDE design-system section**

Replace the “Iron Forge Command” bullet list with:

```md
## Design system: SteelBuild dual theme
- Colors: CSS variables only (`var(--bg-*)`, `var(--text-*)`, `var(--accent)`, `var(--cmd-*)`, `var(--sbd-*)`). Never hardcode surface/text/border hex in components.
- Dark: SteelBuild Dark (`data-theme="dark"` + `html.steelbuild-dark`); accent gold `#C89B20` / `#E0B030`.
- Light: `[data-theme="light"]`; command Control Centers use `[data-skin="command"]` with `--cmd-*` (dark remap aliases SteelBuild Dark).
- Fonts: Barlow Condensed (display), Inter (body), IBM Plex Mono (numeric/code).
- Theme preference: `sbp-theme` in localStorage, else `prefers-color-scheme`.
- Never use `<form>` tags. Never use Radix Dialog.
```

(Keep radius guidance aligned with shipped tokens/SBD — do not reintroduce a fake 2px-only rule if the kit uses 8–14px.)

- [ ] **Step 2: Annotate light-rollout Phase 4**

In `2026-06-28-light-command-theme-global-rollout-design.md`:

```md
### Phase 4 — Dark mode
- **Status:** Superseded by `docs/superpowers/specs/2026-07-27-dual-theme-dark-completion-design.md` (implemented via plan `docs/superpowers/plans/2026-07-27-dual-theme-dark-completion.md`).
```

- [ ] **Step 3: Update AGENT_CLAIMS**

Replace the `opus-command-ui-lock` row intent with a historical note in **Recently released**, and add active dual-theme maintenance guidance:

> Command Control Centers use `--cmd-*` under `[data-skin="command"]`. Dark is via token remap — do not wrap command pages in `.sbd-*` chrome or force light in `LayoutRoute`.

Release the `cursor-dual-theme-dark-0b3b` active claim when the session ends.

- [ ] **Step 4: Commit**

```bash
git add AGENT_CLAIMS.md CLAUDE.md AGENTS.md docs/superpowers/specs/2026-06-28-light-command-theme-global-rollout-design.md docs/superpowers/specs/2026-07-27-dual-theme-dark-completion-design.md
git commit -m "docs: close dual-theme Phase 4 and correct theme contributor guidance"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Dual theme including Control Centers | Tasks 3–4 |
| Unset → `prefers-color-scheme`; persist only after explicit choice | Tasks 1–2 |
| Remove LayoutRoute light force | Task 2 |
| Command dark maps to SteelBuild Dark | Task 3 |
| Shared chrome (shell, selects, dashboard reference) | Tasks 4–5 |
| Full-app hex burn-down + allowlist | Tasks 6–11 |
| Docs / owner-lock update | Task 12 |
| Foundation-first then domains | Task order 1→12 |
| No placeholders / TBD | None present |

**Type consistency:** `ThemeMode` / `ThemeSource` / `THEME_STORAGE_KEY` from Task 1 are the names Task 2 imports.
