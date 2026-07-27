# Tablet PM Layout Kit — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the tablet breakpoint contract, shell cutover (phone hamburger vs tablet/desktop sidebar), and shared tablet layout kit primitives — with tests — so Phases 1–4 can migrate Dashboard → Projects → RFIs → Drawings/Submittals onto them.

**Architecture:** Extend the viewport hook to expose `{ isPhone, isTablet, isDesktop }` with bands `<768` / `768–1023` / `≥1024`. Layout uses phone drawer only below 768; tablet and desktop keep `SidebarNav`, forcing icon rail on tablet (including light/command theme). New kit lives under `src/components/tablet/` + `src/styles/tablet-kit.css`. No domain page migrations in Phase 0.

**Tech Stack:** Vite, React 18, TypeScript (new files `.ts`/`.tsx` only), Vitest + jsdom, existing `useFocusTrap`, CSS variables / Iron Forge tokens.

**Spec:** `docs/superpowers/specs/2026-07-27-tablet-pm-layout-kit-design.md`

## Global Constraints

- New `src/` code is `.ts` / `.tsx` only (`npm run check:no-new-js`)
- No `<form>` tags; no Radix Dialog for new sheets (match existing overlay patterns + `useFocusTrap`)
- CSS variables only — no hardcoded hex in kit
- Border radius 2px for kit chrome (Iron Forge)
- Do not redesign command_ui visuals; layout/density only
- Do not migrate Dashboard/Projects/RFIs/Detailing in this plan (Phases 1–4, separate plans)
- Do not regress Field Today phone capture lane
- Touch targets in kit chrome ≥ 44×44

## File map

| Path | Responsibility |
|---|---|
| `src/components/nav/useResponsiveBreakpoint.ts` | Viewport band hook (`isPhone` / `isTablet` / `isDesktop` + back-compat `isMobile === isPhone`) |
| `src/components/nav/useResponsiveBreakpoint.js` | **Delete** after TS conversion + import updates |
| `src/Layout.jsx` | Consume bands; phone drawer vs sidebar; `data-viewport` attr; hamburger a11y |
| `src/components/nav/HamburgerMenu.jsx` | `aria-label` / `aria-expanded` |
| `src/components/nav/SidebarNav.jsx` | Optional `forceRail` prop for tablet (overrides light-theme expanded lock) |
| `src/styles/tablet-kit.css` | Kit layout tokens + utility classes |
| `src/globals.css` | `@import` tablet-kit.css |
| `src/components/tablet/columnPriority.ts` | Pure column-priority filter helper |
| `src/components/tablet/TabletPage.tsx` | Page chrome wrapper |
| `src/components/tablet/TabletActionBar.tsx` | Sticky action row |
| `src/components/tablet/TabletFilterBar.tsx` | Wrapping filter row + overflow sheet trigger |
| `src/components/tablet/TabletFormSheet.tsx` | Full-height create/edit sheet |
| `src/components/tablet/TabletListDetail.tsx` | Split / stacked list-detail |
| `src/components/tablet/TabletDataTable.tsx` | Priority-aware table wrapper |
| `src/components/tablet/index.ts` | Barrel exports |
| Matching `__tests__/` next to each unit | Vitest coverage |

---

### Task 1: Viewport band hook

**Files:**
- Create: `src/components/nav/useResponsiveBreakpoint.ts`
- Create: `src/components/nav/__tests__/useResponsiveBreakpoint.test.ts`
- Delete: `src/components/nav/useResponsiveBreakpoint.js` (after imports point at `.ts`)
- Modify: any import of `./useResponsiveBreakpoint` or `@/components/nav/useResponsiveBreakpoint` (Layout already relative)

**Interfaces:**
- Consumes: `viewportWidth(fallback?: number): number` from `@/lib/browser`
- Produces:

```ts
export type ViewportBand = "phone" | "tablet" | "desktop";

export const PHONE_MAX = 767;
export const TABLET_MAX = 1023;

export function bandForWidth(width: number): ViewportBand;

export function useResponsiveBreakpoint(): {
  band: ViewportBand;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** @deprecated alias of isPhone — true only below 768 */
  isMobile: boolean;
};
```

- [ ] **Step 1: Write the failing test**

