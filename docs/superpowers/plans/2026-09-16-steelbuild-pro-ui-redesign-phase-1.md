# SteelBuild Pro UI Redesign Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the new SteelBuild-Pro brand system, app shell, navigation, shared command UI primitives, and reference Dashboard/Command Center surfaces without changing stable business logic.

**Architecture:** This phase is deliberately limited to the system foundation and two reference surfaces. It updates theme tokens, branding, navigation composition, command UI primitives, and the presentation/derivation contracts for Dashboard and Command Center while preserving Supabase queries, route identities, RLS, workflow engines, canonical piece logic, schedule semantics, and existing domain calculations. Later workflow waves (Detailing/RFI/Production, Logistics/Field, Commercial, Reports/Admin) get their own plans after this phase is green.

**Tech Stack:** Vite, React 18, TypeScript/TSX for new source files, existing JSX where already present, TanStack Query, Supabase, Vitest, Testing Library, CSS custom properties, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-16-steelbuild-pro-ui-redesign-design.md`

## Global Constraints

- Dark and light themes receive equal visual emphasis.
- Brand orange is `#FF5A1F`; orange is a brand/action color, not a replacement for semantic status colors.
- Components consume CSS variables; do not hardcode theme surface/text/border colors in React components.
- Preserve high-contrast, motion, font-scale, table-density, and user-preference behavior.
- Preserve existing routes and deep links unless a route change is separately approved.
- Do not change Supabase schema, RLS, organization boundaries, official number sequencing, schedule status semantics, release-gate rules, or canonical piece-selection logic in this phase.
- New source files under `src/` must be `.ts`/`.tsx`; editing existing `.js`/`.jsx` files is allowed.
- Do not use `<form>` tags or Radix Dialog.
- Unknown/absent data remains unknown; do not turn missing evidence into affirmative claims.
- Desktop remains the primary dense PM workspace; tablet/phone remain responsive and accessible.
- Run all CI gates before completion: `lint`, `typecheck`, `typecheck:js`, `typecheck:strict`, `typecheck:noimplicitany`, `check:no-new-js`, `test`, `build`.

---

## Scope decomposition

The approved spec spans several independently testable subsystems. Do **not** implement the full spec as one mega-change. Use this sequence:

1. **Phase 1 — this plan:** brand foundation, command kit, app shell/navigation, Dashboard, Command Center.
2. **Phase 2:** RFIs + Detailing/Submittals + Work Packages + Piece Register + Fab Release.
3. **Phase 3:** Production Status + Procurement + Deliveries + Schedule + Field.
4. **Phase 4:** Cost + Change Orders + Backcharges + SOV + Pay Applications.
5. **Phase 5:** Portfolio + Reports + Documents + Administration + Utilities + final polish.

Phase 2 planning begins only after Phase 1 passes the complete CI gate and visual review.

## File map

### Brand/theme foundation
- Modify: `src/styles/tokens.css` — canonical dark/light/semantic/brand token values.
- Modify: `src/styles/command.css` — command-skin consumption of canonical tokens; geometry, tables, buttons, panels.
- Modify: `src/components/nav/BrandLogo.jsx` — app-ready flat SteelBuild-Pro logo variants while retaining a backwards-compatible default export.
- Create: `src/components/nav/__tests__/BrandLogo.test.tsx` — variant and accessibility contract.
- Create: `src/styles/__tests__/steelbuildBrandTokens.test.ts` — token-presence regression test.

### Shared command UI
- Create: `src/components/command/PageHeader.tsx` — compact operational page header replacing photo-heavy hero on migrated pages.
- Create: `src/components/command/OperationalSummary.tsx` — dense metric strip for project/control pages.
- Create: `src/components/command/AttentionQueue.tsx` — standardized ISSUE / DEADLINE / RISK / OWNER / NEXT ACTION queue.
- Create: `src/components/command/QuickAccess.tsx` — compact module shortcut row.
- Modify: `src/components/command/index.ts` — exports.
- Modify: `src/components/command/DataTable.tsx` — optional sticky-identifier and row-tone hooks, without changing default behavior.
- Create: `src/components/command/__tests__/referencePrimitives.test.tsx` — semantic/accessibility contract.

### Navigation/app shell
- Modify: `src/config/moduleRegistry.js` — visible seven-group information architecture while preserving route coverage and native hiding.
- Create: `src/config/__tests__/moduleRegistry.structure.test.ts` — group order and route reachability.
- Modify: `src/components/nav/SidebarNav.jsx` — brand treatment, grouped hierarchy, utility separation, equal dark/light behavior.
- Modify: `src/components/nav/MobileDrawer.jsx` — same hierarchy for phone.
- Create: `src/components/nav/ProjectContextBar.tsx` — active project, project number preference, global controls slot.
- Create: `src/components/nav/__tests__/ProjectContextBar.test.tsx` — rendering and unknown-data behavior.
- Modify: `src/Layout.jsx` — single shell composition using SidebarNav + ProjectContextBar.
- Update existing nav tests under `src/components/nav/__tests__/` where assumptions about group labels/layout change.

