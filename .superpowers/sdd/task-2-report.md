# Task 2 Report: Shell cutover + hamburger a11y + tablet rail

**Status:** DONE  
**Branch:** `cursor/tablet-pm-kit-design-3d17`

## Summary

Cut the shell over to the viewport-band contract from Task 1:

- phone-only hamburger + drawer via `isPhone`
- tablet+desktop sidebar via `!isPhone`
- `forceRail={isTablet}` passed through the shell
- hamburger button now has accessible `aria-label` / `aria-expanded`
- hamburger touch target is `44x44`
- shell root now stamps `data-viewport={band}`

Because `REFERENCE_CHROME_PAGES` currently includes all registered pages, tablet/desktop routes render the dashboard-reference sidebar path. Task 2 therefore applies `forceRail` to both the default sidebar and the dashboard-reference sidebar so tablet consistently stays in rail/collapsed mode.

## Files Changed

| Action | Path |
|--------|------|
| Modify | `src/Layout.jsx` |
| Modify | `src/components/nav/HamburgerMenu.jsx` |
| Modify | `src/components/nav/SidebarNav.jsx` |
| Modify | `src/__tests__/components/Layout.test.jsx` |

## Implementation

### Layout shell cutover

- `useResponsiveBreakpoint()` now feeds `band`, `isPhone`, and `isTablet` into the shell.
- `useDashboardChrome` uses `isDashboardPage && !isPhone`.
- Phone-only shell branches now key off `isPhone`:
  - mobile drawer mount
  - hamburger render
  - mobile brand render
  - compact project pill
  - compact search button
  - hiding desktop/tablet actions
- Sidebar render now passes `forceRail={isTablet}` in both shell branches.
- Root shell adds:

```jsx
data-viewport={band}
data-mobile-shell={isPhone ? "true" : "false"}
```

### Hamburger accessibility

`HamburgerMenu.jsx` now sets:

```jsx
type="button"
aria-label={open ? "Close navigation" : "Open navigation"}
aria-expanded={open}
style={{ width: 44, height: 44 }}
```

### Sidebar rail forcing

`SidebarNav.jsx` now accepts `forceRail = false`.

Default sidebar behavior:

```js
const railMode = forceRail ? true : (isLightTheme ? false : railModeState);
const width = railMode ? 56 : (isLightTheme ? 208 : 240);
```

When `forceRail`, the rail chevron control is hidden so tablet stays rail even in light theme.

Dashboard-reference sidebar behavior:

- receives `forceRail`
- syncs `collapsed` state from `forceRail`
- hides the expand/collapse footer button when forced

This makes the reference shell collapse into its existing rail class (`.is-collapsed`) for tablet widths.

## TDD Evidence

### RED — failing test before implementation

Command:

```bash
npx vitest run src/__tests__/components/Layout.test.jsx
```

Observed failure:

```text
❯ src/__tests__/components/Layout.test.jsx (4 tests | 2 failed)
  × labels the hamburger when the viewport is phone-width
  × keeps the tablet shell on a forced rail even in light theme

FAIL  labels the hamburger when the viewport is phone-width
Expected the element to have attribute:
  data-viewport="phone"
Received:
  null

FAIL  keeps the tablet shell on a forced rail even in light theme
Expected the element to have attribute:
  data-viewport="tablet"
Received:
  null
```

What RED proved:

1. Layout was not stamping `data-viewport`
2. The tablet shell contract was not yet wired through the new breakpoint API

### GREEN — focused regression tests after implementation

Command:

```bash
npx vitest run src/__tests__/components/Layout.test.jsx src/components/nav/__tests__/useResponsiveBreakpoint.test.ts
```

Output:

```text
Test Files  2 passed (2)
     Tests  7 passed (7)
```

What GREEN covers:

1. phone shell exposes labeled hamburger with `aria-expanded="false"`
2. hamburger touch target is `44px` square
3. shell stamps `data-viewport="phone"` and `data-viewport="tablet"`
4. tablet shell does not render phone hamburger chrome
5. tablet shell collapses the dashboard-reference sidebar into rail mode
6. breakpoint helper boundaries from Task 1 still pass

## Verification

| Check | Result |
|-------|--------|
| Focused vitest | PASS (`7/7`) |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Self-Review

- **Brief adherence:** Implemented the exact requested shell cutover, viewport attribute, hamburger labeling, `aria-expanded`, and 44px target.
- **Tablet rail nuance:** The repository currently routes tablet/desktop pages through dashboard-reference chrome, so `forceRail` had to be honored there too or the layout-level contract would not actually hold.
- **Scope discipline:** No unrelated route, data, or styling-system work added.
- **Regression risk:** Low. Changes are isolated to shell composition and nav behavior, with focused jsdom coverage and clean lint/build verification.

## Concerns

None blocking.

## Review Fix Addendum — `DashboardReferenceSidebar` forceRail state

### Fix notes

- Removed the `useEffect(() => setCollapsed(forceRail), [forceRail])` sync in `DashboardReferenceSidebar`.
- Kept the user-owned `collapsed` state local to desktop interactions.
- Derived `effectiveCollapsed = forceRail || collapsed` for the rendered rail/collapsed class and item visibility.
- Left the footer expand/collapse control hidden whenever `forceRail` is true, matching the default `SidebarNav` contract.
- Added a regression test that collapses the dashboard sidebar on desktop, resizes to tablet rail, then back to desktop and verifies the sidebar is still collapsed.

### Re-run command

```bash
npx vitest run src/__tests__/components/Layout.test.jsx src/components/nav/__tests__/useResponsiveBreakpoint.test.ts
```

### Re-run output

```text
RUN  v4.1.6 /workspace

Test Files  2 passed (2)
     Tests  8 passed (8)
  Start at  01:45:17
  Duration  1.94s (transform 373ms, setup 238ms, import 826ms, tests 625ms, environment 530ms)
```