Create `src/components/nav/__tests__/useResponsiveBreakpoint.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { bandForWidth, useResponsiveBreakpoint } from "../useResponsiveBreakpoint";

describe("bandForWidth", () => {
  it("classifies phone / tablet / desktop bands", () => {
    expect(bandForWidth(375)).toBe("phone");
    expect(bandForWidth(767)).toBe("phone");
    expect(bandForWidth(768)).toBe("tablet");
    expect(bandForWidth(1023)).toBe("tablet");
    expect(bandForWidth(1024)).toBe("desktop");
  });
});

describe("useResponsiveBreakpoint", () => {
  beforeEach(() => {
    vi.stubGlobal("innerWidth", 1200);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes desktop flags at 1200px", () => {
    const { result } = renderHook(() => useResponsiveBreakpoint());
    expect(result.current).toMatchObject({
      band: "desktop",
      isPhone: false,
      isTablet: false,
      isDesktop: true,
      isMobile: false,
    });
  });

  it("updates on resize into tablet then phone", () => {
    const { result } = renderHook(() => useResponsiveBreakpoint());
    act(() => {
      vi.stubGlobal("innerWidth", 834);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.band).toBe("tablet");
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isMobile).toBe(false);

    act(() => {
      vi.stubGlobal("innerWidth", 390);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.band).toBe("phone");
    expect(result.current.isMobile).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/nav/__tests__/useResponsiveBreakpoint.test.ts`  
Expected: FAIL (module missing or still returns bare boolean)

- [ ] **Step 3: Implement hook**

`src/components/nav/useResponsiveBreakpoint.ts`:

```ts
import { useState, useEffect } from "react";
import { viewportWidth } from "@/lib/browser";

export type ViewportBand = "phone" | "tablet" | "desktop";

export const PHONE_MAX = 767;
export const TABLET_MAX = 1023;

export function bandForWidth(width: number): ViewportBand {
  if (width <= PHONE_MAX) return "phone";
  if (width <= TABLET_MAX) return "tablet";
  return "desktop";
}

export function useResponsiveBreakpoint() {
  const [band, setBand] = useState<ViewportBand>(() => bandForWidth(viewportWidth()));

  useEffect(() => {
    const handler = () => setBand(bandForWidth(viewportWidth()));
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const isPhone = band === "phone";
  const isTablet = band === "tablet";
  const isDesktop = band === "desktop";
  return {
    band,
    isPhone,
    isTablet,
    isDesktop,
    isMobile: isPhone,
  };
}
```

Update `Layout.jsx` (and any other callers) from `const isMobile = useResponsiveBreakpoint()` to:

```js
const { isPhone, isTablet, isDesktop, isMobile } = useResponsiveBreakpoint();
```

For this task only, keep Layout behavior using `isMobile` as today (still phone-only after cutover in Task 2). Delete the `.js` file once the `.ts` module resolves.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/nav/__tests__/useResponsiveBreakpoint.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/useResponsiveBreakpoint.ts \
  src/components/nav/__tests__/useResponsiveBreakpoint.test.ts \
  src/Layout.jsx