### Dashboard reference surface
- Modify: `src/pages/dashboardCC/dashboardControlCenter.derive.ts` — add typed attention queue and four operational bands using already-loaded evidence.
- Modify: `src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts` — derivation tests.
- Modify: `src/pages/dashboardCC/DashboardControlCenter.tsx` — migrate to PageHeader/OperationalSummary/AttentionQueue/QuickAccess; retain PieceControlDashboardPanel.
- Create: `src/pages/dashboardCC/__tests__/DashboardControlCenter.test.tsx` — presentation contract.

### Command Center reference surface
- Modify: `src/pages/commandCenter/commandCenterControlCenter.derive.ts` — derive NOW / 48 HOURS / 10 DAYS horizon groups from existing ActionItem data.
- Modify: `src/pages/commandCenter/__tests__/commandCenterControlCenter.derive.test.ts` — horizon classification/order tests.
- Modify: `src/pages/commandCenter/CommandCenterControlCenter.tsx` — migrate from three generic panels to horizon layout plus queues; keep page-owned drawers/handlers unchanged.
- Create: `src/pages/commandCenter/__tests__/CommandCenterControlCenter.test.tsx` — presentation contract.

---

### Task 1: Establish the SteelBuild-Pro brand token contract

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/command.css`
- Create: `src/styles/__tests__/steelbuildBrandTokens.test.ts`

**Interfaces:**
- Produces CSS variables consumed by every later task:
  - `--brand-orange`
  - `--brand-orange-hover`
  - `--brand-orange-muted`
  - `--brand-orange-border`
  - canonical `--bg-*`, `--text-*`, `--border-*`, `--accent*`
- `--accent` resolves to SteelBuild orange for the default brand theme.
- Existing semantic variables (`--status-success`, `--status-warning`, `--status-error`, `--status-info`) remain semantically independent.

- [ ] **Step 1: Write the token regression test**

Create `src/styles/__tests__/steelbuildBrandTokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