git rm src/components/nav/useResponsiveBreakpoint.js
git commit -m "feat: viewport band hook for phone/tablet/desktop"
```

---

### Task 2: Shell cutover + hamburger a11y + tablet rail

**Files:**
- Modify: `src/Layout.jsx`
- Modify: `src/components/nav/HamburgerMenu.jsx`
- Modify: `src/components/nav/SidebarNav.jsx` (add `forceRail` prop)
- Modify: `src/__tests__/components/Layout.test.jsx` (hamburger label when phone width)

**Interfaces:**
- Consumes: `useResponsiveBreakpoint()` bands from Task 1
- Produces: Layout sets `data-viewport={band}` on app shell; phone-only drawer; `SidebarNav` receives `forceRail={isTablet}`

- [ ] **Step 1: Write / extend failing Layout test**

In `src/__tests__/components/Layout.test.jsx`, add:

```js
it("labels the hamburger when the viewport is phone-width", () => {
  vi.stubGlobal("innerWidth", 390);
  window.dispatchEvent(new Event("resize"));
  renderLayout();
  expect(screen.getByRole("button", { name: /open navigation|close navigation|menu/i })).toBeInTheDocument();
  vi.unstubAllGlobals();
});
```

(Adjust name to match the label you implement in Step 3.)

- [ ] **Step 2: Run test — expect fail** (missing accessible name)

Run: `npx vitest run src/__tests__/components/Layout.test.jsx`

- [ ] **Step 3: Implement shell + a11y**

`HamburgerMenu.jsx` — add props usage:

```jsx
export default function HamburgerMenu({ open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close navigation" : "Open navigation"}
      aria-expanded={open}
      style={{ /* keep existing styles; bump to min 44x44 if currently 40 */ width: 44, height: 44, /* ... */ }}
    >
      {/* existing icon markup */}
    </button>
  );
}
```

`SidebarNav.jsx` — extend props:

```js
export default function SidebarNav({
  currentPageName, onNavigate, visible, variant = "default", forceRail = false,
}) {
  // ...
  const railMode = forceRail ? true : (isLightTheme ? false : railModeState);
  // When forceRail, still show the expand control but toggling can either
  // no-op or clear forceRail locally — preferred: hide expand control when forceRail
  // so tablet stays rail until desktop band.
```

When `forceRail`, hide the collapse/expand chevron (tablet always rail).

`Layout.jsx` key behavior:

```js
const { band, isPhone, isTablet, isDesktop, isMobile } = useResponsiveBreakpoint();
const useDashboardChrome = isDashboardPage && !isPhone;

// shell:
data-viewport={band}
data-mobile-shell={isPhone ? "true" : "false"}

// drawer only on phone:
{isPhone && ( <MobileDrawer ... /> )}

// top bar hamburger only on phone:
{isPhone && <HamburgerMenu ... />}

// sidebar on tablet + desktop:
{!isPhone && (
  <SidebarNav
    ...
    visible
    forceRail={isTablet}
  />
)}
```

Replace other `isMobile` shell branches that mean “phone chrome” with `isPhone`. Keep compact project pill on phone; on tablet use non-compact pill in the top bar (same as desktop left placement patterns already in Layout).

- [ ] **Step 4: Run Layout + breakpoint tests**

Run:  
`npx vitest run src/__tests__/components/Layout.test.jsx src/components/nav/__tests__/useResponsiveBreakpoint.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Layout.jsx src/components/nav/HamburgerMenu.jsx \
  src/components/nav/SidebarNav.jsx src/__tests__/components/Layout.test.jsx
git commit -m "feat: tablet shell rail and phone-only hamburger drawer"
```

---

### Task 3: Kit CSS + column priority helper

**Files:**
- Create: `src/styles/tablet-kit.css`
- Modify: `src/globals.css` (add `@import './styles/tablet-kit.css';` after responsive.css)
- Create: `src/components/tablet/columnPriority.ts`
- Create: `src/components/tablet/__tests__/columnPriority.test.ts`

**Interfaces:**
- Produces:

```ts
export type ColumnPriority = "essential" | "secondary" | "optional";

export type PriorityColumn<T extends string = string> = {
  id: T;
  priority: ColumnPriority;
};

/** Columns visible at the given viewport band. */
export function visibleColumnIds(
  columns: PriorityColumn[],
  band: "phone" | "tablet" | "desktop",
): string[];
```

Rules (lock these in tests):
- `desktop`: all columns
- `tablet`: `essential` + `secondary` (drop `optional`)
- `phone`: `essential` only

- [ ] **Step 1: Failing tests for `visibleColumnIds`**

```ts
import { describe, expect, it } from "vitest";
import { visibleColumnIds } from "../columnPriority";

const cols = [
  { id: "num", priority: "essential" as const },
  { id: "title", priority: "essential" as const },
  { id: "status", priority: "secondary" as const },
  { id: "updated", priority: "optional" as const },
];

describe("visibleColumnIds", () => {
  it("keeps all on desktop", () => {
    expect(visibleColumnIds(cols, "desktop")).toEqual(["num", "title", "status", "updated"]);
  });
  it("drops optional on tablet", () => {
    expect(visibleColumnIds(cols, "tablet")).toEqual(["num", "title", "status"]);
  });
  it("keeps essentials only on phone", () => {
    expect(visibleColumnIds(cols, "phone")).toEqual(["num", "title"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`npx vitest run src/components/tablet/__tests__/columnPriority.test.ts`

- [ ] **Step 3: Implement helper + CSS**

`columnPriority.ts` — implement the rules above.

`tablet-kit.css` — minimal tokens/utilities (no hex):

```css
:root {
  --tablet-touch-min: 44px;
  --tablet-page-pad: 16px;
  --tablet-sheet-z: 1200;
}

.tablet-page { /* padding, min-width 0, flex column */ }
.tablet-action-bar { /* sticky bottom/top flex gap, min-height var(--tablet-touch-min) */ }
.tablet-filter-bar { /* flex wrap, gap, max 2 rows via max-height + overflow hidden companion class */ }
.tablet-form-sheet-overlay { /* fixed inset, z-index, bg */ }
.tablet-form-sheet { /* full height panel, border-radius 2px, sticky footer */ }
.tablet-list-detail { /* grid 1fr / 1fr on tablet landscape via matchMedia class hooks from component */ }
.tablet-data-table-scroll { /* overflow-x auto fallback */ }

[data-viewport="tablet"] .tablet-touch-target {
  min-width: var(--tablet-touch-min);
  min-height: var(--tablet-touch-min);
}
```

Import in `globals.css`.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/styles/tablet-kit.css src/globals.css \
  src/components/tablet/columnPriority.ts \
  src/components/tablet/__tests__/columnPriority.test.ts
git commit -m "feat: tablet kit CSS and column priority helper"
```

---

### Task 4: `TabletPage` + `TabletActionBar`

**Files:**
- Create: `src/components/tablet/TabletPage.tsx`
- Create: `src/components/tablet/TabletActionBar.tsx`
- Create: `src/components/tablet/__tests__/TabletPage.test.tsx`

**Interfaces:**
- Produces:

```tsx
export function TabletPage(props: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): JSX.Element;

export function TabletActionBar(props: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element;
```

- [ ] **Step 1: Failing component test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabletPage } from "../TabletPage";
import { TabletActionBar } from "../TabletActionBar";

describe("TabletPage", () => {
  it("renders title, actions, and children", () => {
    render(
      <TabletPage title="Projects" actions={<button type="button">New</button>}>
        <p>Body</p>
        <TabletActionBar>
          <button type="button">Save</button>
        </TabletActionBar>
      </TabletPage>
    );
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Minimal implementations** using `.tablet-page` / `.tablet-action-bar` classes; `h1` for title; no cards.

- [ ] **Step 4: PASS + commit**

```bash
git add src/components/tablet/TabletPage.tsx src/components/tablet/TabletActionBar.tsx \
  src/components/tablet/__tests__/TabletPage.test.tsx
git commit -m "feat: TabletPage and TabletActionBar primitives"
```

---

### Task 5: `TabletFilterBar`

**Files:**
- Create: `src/components/tablet/TabletFilterBar.tsx`
- Create: `src/components/tablet/__tests__/TabletFilterBar.test.tsx`

**Interfaces:**

```tsx
export function TabletFilterBar(props: {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  /** Rendered inside the overflow sheet when onOverflowOpen fires */
  overflow?: React.ReactNode;
  overflowLabel?: string; // default "Filters"
}): JSX.Element;
```

Behavior for Phase 0: always render search + filters in a wrapping flex row. If `overflow` is provided, show a `type="button"` “Filters” control (`tablet-touch-target`) that toggles a simple inline panel (not a portal yet) with `role="dialog"` + `aria-modal="true"` and `useFocusTrap`. Later phases can restyle; API stays stable.

- [ ] **Step 1: Failing test** — renders search; Opens overflow dialog via Filters button; Escape/close restores.

- [ ] **Step 2: FAIL → implement → PASS → commit**

```bash
git commit -m "feat: TabletFilterBar with overflow filters sheet"
```

---

### Task 6: `TabletFormSheet`

**Files:**
- Create: `src/components/tablet/TabletFormSheet.tsx`
- Create: `src/components/tablet/__tests__/TabletFormSheet.test.tsx`

**Interfaces:**

```tsx
export function TabletFormSheet(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode; // sticky Save/Cancel slot
}): JSX.Element | null;
```

Requirements:
- `null` when `!open`
- Overlay + panel with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- `useFocusTrap(open)`
- Escape calls `onClose`
- No `<form>` element
- Footer sticky with touch-sized controls expected from callers

- [ ] **Step 1: Failing tests** (open/close, dialog role, Escape)

- [ ] **Step 2: Implement → PASS → commit**

```bash
git commit -m "feat: TabletFormSheet full-height dialog panel"
```

---

### Task 7: `TabletListDetail`

**Files:**
- Create: `src/components/tablet/TabletListDetail.tsx`
- Create: `src/components/tablet/__tests__/TabletListDetail.test.tsx`

**Interfaces:**

```tsx
export function TabletListDetail(props: {
  list: React.ReactNode;
  detail: React.ReactNode | null;
  /** When true (portrait / narrow), show detail as sheet over list */
  stack: boolean;
  detailTitle?: string;
  onCloseDetail?: () => void;
}): JSX.Element;
```

Behavior:
- `stack === false`: CSS grid two columns (list | detail); empty detail shows list only spanning.
- `stack === true` && `detail`: list remains; detail rendered via `TabletFormSheet`-like panel or reuse `TabletFormSheet` with `open` for the detail body.
- Prefer reusing `TabletFormSheet` for stacked detail to avoid a second focus-trap implementation.

Callers pass `stack={isPhone || (isTablet && window.matchMedia("(orientation: portrait)").matches)}` in later phases; Phase 0 tests pass `stack` explicitly.

- [ ] **Step 1: Tests for split vs stacked detail**

- [ ] **Step 2: Implement → PASS → commit**

```bash
git commit -m "feat: TabletListDetail split and stacked modes"
```

---

### Task 8: `TabletDataTable` + barrel

**Files:**
- Create: `src/components/tablet/TabletDataTable.tsx`
- Create: `src/components/tablet/__tests__/TabletDataTable.test.tsx`
- Create: `src/components/tablet/index.ts`

**Interfaces:**

```tsx
export type TabletTableColumn<Row> = {
  id: string;
  header: string;
  priority: ColumnPriority;
  cell: (row: Row) => React.ReactNode;
};

export function TabletDataTable<Row extends { id: string }>(props: {
  columns: TabletTableColumn<Row>[];
  rows: Row[];
  band: ViewportBand;
  onRowOpen?: (row: Row) => void;
  emptyLabel?: string;
}): JSX.Element;
```

Behavior:
- Use `visibleColumnIds` to pick columns for `band`
- Render `<table>` inside `.tablet-data-table-scroll`
- Row is a `<tr>` with `onClick` → `onRowOpen`; keyboard: `tr` gets `tabIndex={0}` and Enter/Space opens
- Do not use icon-only row actions in Phase 0

`index.ts` re-exports all kit public APIs + `columnPriority` helpers + types.

- [ ] **Step 1: Failing test** — optional column hidden on tablet band; row activate via click

- [ ] **Step 2: Implement → PASS → commit**

```bash
git commit -m "feat: TabletDataTable and tablet kit barrel export"
```

---

### Task 9: Phase 0 verification

**Files:** none new required

- [ ] **Step 1: Run kit + shell tests**

```bash
npx vitest run \
  src/components/nav/__tests__/useResponsiveBreakpoint.test.ts \
  src/components/tablet \
  src/__tests__/components/Layout.test.jsx
```

Expected: all PASS

- [ ] **Step 2: Lint + no-new-js + typecheck touched paths**

```bash
npm run lint
npm run check:no-new-js
npm run typecheck
```

Expected: clean (or only pre-existing unrelated failures — do not add new)

- [ ] **Step 3: Manual smoke (agent browser or local)** at widths 768, 834, 1024  
  Confirm: no hamburger on tablet; sidebar rail visible; phone still gets hamburger; `data-viewport` attribute present on shell.

- [ ] **Step 4: Update TECH_DEBT one-liner** (optional, same commit) noting Phase 0 kit landed; Phases 1–4 pending — only if `TECH_DEBT.md` already has the a11y/iPad bullet.

- [ ] **Step 5: Final commit + push**

```bash
git commit -m "chore: verify tablet kit Phase 0"
git push -u origin HEAD
```

---

## Spec coverage checklist (Phase 0 only)

| Spec requirement | Task |
|---|---|
| Breakpoint contract 768 / 1024 | Task 1 |
| Replace 900px drawer threshold | Task 2 |
| `isPhone` / `isTablet` / `isDesktop` | Task 1 |
| Tablet collapsible/rail nav (not hamburger) | Task 2 (`forceRail`) |
| Phone keeps hamburger drawer | Task 2 |
| Hamburger accessible name | Task 2 |
| Kit primitives Page / Filter / ListDetail / DataTable / FormSheet / ActionBar | Tasks 4–8 |
| Column priority helper | Task 3 |
| CSS tokens / tablet-kit.css | Task 3 |
| Touch 44px floor in kit | Tasks 2–3 (CSS + hamburger) |
| No domain migrations | — deferred Phases 1–4 |
| Unit/component tests | Tasks 1–8 |
| Smoke 768 / 834 / 1024 | Task 9 |

## Out of scope reminders

- Dashboard / Projects / RFIs / Detailing adoption → new plans after Phase 0 merges
- Phone-first kit application below 768
- Drawing Viewer / Gantt / Piece Register
- axe CI gate