describe("SteelBuild brand tokens", () => {
  it("defines the approved orange brand contract", () => {
    expect(css).toContain("--brand-orange:              #FF5A1F");
    expect(css).toContain("--accent:                   var(--brand-orange)");
  });

  it("keeps semantic success/error colors separate from the brand accent", () => {
    expect(css).toContain("--status-success:");
    expect(css).toContain("--status-error:");
    expect(css).not.toContain("--status-error:             #FF5A1F");
  });

  it("contains explicit dark and light theme surface contracts", () => {
    expect(css).toContain("[data-theme=\"dark\"]");
    expect(css).toContain("[data-theme=\"light\"]");
    expect(css).toContain("#0C0F12");
    expect(css).toContain("#F2F4F5");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx vitest run src/styles/__tests__/steelbuildBrandTokens.test.ts
```

Expected: FAIL because the approved `--brand-orange` contract and new palette are not present.

- [ ] **Step 3: Implement the token remap**

In `src/styles/tokens.css`, add the brand tokens near the root customization section and remap both themes. Use these exact core values:

```css
:root {
  --brand-orange:              #FF5A1F;
  --brand-orange-hover:        #E94C14;
  --brand-orange-muted:        rgba(255, 90, 31, 0.11);
  --brand-orange-border:       rgba(255, 90, 31, 0.38);
}

:root,
[data-theme="dark"] {
  --bg-page:                   #0C0F12;
  --bg-base:                   #0C0F12;
  --bg-sidebar:                #101418;
  --bg-surface:                #171C21;
  --bg-surface-low:            #12171B;
  --bg-surface-mid:            #1E252B;
  --bg-surface-high:           #273039;
  --border-default:            #303942;
  --border-strong:             #46515B;
  --text-primary:              #F2F4F5;
  --text-secondary:            #A7B0B8;
  --text-muted:                #7D8892;
  --accent:                    var(--brand-orange);
  --accent-light:              #FF7445;
  --accent-hover:              var(--brand-orange-hover);
  --accent-muted:              var(--brand-orange-muted);
  --accent-border:             var(--brand-orange-border);
  --on-accent:                 #15100D;
}

[data-theme="light"] {
  --bg-page:                   #F2F4F5;
  --bg-base:                   #F2F4F5;
  --bg-sidebar:                #FFFFFF;
  --bg-surface:                #FFFFFF;
  --bg-surface-low:            #F7F8F9;
  --bg-surface-mid:            #E9EDF0;
  --bg-surface-high:           #DCE1E5;
  --border-default:            #CCD2D7;
  --border-strong:             #AEB7BE;
  --text-primary:              #181C20;
  --text-secondary:            #606A73;
  --text-muted:                #78828B;
  --accent:                    var(--brand-orange);
  --accent-light:              #FF7445;
  --accent-hover:              var(--brand-orange-hover);
  --accent-muted:              rgba(255, 90, 31, 0.08);
  --accent-border:             rgba(255, 90, 31, 0.30);
  --on-accent:                 #15100D;
}
```

Do not delete high-contrast overrides; update comments and aliases that still describe gold as the default. Keep user-selectable alternate accents if Settings still exposes them, but make the SteelBuild default orange.

In `src/styles/command.css`, replace `--cmd-gold`/gold semantics with a compatibility alias backed by the brand token so existing pages keep working during migration:

```css
[data-skin="command"] {
  --cmd-accent: var(--accent);
  --cmd-accent-muted: var(--accent-muted);
  --cmd-accent-border: var(--accent-border);
  --cmd-on-accent: var(--on-accent);
  --cmd-gold: var(--cmd-accent); /* temporary compatibility alias */
  --cmd-on-gold: var(--cmd-on-accent); /* temporary compatibility alias */
}
```

- [ ] **Step 4: Run the token test**

```bash
npx vitest run src/styles/__tests__/steelbuildBrandTokens.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run a focused build check**

```bash
npm run typecheck && npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css src/styles/command.css src/styles/__tests__/steelbuildBrandTokens.test.ts
git commit -m "ui: establish SteelBuild orange dual-theme tokens"
```

---

### Task 2: Replace the old gold/chrome brand mark with app-ready SteelBuild-Pro variants

**Files:**
- Modify: `src/components/nav/BrandLogo.jsx`
- Create: `src/components/nav/__tests__/BrandLogo.test.tsx`

**Interfaces:**
- Preserve `BrandLogo` default export.
- Extend props with `variant?: "full" | "mark"`, default `"full"`.
- Preserve `height`, `className`, `style`, `title`, and `plate` for backwards compatibility.
- Full variant renders `STEELBUILD-PRO`; mark variant renders the SB structural emblem only.

- [ ] **Step 1: Write the failing rendering contract**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "../BrandLogo";

describe("BrandLogo", () => {
  it("renders the full SteelBuild-Pro identity by default", () => {
    render(<BrandLogo height={40} />);
    expect(screen.getByRole("img", { name: "SteelBuild Pro" })).toHaveAttribute("data-brand-variant", "full");
    expect(screen.getByText("STEELBUILD-PRO")).toBeTruthy();
  });

  it("renders an SB-only mark for rail navigation", () => {
    render(<BrandLogo variant="mark" height={32} title="SteelBuild Pro mark" />);
    expect(screen.getByRole("img", { name: "SteelBuild Pro mark" })).toHaveAttribute("data-brand-variant", "mark");
    expect(screen.queryByText("STEELBUILD-PRO")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npx vitest run src/components/nav/__tests__/BrandLogo.test.tsx
```

Expected: FAIL because `variant` and `data-brand-variant` do not exist.

- [ ] **Step 3: Refactor the inline SVG to the approved flat identity**

Keep the logo as inline SVG so no binary asset dependency is introduced. Use CSS-variable-compatible orange and neutral fills, a simplified SB beam/column emblem, and a flat wordmark. The implementation must include this public contract:

```jsx
export function BrandLogo({
  height = 40,
  className,
  style,
  title = "SteelBuild Pro",
  plate = false,
  variant = "full",
}) {
  const isMark = variant === "mark";
  const width = isMark ? height : height * 4.15;

  return (
    <svg
      role="img"
      aria-label={title}
      data-brand-variant={variant}
      width={width}
      height={height}
      viewBox={isMark ? "0 0 96 96" : "0 0 398 96"}
      className={className}
      style={style}
    >
      {/* SB beam/column mark uses currentColor + #FF5A1F accent. */}
      {/* Full variant additionally renders STEELBUILD-PRO. */}
    </svg>
  );
}
```

Do not preserve chrome gradients, glow filters, gold accent points, or the diamond plate presentation in the application mark.

- [ ] **Step 4: Run the logo test**

```bash
npx vitest run src/components/nav/__tests__/BrandLogo.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/BrandLogo.jsx src/components/nav/__tests__/BrandLogo.test.tsx
git commit -m "ui: replace SteelBuild brand mark"
```

---

### Task 3: Add the reference command primitives for dense project-control pages

**Files:**
- Create: `src/components/command/PageHeader.tsx`
- Create: `src/components/command/OperationalSummary.tsx`
- Create: `src/components/command/AttentionQueue.tsx`
- Create: `src/components/command/QuickAccess.tsx`
- Modify: `src/components/command/index.ts`
- Modify: `src/styles/command.css`
- Create: `src/components/command/__tests__/referencePrimitives.test.tsx`

**Interfaces:**

```ts
export type CommandTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface PageHeaderMeta {
  label: string;
  value: ReactNode;
}

export interface OperationalMetric {
  id: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: CommandTone;
}

export interface AttentionQueueItem {
  id: string;
  issue: string;
  deadline: string | null;
  risk: string;
  owner: string | null;
  nextAction: string;
  tone: CommandTone;
  onOpen?: () => void;
}
```

- [ ] **Step 1: Write a failing primitive contract test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttentionQueue, OperationalSummary, PageHeader } from "@/components/command";

describe("reference command primitives", () => {
  it("renders page identity and compact metadata without requiring a hero photo", () => {
    render(<PageHeader title="Dashboard" eyebrow="BIMC ED Expansion / Command" meta={[{ label: "Phase", value: "Fabrication" }]} />);
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Fabrication")).toBeTruthy();
  });

  it("renders dense metrics and an operational attention table", () => {
    render(<>
      <OperationalSummary metrics={[{ id: "rfi", label: "Open RFIs", value: 4, detail: "1 overdue", tone: "danger" }]} />
      <AttentionQueue items={[{ id: "1", issue: "RFI 018", deadline: "Sep 18", risk: "Blocks WP-04", owner: "GC", nextAction: "Obtain response", tone: "danger" }]} />
    </>);
    expect(screen.getByText("Open RFIs")).toBeTruthy();
    expect(screen.getByText("NEXT ACTION")).toBeTruthy();
    expect(screen.getByText("Obtain response")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npx vitest run src/components/command/__tests__/referencePrimitives.test.tsx
```

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Implement `PageHeader`**

Use semantic markup and no background image. Structure:

```tsx
<section className="cmd-page-header">
  <div className="cmd-page-header__identity">
    {eyebrow ? <div className="cmd-page-header__eyebrow">{eyebrow}</div> : null}
    <h1 className="cmd-page-header__title">{title}</h1>
    {subtitle ? <p className="cmd-page-header__subtitle">{subtitle}</p> : null}
  </div>
  <dl className="cmd-page-header__meta">...</dl>
  {actions ? <div className="cmd-page-header__actions">{actions}</div> : null}
</section>
```

- [ ] **Step 4: Implement `OperationalSummary`, `AttentionQueue`, and `QuickAccess`**

`OperationalSummary` is a compact grid, not card-heavy KPI blocks. `AttentionQueue` uses a semantic table on desktop and CSS grid rows at narrow widths. `QuickAccess` accepts `{ id, label, onOpen, icon? }[]` and renders a restrained shortcut row.

- [ ] **Step 5: Add command CSS**

Add selectors using only `--cmd-*` and shared theme tokens. Required geometry:

```css
[data-skin="command"] .cmd-page-header { border-bottom: 1px solid var(--cmd-border); padding: 14px 0 16px; }
[data-skin="command"] .cmd-operational-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); border: 1px solid var(--cmd-border); border-radius: 8px; overflow: hidden; }
[data-skin="command"] .cmd-operational-summary__metric { padding: 12px 14px; border-right: 1px solid var(--cmd-border); background: var(--cmd-surface); }
[data-skin="command"] .cmd-attention { border: 1px solid var(--cmd-border); border-radius: 8px; overflow: hidden; background: var(--cmd-surface); }
[data-skin="command"] .cmd-quick-access { display: flex; flex-wrap: wrap; gap: 6px; }
```

- [ ] **Step 6: Export the new primitives**

Append to `src/components/command/index.ts`:

```ts
export { PageHeader } from "./PageHeader";
export type { PageHeaderMeta } from "./PageHeader";
export { OperationalSummary } from "./OperationalSummary";
export type { OperationalMetric } from "./OperationalSummary";
export { AttentionQueue } from "./AttentionQueue";
export type { AttentionQueueItem } from "./AttentionQueue";
export { QuickAccess } from "./QuickAccess";
```

- [ ] **Step 7: Run focused tests**

```bash
npx vitest run src/components/command/__tests__/referencePrimitives.test.tsx src/components/command/__tests__/DataTable.virtualize.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/command src/styles/command.css
git commit -m "ui: add SteelBuild operational command primitives"
```

---

### Task 4: Reorganize navigation into the approved SteelBuild operating hierarchy

**Files:**
- Modify: `src/config/moduleRegistry.js`
- Create: `src/config/__tests__/moduleRegistry.structure.test.ts`
- Update: `src/config/__tests__/moduleRegistry.native.test.js`
- Update: `src/config/__tests__/launcherConfig.test.js`

**Interfaces:**
- `SIDEBAR_GROUPS` remains the sidebar source of truth.
- `NAV_GROUPS` remains the modules-menu source.
- `PRIMARY_TABS` continues mapping every routed page to a primary area.
- Visible top-level operational labels become `COMMAND`, `PROJECTS`, `DETAILING`, `PRODUCTION`, `FIELD`, `COMMERCIAL`, `REPORTS`; administration/tools remain separate utility groups.

- [ ] **Step 1: Write the structural test**

```ts
import { describe, expect, it } from "vitest";
import { PRIMARY_TABS, SIDEBAR_GROUPS } from "@/config/moduleRegistry";

const labels = SIDEBAR_GROUPS.map((group) => group.label);

it("uses the approved operating hierarchy", () => {
  expect(labels.slice(0, 7)).toEqual([
    "COMMAND", "PROJECTS", "DETAILING", "PRODUCTION", "FIELD", "COMMERCIAL", "REPORTS",
  ]);
});

it("keeps core project routes reachable", () => {
  const pages = new Set(SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.page)));
  ["Dashboard", "CommandCenter", "RFIs", "DrawingSubmittalHub", "WorkPackages", "PieceRegister", "Deliveries", "FieldHub", "CostHub", "ReportsHub"].forEach((page) => {
    expect(pages.has(page)).toBe(true);
  });
});

it("keeps every primary tab non-empty", () => {
  expect(PRIMARY_TABS.every((tab) => tab.pages.length > 0)).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npx vitest run src/config/__tests__/moduleRegistry.structure.test.ts
```

Expected: FAIL because the current registry uses the older grouping.

- [ ] **Step 3: Rewrite the visible grouping without renaming routes**

Use this grouping policy:

```js
COMMAND: [Dashboard, CommandCenter, AlertsCenter]
PROJECTS: [ProjectsHub, ScopeExclusions, Contacts, ProjectMembers]
DETAILING: [DrawingSubmittalHub, RFIs, Documents]
PRODUCTION: [WorkPackages, PieceRegister, FabRelease, ProductionStatus, Procurement, Deliveries, RiskHub, ResourceHub]
FIELD: [FieldToday, FieldHub, DailyLogs, Inspections, Safety, QualityControl, Punchlist]
COMMERCIAL: [CostHub, ChangeOrders, SOV, PayApplications, Backcharges, Expenses]
REPORTS: [PortfolioHub, ReportsHub, JobStatusReport, Activity]
ADMINISTRATION: [OrgMembers, Billing, Vendors, Settings]
TOOLS: [CalculatorsHub, Notes]
```

Pages omitted from the compact sidebar remain reachable through local hubs/modules menu if they are currently routed; do not delete route registrations.

- [ ] **Step 4: Update native and launcher tests**

Preserve the rule that `Billing` is hidden on native platforms. Update expected group labels only; do not weaken reachability assertions.

- [ ] **Step 5: Run navigation tests**

```bash
npx vitest run src/config/__tests__/moduleRegistry.structure.test.ts src/config/__tests__/moduleRegistry.native.test.js src/config/__tests__/launcherConfig.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config/moduleRegistry.js src/config/__tests__
git commit -m "ui: reorganize SteelBuild navigation hierarchy"
```

---

### Task 5: Recompose the application shell around a permanent project context bar

**Files:**
- Create: `src/components/nav/ProjectContextBar.tsx`
- Create: `src/components/nav/__tests__/ProjectContextBar.test.tsx`
- Modify: `src/components/nav/SidebarNav.jsx`
- Modify: `src/components/nav/MobileDrawer.jsx`
- Modify: `src/Layout.jsx`
- Update: `src/components/nav/__tests__/SidebarNav.preferences.test.tsx`
- Update: `src/components/nav/__tests__/MobileDrawer.keyboard.test.tsx`

**Interfaces:**

```ts
export interface ProjectContextBarProps {
  project: { name?: string | null; project_number?: string | null; status?: string | null } | null;
  showProjectNumber: boolean;
  onSearch: () => void;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}
```

- [ ] **Step 1: Write the failing ProjectContextBar test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProjectContextBar from "../ProjectContextBar";

it("shows project identity without inventing missing metadata", () => {
  render(<ProjectContextBar project={{ name: "BIMC ED Expansion", project_number: "26179" }} showProjectNumber onSearch={vi.fn()} />);
  expect(screen.getByText("BIMC ED Expansion")).toBeTruthy();
  expect(screen.getByText("26179")).toBeTruthy();
  expect(screen.queryByText("Unknown Phase")).toBeNull();
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npx vitest run src/components/nav/__tests__/ProjectContextBar.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement ProjectContextBar**

Render active project identity at left, optional project number/status only when present, and slots for the existing search/theme/high-contrast/bell/user controls. Keep project switching through the existing `ProjectPillDropdown`; do not duplicate data fetching.

- [ ] **Step 4: Update SidebarNav brand behavior**

Expanded mode uses `<BrandLogo variant="full" />`; rail mode uses `<BrandLogo variant="mark" />`. Remove theme-specific logic that expands every group only in light mode; collapse/rail behavior should be equivalent in light and dark.

- [ ] **Step 5: Recompose Layout**

Replace the dashboard-only topbar divergence with one consistent shell composition:

```jsx
<div className="app-body">
  <SidebarNav ... />
  <div className="app-workspace">
    <ProjectContextBar
      project={ctxActiveProject}
      showProjectNumber={userPrefs.show_project_numbers}
      onSearch={() => setSearchOpen(true)}
      leftSlot={<ProjectPillDropdown align="left" />}
      rightSlot={/* theme, contrast, bell, user controls */}
    />
    <main id="main-content">{children}</main>
  </div>
</div>
```

Preserve mobile drawer, global search modal, toast, project error banner, keyboard shortcuts, focus management, document-title behavior, density restore, and user preference hydration.

- [ ] **Step 6: Run nav/shell tests**

```bash
npx vitest run src/components/nav/__tests__/ProjectContextBar.test.tsx src/components/nav/__tests__/SidebarNav.preferences.test.tsx src/components/nav/__tests__/MobileDrawer.keyboard.test.tsx src/components/nav/__tests__/ProjectPillDropdown.keyboard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/Layout.jsx src/components/nav
git commit -m "ui: rebuild SteelBuild app shell"
```

---

### Task 6: Add typed Dashboard attention and operational-band derivations

**Files:**
- Modify: `src/pages/dashboardCC/dashboardControlCenter.derive.ts`
- Modify: `src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts`

**Interfaces:**

Add these output types without removing existing fields used elsewhere:

```ts
export type DashboardAttentionDomain = "approval" | "production" | "field" | "commercial";

export interface DashboardAttentionItem {
  id: string;
  domain: DashboardAttentionDomain;
  issue: string;
  deadline: string | null;
  risk: string;
  owner: string | null;
  nextAction: string;
  tone: DashTone;
  target: string | null;
}

export interface DashboardOperationalBand {
  id: DashboardAttentionDomain;
  label: string;
  metric: string;
  tone: DashTone;
  items: DashboardAttentionItem[];
}
```

Extend `DashboardSummary` with:

```ts
attention: DashboardAttentionItem[];
operationalBands: DashboardOperationalBand[];
```

- [ ] **Step 1: Add failing derivation tests**

Add cases that prove:

```ts
it("surfaces an overdue RFI as approval attention with owner and next action", () => {
  const summary = buildDashboardSummary({
    project: { id: "p1", name: "Test" },
    todayIso: "2026-09-16",
    rfis: [{ id: "r1", rfi_number: "018", title: "Brace connection", status: "Open", date_required: "2026-09-15", ball_in_court: "GC" }],
  });
  expect(summary.attention[0]).toMatchObject({ domain: "approval", owner: "GC", tone: "danger" });
});

it("does not claim schedule failure when schedule evidence is unavailable", () => {
  const summary = buildDashboardSummary({ project: { id: "p1" }, scheduleEvidenceLoaded: false });
  expect(summary.operationalBands.find((band) => band.id === "production")?.items.some((item) => item.risk.includes("schedule failure"))).toBe(false);
});
```

- [ ] **Step 2: Run the derivation test and verify failure**

```bash
npx vitest run src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts
```

Expected: FAIL because `attention` and `operationalBands` do not exist.

- [ ] **Step 3: Implement attention derivation using loaded evidence only**

Reuse existing counts/helpers. Do not duplicate schedule or cost formulas. Rules for Phase 1:

- overdue/open RFIs -> `approval` attention;
- pending/overdue submittals -> `approval` attention;
- work packages on hold -> `production` attention;
- delayed/past-due deliveries -> `production` or `field` attention depending on existing delivery status/date evidence;
- open punchlist items -> `field` attention;
- pending COs older than the existing age threshold -> `commercial` attention;
- missing evidence produces no affirmative failure item.

Sort by tone severity (`danger`, `warn`, `info`, `neutral`) then nearest known deadline. Limit the top Dashboard attention queue to 8 items but keep full band items available.

- [ ] **Step 4: Build the four operational bands**

Always return exactly these labels:

```ts
[
  "Approvals & Engineering",
  "Fabrication & Logistics",
  "Field Readiness",
  "Commercial Exposure",
]
```

Metric strings must be factual counts/amounts from existing data, not synthetic scores.

- [ ] **Step 5: Run the derivation test**

```bash
npx vitest run src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboardCC/dashboardControlCenter.derive.ts src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts
git commit -m "ui: derive Dashboard operational attention"
```

---

### Task 7: Rebuild the Dashboard presentation as the reference SteelBuild project surface

**Files:**
- Modify: `src/pages/dashboardCC/DashboardControlCenter.tsx`
- Create: `src/pages/dashboardCC/__tests__/DashboardControlCenter.test.tsx`

**Interfaces:**
- Consume `DashboardSummary.attention` and `.operationalBands` from Task 6.
- Keep `PieceControlDashboardPanel` exactly as the canonical piece-control embed.
- Keep `onNavigate` contract unchanged.
- Demote module navigation from photo tiles to `QuickAccess`.

- [ ] **Step 1: Write the failing presentation test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardControlCenter from "../DashboardControlCenter";

it("renders management attention and the four operational bands", () => {
  render(<DashboardControlCenter project={{ id: "p1", name: "BIMC ED Expansion" }} rfis={[]} onNavigate={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
  expect(screen.getByText("Needs Attention")).toBeTruthy();
  expect(screen.getByText("Approvals & Engineering")).toBeTruthy();
  expect(screen.getByText("Fabrication & Logistics")).toBeTruthy();
  expect(screen.getByText("Field Readiness")).toBeTruthy();
  expect(screen.getByText("Commercial Exposure")).toBeTruthy();
});
```

Mock `PieceControlDashboardPanel` if its repository hooks make the unit test unnecessarily broad.

- [ ] **Step 2: Run the test and verify it fails**

```bash
npx vitest run src/pages/dashboardCC/__tests__/DashboardControlCenter.test.tsx
```

Expected: FAIL because the old hero/module-tile layout is still rendered.

- [ ] **Step 3: Replace PageHero/KpiStrip-first layout**

Use:

```tsx
<PageHeader ... />
<OperationalSummary metrics={...} />
<section aria-labelledby="needs-attention-heading">
  <h2 id="needs-attention-heading">Needs Attention</h2>
  <AttentionQueue items={...} />
</section>
<PieceControlDashboardPanel ... />
<OperationalBandGrid ... />
<QuickAccess ... />
```

`OperationalBandGrid` can be local to `DashboardControlCenter.tsx` in Phase 1 if it is not yet reused elsewhere; do not create another shared abstraction prematurely.

- [ ] **Step 4: Remove the photo launcher dominance**

Delete `DashModuleTile`/`ModuleTileGrid` and `photoFor("Dashboard")` use from this component. Map the existing `s.modules` to compact QuickAccess items so feature reachability is preserved.

- [ ] **Step 5: Run Dashboard tests**

```bash
npx vitest run src/pages/dashboardCC/__tests__/DashboardControlCenter.test.tsx src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboardCC
git commit -m "ui: rebuild SteelBuild project Dashboard"
```

---

### Task 8: Convert Command Center to NOW / 48 HOURS / 10 DAYS tactical horizons

**Files:**
- Modify: `src/pages/commandCenter/commandCenterControlCenter.derive.ts`
- Modify: `src/pages/commandCenter/__tests__/commandCenterControlCenter.derive.test.ts`
- Modify: `src/pages/commandCenter/CommandCenterControlCenter.tsx`
- Create: `src/pages/commandCenter/__tests__/CommandCenterControlCenter.test.tsx`

**Interfaces:**

Add:

```ts
export type CommandHorizonKey = "now" | "48h" | "10d";

export interface CommandHorizon {
  key: CommandHorizonKey;
  label: "NOW" | "48 HOURS" | "10 DAYS";
  items: ActionItem[];
}
```

Extend `CommandCenterSummary` with `horizons: CommandHorizon[]` while retaining existing `actionItems`, KPI data, and existing fields until all consumers are migrated.

- [ ] **Step 1: Add failing horizon classification tests**

```ts
it("classifies overdue work into NOW", () => {
  const summary = buildCommandCenterSummary(makeSources({
    rfis: [{ id: "r1", rfi_number: "018", status: "Open", date_required: "2020-01-01" }],
  }));
  expect(summary.horizons.find((h) => h.key === "now")?.items.map((item) => item.id)).toContain("r1");
});

it("returns all three horizons in fixed order", () => {
  const summary = buildCommandCenterSummary(makeSources());
  expect(summary.horizons.map((h) => h.key)).toEqual(["now", "48h", "10d"]);
});
```

Use the test file's existing date-control pattern rather than introducing real-time flakiness.

- [ ] **Step 2: Run the derivation test and verify it fails**

```bash
npx vitest run src/pages/commandCenter/__tests__/commandCenterControlCenter.derive.test.ts
```

Expected: FAIL because `horizons` does not exist.

- [ ] **Step 3: Implement horizon classification**

Use existing `ActionItem` fields:

- `NOW`: overdue, blocking, due today, delayed delivery, on-hold WP.
- `48 HOURS`: known due date 1–2 days away and not already in NOW.
- `10 DAYS`: known due date 3–10 days away and not already classified.
- Items with no reliable date stay in the full action-items table/queues but are not fabricated into a horizon.

Do not use `displayPct` or invent schedule completion. Preserve current local-calendar-day conventions already used in the derive file.

- [ ] **Step 4: Write the failing presentation test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CommandCenterControlCenter from "../CommandCenterControlCenter";

it("renders the three tactical horizons", () => {
  render(<CommandCenterControlCenter
    sources={{ rfis: [], submittals: [], changeOrders: [], deliveries: [], workPackages: [], projects: [], scheduleTasks: [] }}
    search=""
    onSearch={vi.fn()}
    typeFilter="All"
    onTypeChange={vi.fn()}
    onOpenItem={vi.fn()}
    onForwardLook={vi.fn()}
  />);
  expect(screen.getByText("NOW")).toBeTruthy();
  expect(screen.getByText("48 HOURS")).toBeTruthy();
  expect(screen.getByText("10 DAYS")).toBeTruthy();
});
```

- [ ] **Step 5: Rebuild the Command Center presentation**

Use `PageHeader`, an `OperationalSummary`, and a three-column horizon region. Below it, keep the existing filtered `DataTable` so users can still search/filter all action items. Preserve `onOpenItem` and `onForwardLook` handlers exactly.

The top of the page should conceptually render:

```tsx
<PageHeader title="Command Center" ... />
<OperationalSummary metrics={...} />
<div className="cmd-horizons" aria-label="Project control horizons">
  {summary.horizons.map((horizon) => <HorizonPanel key={horizon.key} horizon={horizon} onOpenItem={onOpenItem} />)}
</div>
<FilterBar ... />
<DataTable ... />
```

- [ ] **Step 6: Run Command Center tests**

```bash
npx vitest run src/pages/commandCenter/__tests__/commandCenterControlCenter.derive.test.ts src/pages/commandCenter/__tests__/CommandCenterControlCenter.test.tsx src/pages/__tests__/CommandCenter.projectScope.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/commandCenter
git commit -m "ui: rebuild Command Center around tactical horizons"
```

---

### Task 9: Validate theme parity, responsive behavior, and the full repository gate

**Files:**
- Modify only if failures reveal a required fix: `src/styles/command.css`, `src/styles/responsive.css`, `src/Layout.jsx`, changed Phase 1 components/tests.

**Interfaces:**
- No new public API. This task validates the Phase 1 contract.

- [ ] **Step 1: Run the focused Phase 1 suite**

```bash
npx vitest run \
  src/styles/__tests__/steelbuildBrandTokens.test.ts \
  src/components/nav/__tests__/BrandLogo.test.tsx \
  src/components/command/__tests__/referencePrimitives.test.tsx \
  src/config/__tests__/moduleRegistry.structure.test.ts \
  src/config/__tests__/moduleRegistry.native.test.js \
  src/components/nav/__tests__/ProjectContextBar.test.tsx \
  src/components/nav/__tests__/SidebarNav.preferences.test.tsx \
  src/components/nav/__tests__/MobileDrawer.keyboard.test.tsx \
  src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts \
  src/pages/dashboardCC/__tests__/DashboardControlCenter.test.tsx \
  src/pages/commandCenter/__tests__/commandCenterControlCenter.derive.test.ts \
  src/pages/commandCenter/__tests__/CommandCenterControlCenter.test.tsx \
  src/pages/__tests__/CommandCenter.projectScope.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run static gates**

```bash
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm run check:no-new-js
```

Expected: all PASS with no ignore-list growth.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Perform the visual parity checklist**

Verify all four states manually on Dashboard and Command Center:

```text
Dark / default density
Dark / compact density
Light / default density
Light / compact density
High contrast / dark
High contrast / light
Tablet rail navigation
Phone drawer navigation
```

Required outcomes:

```text
- No gold remains as the default SteelBuild brand accent.
- Orange is not used for error/success semantics.
- Light and dark use the same hierarchy and navigation structure.
- Project number obeys the existing user preference.
- Missing project metadata is omitted rather than invented.
- Dashboard photo launcher no longer dominates the page.
- Dashboard still exposes canonical Piece Control.
- Command Center preserves item opening, search/filter, and Forward Look.
- Keyboard/focus behavior remains intact.
```

- [ ] **Step 6: Commit any verification fixes**

If no fixes were required, skip this commit. If fixes were required:

```bash
git add <only-the-files-fixed-during-verification>
git commit -m "fix: close SteelBuild redesign phase 1 regressions"
```

- [ ] **Step 7: Prepare Phase 1 review**

Compare against the design spec and capture screenshots of Dashboard and Command Center in both themes for reviewer approval before Phase 2 planning.

---

## Self-review results

### Spec coverage

This plan covers the foundation requirements needed before domain migration:

- approved SteelBuild orange/steel identity;
- equal dark/light theme treatment;
- flat application logo variants;
- reduced card/hero/photo-heavy visual language;
- dense operational primitives;
- seven-group app navigation;
- permanent project context bar;
- Dashboard as operational project snapshot with Needs Attention and four steel-specific bands;
- Command Center as NOW / 48 HOURS / 10 DAYS tactical workspace;
- preservation of existing route/data/business contracts;
- accessibility, responsive behavior, density, and high-contrast verification.

The remaining approved workflow-specific UX is intentionally deferred to Phases 2–5 so each subsystem can be independently reviewed and tested.

### Placeholder scan

No TBD/TODO/"implement later" placeholders are present. Deferred work is explicitly assigned to later named phases rather than left ambiguous.

### Type consistency

The shared types introduced here are consumed by later tasks under the same names: `PageHeaderMeta`, `OperationalMetric`, `AttentionQueueItem`, `DashboardAttentionItem`, `DashboardOperationalBand`, `CommandHorizonKey`, and `CommandHorizon`.
