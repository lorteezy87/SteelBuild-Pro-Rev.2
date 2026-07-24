# Unified Piece Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Dashboard Piece Control summary and full Piece Register as one cohesive SteelBuild Pro command-center experience without changing business-critical piece workflows.

**Architecture:** Keep existing React Query repositories, mutations, RPC calls, role checks, and realtime invalidation as the data/authority layer. Add a small pure presentation model plus three reusable Piece Control presentation components, then compose those components into a compact Dashboard panel and the existing Piece Register controller. Scope new styling to a dedicated command-skin stylesheet so unrelated modules are unaffected.

**Tech Stack:** React 18, TypeScript, TanStack React Query, Vitest, Testing Library, Lucide React, existing SteelBuild Pro command components and CSS.

## Global Constraints

- Preserve all existing import, archive, relationship, production, logistics, readiness, mode-transition, permission, audit, RLS, and RPC behavior.
- Do not introduce database migrations or new routes.
- Do not auto-approve, auto-release, auto-transition, or auto-resolve piece records.
- Use existing SteelBuild Pro command components and tokens before creating new primitives.
- Keep user-facing labels operational; do not expose `Canonical Piece Control`, `canonical work packages`, `shadow comparison`, `piece delta`, `legacy delta`, or `active actionable leaf lots`.
- Pair every friendly mode label with a direct authority explanation.
- Keep empty states compact and actionable.
- Do not make broad edits to shared `command.css`; use Piece Control-scoped CSS for new layout rules.
- Do not create commits unless the user explicitly authorizes them. Commit steps below are named checkpoints and must be skipped until that approval exists.

---

## File Map

### New files

- `src/lib/pieceControl/presentation.ts` — pure Piece Control summary and mode presentation.
- `src/lib/pieceControl/presentation.test.ts` — presentation model tests.
- `src/components/pieceControl/PieceControlModeBadge.tsx` — friendly mode label and authority text.
- `src/components/pieceControl/PieceLifecycleStrip.tsx` — reusable compact lifecycle strip.
- `src/components/pieceControl/PieceAttentionPanel.tsx` — reusable exception/action list.
- `src/components/pieceControl/PieceControlDashboardPanel.tsx` — compact Dashboard integration.
- `src/components/pieceControl/__tests__/PieceControlPresentation.test.tsx` — shared component tests.
- `src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx` — Dashboard panel tests.
- `src/styles/piece-control-command.css` — Piece Control-scoped command styles.

### Modified files

- `src/pages/Dashboard.jsx` — remove the full reporting sibling and add Piece Register Dashboard navigation.
- `src/pages/dashboardCC/DashboardControlCenter.tsx` — render the compact Piece Control panel inside the normal Dashboard.
- `src/pages/PieceRegister.tsx` — adopt the command shell and shared presentation components while preserving state/mutations.
- `src/components/pieceControl/PieceRelationshipManager.tsx` — operational copy and command styling.
- `src/components/pieceControl/PieceProductionControl.tsx` — command styling and compact states.
- `src/components/pieceControl/PieceLogisticsControl.tsx` — command styling and compact states.
- `src/components/pieceControl/PieceControlPilotReadiness.tsx` — friendly mode language and command styling.
- `src/pages/pieceRegister/__tests__/pieceRegisterTheme.test.js` — command-skin and scoped-style regression coverage.
- Existing focused tests for any touched operational component.

### Removed file

- `src/components/dashboard/CanonicalPieceDashboard.tsx` — replaced by the compact `PieceControlDashboardPanel`.

---

### Task 1: Pure Piece Control presentation model

**Files:**
- Create: `src/lib/pieceControl/presentation.ts`
- Create: `src/lib/pieceControl/presentation.test.ts`

**Interfaces:**
- Consumes: piece rows with `quantity`, weight fields, `lifecycle_status`, `on_hold`, and `work_package_id`.
- Produces:
  - `modePresentation(mode: PieceControlMode): PieceControlModePresentation`
  - `buildPieceControlSummary(rows: PieceSummaryRow[]): PieceControlSummary`
  - `PieceLifecycleMetric`
  - `PieceAttentionItem`

- [ ] **Step 1: Write the failing presentation tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildPieceControlSummary,
  modePresentation,
  type PieceSummaryRow,
} from "./presentation";

const row = (
  overrides: Partial<PieceSummaryRow> = {},
): PieceSummaryRow => ({
  quantity: 1,
  weight_each_lbs: 1000,
  weight_total_lbs: null,
  lifecycle_status: "not_started",
  on_hold: false,
  work_package_id: "wp-1",
  ...overrides,
});

describe("modePresentation", () => {
  it("uses operational authority language for shadow mode", () => {
    expect(modePresentation("shadow")).toEqual({
      label: "Shadow review",
      tone: "warn",
      authority: "Existing production records remain authoritative while the register is compared.",
    });
  });
});

describe("buildPieceControlSummary", () => {
  it("derives quantity, tonnage, lifecycle, and attention counts", () => {
    const summary = buildPieceControlSummary([
      row({ quantity: 2, lifecycle_status: "in_fabrication" }),
      row({
        quantity: 3,
        lifecycle_status: "fabricated",
        weight_each_lbs: null,
        on_hold: true,
        work_package_id: null,
      }),
    ]);

    expect(summary.totalPieces).toBe(5);
    expect(summary.knownTons).toBe(1);
    expect(summary.inFabricationPieces).toBe(2);
    expect(summary.readyToShipPieces).toBe(3);
    expect(summary.unknownWeightPieces).toBe(3);
    expect(summary.heldRows).toBe(1);
    expect(summary.unassignedRows).toBe(1);
    expect(summary.attention.map((item) => [item.key, item.count])).toEqual([
      ["unassigned", 1],
      ["missing-weight", 3],
      ["held", 1],
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```powershell
npx vitest run src/lib/pieceControl/presentation.test.ts
```

Expected: FAIL because `./presentation` does not exist.

- [ ] **Step 3: Implement the pure presentation model**

```ts
import { CANONICAL_LIFECYCLES } from "./canonicalRollups";
import { pieceLifecycleLabel } from "./lifecycle";
import { pieceTons } from "./tonnage";

export type PieceControlMode = "off" | "shadow" | "pilot" | "live";
export type PresentationTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface PieceSummaryRow {
  quantity: number;
  weight_each_lbs: number | null;
  weight_total_lbs: number | null;
  lifecycle_status: string;
  on_hold: boolean;
  work_package_id: string | null;
}

export interface PieceControlModePresentation {
  label: string;
  tone: PresentationTone;
  authority: string;
}

export interface PieceLifecycleMetric {
  key: string;
  label: string;
  pieces: number;
  tons: number;
}

export interface PieceAttentionItem {
  key: "unassigned" | "missing-weight" | "held";
  label: string;
  count: number;
  tone: "warn" | "danger";
}

export interface PieceControlSummary {
  rowCount: number;
  totalPieces: number;
  knownTons: number;
  inFabricationPieces: number;
  readyToShipPieces: number;
  unknownWeightPieces: number;
  heldRows: number;
  unassignedRows: number;
  lifecycle: PieceLifecycleMetric[];
  attention: PieceAttentionItem[];
}

const MODE_PRESENTATION: Record<PieceControlMode, PieceControlModePresentation> = {
  off: {
    label: "Not set up",
    tone: "neutral",
    authority: "Piece Control is not active for this project.",
  },
  shadow: {
    label: "Shadow review",
    tone: "warn",
    authority: "Existing production records remain authoritative while the register is compared.",
  },
  pilot: {
    label: "Pilot workflow",
    tone: "info",
    authority: "The approved pilot workflow is active for this project scope.",
  },
  live: {
    label: "Live workflow",
    tone: "good",
    authority: "Piece Control is authoritative for the enabled workflow.",
  },
};

export function modePresentation(mode: PieceControlMode): PieceControlModePresentation {
  return MODE_PRESENTATION[mode];
}

export function buildPieceControlSummary(rows: PieceSummaryRow[]): PieceControlSummary {
  const lifecycle = CANONICAL_LIFECYCLES.map((key) => ({
    key,
    label: pieceLifecycleLabel(key),
    pieces: 0,
    tons: 0,
  }));
  const lifecycleByKey = new Map(lifecycle.map((item) => [item.key, item]));
  let totalPieces = 0;
  let knownTons = 0;
  let unknownWeightPieces = 0;
  let heldRows = 0;
  let unassignedRows = 0;

  for (const row of rows) {
    const quantity = Number(row.quantity) || 0;
    const tons = pieceTons(row);
    totalPieces += quantity;
    if (tons == null) unknownWeightPieces += quantity;
    else knownTons += tons;
    if (row.on_hold) heldRows += 1;
    if (!row.work_package_id) unassignedRows += 1;
    const lifecycleItem = lifecycleByKey.get(row.lifecycle_status);
    if (lifecycleItem) {
      lifecycleItem.pieces += quantity;
      lifecycleItem.tons += tons ?? 0;
    }
  }

  const attention: PieceAttentionItem[] = [
    { key: "unassigned", label: "Unassigned pieces", count: unassignedRows, tone: "warn" },
    { key: "missing-weight", label: "Missing weights", count: unknownWeightPieces, tone: "warn" },
    { key: "held", label: "Held pieces", count: heldRows, tone: "danger" },
  ].filter((item) => item.count > 0) as PieceAttentionItem[];

  return {
    rowCount: rows.length,
    totalPieces,
    knownTons,
    inFabricationPieces:
      lifecycleByKey.get("in_fabrication")?.pieces ?? 0,
    readyToShipPieces: lifecycleByKey.get("fabricated")?.pieces ?? 0,
    unknownWeightPieces,
    heldRows,
    unassignedRows,
    lifecycle,
    attention,
  };
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npx vitest run src/lib/pieceControl/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run existing tonnage and lifecycle tests**

Run:

```powershell
npx vitest run src/lib/pieceControl/__tests__/tonnage.test.ts src/lib/pieceControl/lifecycle.test.ts src/lib/pieceControl/canonicalRollups.test.ts
```

Expected: PASS with no changed lifecycle or tonnage behavior.

- [ ] **Step 6: Named commit checkpoint**

If and only if explicit commit approval exists:

```powershell
git add src/lib/pieceControl/presentation.ts src/lib/pieceControl/presentation.test.ts
git commit -m "refactor: add Piece Control presentation model"
```

---

### Task 2: Shared Piece Control command components

**Files:**
- Create: `src/components/pieceControl/PieceControlModeBadge.tsx`
- Create: `src/components/pieceControl/PieceLifecycleStrip.tsx`
- Create: `src/components/pieceControl/PieceAttentionPanel.tsx`
- Create: `src/components/pieceControl/__tests__/PieceControlPresentation.test.tsx`
- Create: `src/styles/piece-control-command.css`

**Interfaces:**
- Consumes: `PieceControlModePresentation`, `PieceLifecycleMetric[]`, and `PieceAttentionItem[]`.
- Produces:
  - `<PieceControlModeBadge presentation />`
  - `<PieceLifecycleStrip items totalPieces onSelect? />`
  - `<PieceAttentionPanel items emptyMessage onSelect? />`

- [ ] **Step 1: Write failing component tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieceAttentionPanel } from "../PieceAttentionPanel";
import { PieceControlModeBadge } from "../PieceControlModeBadge";
import { PieceLifecycleStrip } from "../PieceLifecycleStrip";

describe("Piece Control presentation components", () => {
  it("shows the authority explanation beside the mode", () => {
    render(
      <PieceControlModeBadge
        presentation={{
          label: "Shadow review",
          tone: "warn",
          authority: "Existing production records remain authoritative while the register is compared.",
        }}
      />,
    );
    expect(screen.getByText("Shadow review")).toBeInTheDocument();
    expect(screen.getByText(/remain authoritative/i)).toBeInTheDocument();
  });

  it("makes lifecycle segments actionable when a handler is provided", () => {
    const onSelect = vi.fn();
    render(
      <PieceLifecycleStrip
        totalPieces={4}
        onSelect={onSelect}
        items={[
          { key: "not_started", label: "Not Started", pieces: 3, tons: 1.5 },
          { key: "fabricated", label: "Fabricated", pieces: 1, tons: 0.5 },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /fabricated 1 pieces/i }));
    expect(onSelect).toHaveBeenCalledWith("fabricated");
  });

  it("collapses an empty attention list to one concise state", () => {
    render(<PieceAttentionPanel items={[]} emptyMessage="No piece exceptions." />);
    expect(screen.getByText("No piece exceptions.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify missing component failures**

Run:

```powershell
npx vitest run src/components/pieceControl/__tests__/PieceControlPresentation.test.tsx
```

Expected: FAIL because the three component modules do not exist.

- [ ] **Step 3: Implement `PieceControlModeBadge`**

```tsx
import { Pill } from "@/components/command";
import type { PieceControlModePresentation } from "@/lib/pieceControl/presentation";

export function PieceControlModeBadge({
  presentation,
}: {
  presentation: PieceControlModePresentation;
}) {
  return (
    <div className="piece-mode">
      <Pill tone={presentation.tone}>{presentation.label}</Pill>
      <span className="piece-mode__authority">{presentation.authority}</span>
    </div>
  );
}
```

- [ ] **Step 4: Implement lifecycle and attention components**

```tsx
import type { PieceLifecycleMetric } from "@/lib/pieceControl/presentation";

export function PieceLifecycleStrip({
  items,
  totalPieces,
  onSelect,
}: {
  items: PieceLifecycleMetric[];
  totalPieces: number;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="piece-lifecycle" aria-label="Piece lifecycle">
      {items.map((item) => {
        const width = totalPieces > 0 ? Math.max(2, (item.pieces / totalPieces) * 100) : 0;
        const content = (
          <>
            <span className="piece-lifecycle__track">
              <span style={{ width: `${width}%` }} />
            </span>
            <span className="piece-lifecycle__label">{item.label}</span>
            <strong>{item.pieces.toLocaleString()}</strong>
          </>
        );
        return onSelect ? (
          <button
            key={item.key}
            type="button"
            className="piece-lifecycle__item"
            aria-label={`${item.label} ${item.pieces} pieces`}
            onClick={() => onSelect(item.key)}
          >
            {content}
          </button>
        ) : (
          <div key={item.key} className="piece-lifecycle__item">{content}</div>
        );
      })}
    </div>
  );
}
```

```tsx
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PieceAttentionItem } from "@/lib/pieceControl/presentation";

export function PieceAttentionPanel({
  items,
  emptyMessage,
  onSelect,
}: {
  items: PieceAttentionItem[];
  emptyMessage: string;
  onSelect?: (key: PieceAttentionItem["key"]) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="piece-attention__empty">
        <CheckCircle2 size={16} />
        <span>{emptyMessage}</span>
      </div>
    );
  }
  return (
    <div className="piece-attention">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`piece-attention__row is-${item.tone}`}
          onClick={() => onSelect?.(item.key)}
          disabled={!onSelect}
        >
          <AlertTriangle size={15} />
          <span>{item.label}</span>
          <strong>{item.count.toLocaleString()}</strong>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Add Piece Control-scoped command CSS**

Create `src/styles/piece-control-command.css` with the complete scoped rules:

```css
[data-skin="command"] .piece-control-command {
  display: grid;
  gap: 14px;
  color: var(--cmd-text);
}

[data-skin="command"] .piece-mode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

[data-skin="command"] .piece-mode__authority {
  color: var(--cmd-text-muted);
  font-size: 12px;
}

[data-skin="command"] .piece-lifecycle {
  display: grid;
  grid-template-columns: repeat(6, minmax(110px, 1fr));
  gap: 10px;
}

[data-skin="command"] .piece-lifecycle__item {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--cmd-text);
  text-align: left;
}

[data-skin="command"] button.piece-lifecycle__item {
  cursor: pointer;
}

[data-skin="command"] .piece-lifecycle__track {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #e9edf2;
}

[data-skin="command"] .piece-lifecycle__track > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--cmd-info);
}

[data-skin="command"] .piece-lifecycle__label {
  overflow: hidden;
  color: var(--cmd-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-skin="command"] .piece-attention {
  display: grid;
}

[data-skin="command"] .piece-attention__row,
[data-skin="command"] .piece-attention__empty {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  min-height: 38px;
  padding: 7px 0;
  border: 0;
  border-top: 1px solid var(--cmd-border);
  background: transparent;
  color: var(--cmd-text);
  font-size: 12px;
  text-align: left;
}

[data-skin="command"] .piece-attention__row:first-child {
  border-top: 0;
}

[data-skin="command"] .piece-attention__row:not(:disabled) {
  cursor: pointer;
}

[data-skin="command"] .piece-attention__row.is-danger svg {
  color: var(--cmd-danger);
}

[data-skin="command"] .piece-attention__row.is-warn svg {
  color: var(--cmd-warn);
}

[data-skin="command"] .piece-attention__empty {
  grid-template-columns: auto 1fr;
  color: var(--cmd-text-muted);
}

@media (max-width: 1100px) {
  [data-skin="command"] .piece-lifecycle {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 680px) {
  [data-skin="command"] .piece-lifecycle {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 6: Run the shared component test**

Run:

```powershell
npx vitest run src/components/pieceControl/__tests__/PieceControlPresentation.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Named commit checkpoint**

If and only if explicit commit approval exists:

```powershell
git add src/components/pieceControl src/styles/piece-control-command.css
git commit -m "ui: add shared Piece Control command components"
```

---

### Task 3: Compact Dashboard Piece Control panel

**Files:**
- Create: `src/components/pieceControl/PieceControlDashboardPanel.tsx`
- Create: `src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx`
- Modify: `src/pages/dashboardCC/DashboardControlCenter.tsx:190-390`
- Modify: `src/pages/Dashboard.jsx:13,275-304`
- Delete: `src/components/dashboard/CanonicalPieceDashboard.tsx`

**Interfaces:**
- Consumes: project `{ id, piece_control_mode }`, existing canonical dashboard query, and `onOpen`.
- Produces: one compact Dashboard decision panel that returns `null` when Piece Control is off.

- [ ] **Step 1: Write the failing Dashboard panel tests**

Mock `fetchCanonicalDashboardSnapshot`, `useCanonicalReportingRealtime`, and the command presentation components. Cover:

```tsx
it("does not render when Piece Control is off", () => {
  const { container } = render(
    <QueryClientProvider client={client}>
      <PieceControlDashboardPanel
        project={{ id: "p1", piece_control_mode: "off" }}
        onOpen={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(container).toBeEmptyDOMElement();
});

it("renders one compact panel and opens the register", async () => {
  renderPanelWithSnapshot();
  expect(await screen.findByRole("heading", { name: "Piece Control" })).toBeInTheDocument();
  expect(screen.queryByText("Canonical work packages")).not.toBeInTheDocument();
  expect(screen.queryByText("Shadow comparison")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open Piece Register" }));
  expect(onOpen).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```powershell
npx vitest run src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx
```

Expected: FAIL because `PieceControlDashboardPanel` does not exist.

- [ ] **Step 3: Implement the compact panel**

Use the existing canonical query and realtime hook. The render body must follow this structure:

```tsx
<DecisionPanel title="Piece Control" onViewAll={onOpen}>
  <div className="piece-dashboard-panel">
    <PieceControlModeBadge presentation={modePresentation(mode)} />
    <div className="piece-dashboard-panel__metrics">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
        </div>
      ))}
    </div>
    {summary.totalPieces === 0 ? (
      <button type="button" className="cmd-btn cmd-btn--primary" onClick={onOpen}>
        Import pieces
      </button>
    ) : (
      <div className="piece-dashboard-panel__body">
        <PieceLifecycleStrip items={summary.lifecycle} totalPieces={summary.totalPieces} />
        <PieceAttentionPanel
          items={summary.attention}
          emptyMessage="No piece exceptions."
          onSelect={() => onOpen()}
        />
      </div>
    )}
  </div>
</DecisionPanel>
```

Do not port the old work-package table, shipping list, or full comparison panel.

- [ ] **Step 4: Integrate inside the normal Dashboard**

In `DashboardControlCenter.tsx`, import the panel and render it after the Dashboard KPI strip:

```tsx
<KpiStrip cells={kpiCells} />

<PieceControlDashboardPanel
  project={props.project}
  onOpen={() => onNavigate?.("piece-register")}
/>
```

In `Dashboard.jsx`, remove the lazy import and sibling render of `CanonicalPieceDashboard`, then add the navigation target:

```js
const paths = {
  // existing mappings
  "piece-register": "/PieceRegister",
};
```

- [ ] **Step 5: Remove the obsolete full Dashboard reporting component**

Delete `src/components/dashboard/CanonicalPieceDashboard.tsx` after all imports are removed:

```powershell
rg -n "CanonicalPieceDashboard" src
```

Expected: no matches.

- [ ] **Step 6: Run Dashboard and presentation tests**

Run:

```powershell
npx vitest run src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts
```

Expected: PASS.

- [ ] **Step 7: Named commit checkpoint**

If and only if explicit commit approval exists:

```powershell
git add src/components/pieceControl/PieceControlDashboardPanel.tsx src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx src/pages/Dashboard.jsx src/pages/dashboardCC/DashboardControlCenter.tsx src/components/dashboard/CanonicalPieceDashboard.tsx
git commit -m "ui: integrate Piece Control into Dashboard"
```

---

### Task 4: Full Piece Register command shell and register workspace

**Files:**
- Modify: `src/pages/PieceRegister.tsx:1-850`
- Modify: `src/pages/pieceRegister/__tests__/pieceRegisterTheme.test.js`
- Create or modify: focused `PieceRegister` component test under `src/pages/pieceRegister/__tests__/`
- Modify: `src/styles/piece-control-command.css`

**Interfaces:**
- Consumes: Task 1 presentation model and Task 2 shared components.
- Produces: SB Pro `PageHero`, KPI strip, lifecycle/attention row, section navigation, and command-styled table without changing existing mutations.

- [ ] **Step 1: Extend the theme regression test**

```js
it("uses the command skin and Piece Control scoped stylesheet", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../PieceRegister.tsx", import.meta.url)),
    "utf8",
  );
  expect(source).toContain('import "@/styles/command.css"');
  expect(source).toContain('import "@/styles/piece-control-command.css"');
  expect(source).toContain("useCommandSkin()");
  expect(source).toContain('className="piece-control-command"');
  expect(source).not.toContain("min-h-screen bg-[radial-gradient");
});
```

Add a component test that verifies:

```tsx
expect(screen.getByRole("heading", { name: "Piece Register" })).toBeInTheDocument();
expect(screen.getByText(/existing production records remain authoritative/i)).toBeInTheDocument();
expect(screen.getByRole("navigation", { name: "Piece Register sections" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Import pieces" })).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npx vitest run src/pages/pieceRegister/__tests__/pieceRegisterTheme.test.js src/pages/pieceRegister/__tests__/PieceRegister.test.tsx
```

Expected: FAIL because the current page uses its standalone shell.

- [ ] **Step 3: Apply the command skin and shared header**

At the top of `PieceRegister.tsx`:

```tsx
import "@/styles/command.css";
import "@/styles/piece-control-command.css";
import {
  DecisionPanel,
  KpiStrip,
  PageHero,
  useCommandSkin,
  type KpiCellDef,
} from "@/components/command";
import { PieceAttentionPanel } from "@/components/pieceControl/PieceAttentionPanel";
import { PieceControlModeBadge } from "@/components/pieceControl/PieceControlModeBadge";
import { PieceLifecycleStrip } from "@/components/pieceControl/PieceLifecycleStrip";
import {
  buildPieceControlSummary,
  modePresentation,
  type PieceControlMode,
} from "@/lib/pieceControl/presentation";
```

Inside the component:

```tsx
useCommandSkin();
const presentation = useMemo(
  () => buildPieceControlSummary(displayRows),
  [displayRows],
);
const modeInfo = modePresentation(mode as PieceControlMode);
```

Replace the standalone wrapper/header with:

```tsx
<div className="piece-control-command" data-skin="command">
  <PageHero
    Icon={Boxes}
    title="Piece Register"
    subtitle="Controlled piece, lot, production, and logistics record."
    projectName={activeProject?.name}
    chips={[{ label: modeInfo.label, tone: modeInfo.tone }]}
    photoSrc={photoFor("PieceRegister") ?? undefined}
  >
    <button
      type="button"
      className="cmd-btn cmd-btn--primary"
      onClick={() => setActiveView("import")}
    >
      <FileUp size={16} />
      Import pieces
    </button>
  </PageHero>

  <KpiStrip cells={kpiCells} />

  <div className="piece-register-summary">
    <DecisionPanel title="Piece lifecycle">
      <PieceLifecycleStrip
        items={presentation.lifecycle}
        totalPieces={presentation.totalPieces}
        onSelect={(lifecycle) => {
          setFilters((current) => ({ ...current, lifecycle }));
          setActiveView("register");
        }}
      />
    </DecisionPanel>
    <DecisionPanel title="Needs attention">
      <PieceAttentionPanel
        items={presentation.attention}
        emptyMessage="No piece exceptions."
        onSelect={handleAttentionSelect}
      />
    </DecisionPanel>
  </div>

  {sectionNavigation}
  {activeWorkspace}
</div>
```

Use five KPI cells:

```tsx
const kpiCells: KpiCellDef[] = [
  { label: "Total Pieces", value: presentation.totalPieces.toLocaleString(), Icon: Boxes },
  { label: "Known Tons", value: presentation.knownTons.toFixed(1), Icon: Scale },
  { label: "In Fabrication", value: presentation.inFabricationPieces.toLocaleString(), tone: "info", Icon: Factory },
  { label: "Ready to Ship", value: presentation.readyToShipPieces.toLocaleString(), tone: "good", Icon: Truck },
  { label: "Exceptions", value: presentation.attention.reduce((total, item) => total + item.count, 0), tone: presentation.attention.length ? "warn" : "good", Icon: AlertTriangle },
];
```

- [ ] **Step 4: Restyle navigation, filters, table, and selected-row actions**

Keep all current handlers and mutation calls. Change only presentation:

```tsx
<nav aria-label="Piece Register sections" className="piece-register-nav">
  {REGISTER_VIEWS.map(({ id, label, icon: Icon }) => (
    <button
      key={id}
      type="button"
      aria-current={activeView === id ? "page" : undefined}
      className={`piece-register-nav__item${activeView === id ? " is-active" : ""}`}
      onClick={() => setActiveView(id)}
    >
      <Icon size={16} />
      {label}
    </button>
  ))}
</nav>
```

Use command classes for the register surface:

```tsx
<section className="piece-register-workspace">
  <div className="cmd-filterbar">{/* existing inputs and selects */}</div>
  {selectedPieceIds.size > 0 ? (
    <div className="piece-selection-bar">
      <strong>{selectedPieceIds.size} selected</strong>
      <button type="button" className="cmd-btn" onClick={openArchiveDialog}>
        <Archive size={15} />
        Archive selected
      </button>
    </div>
  ) : null}
  <div className="cmd-table-wrap">
    <table className="cmd-table">{/* existing columns and rows */}</table>
  </div>
</section>
```

Add scoped responsive rules for `.piece-register-summary`, `.piece-register-nav`, `.piece-register-workspace`, `.piece-selection-bar`, and native light-color form controls.

- [ ] **Step 5: Restyle the off/setup state without changing activation**

Use the command shell, `PageHero`, and existing `PieceControlPilotReadiness`. Preserve the admin-controlled `off -> shadow` transition and direct activation behavior.

Copy must read:

```text
Set up the Piece Register
Start in Shadow review to import and compare piece data without replacing current production records.
```

- [ ] **Step 6: Run focused Piece Register tests**

Run:

```powershell
npx vitest run src/pages/pieceRegister/__tests__
```

Expected: PASS, including natural sorting and command-skin coverage.

- [ ] **Step 7: Named commit checkpoint**

If and only if explicit commit approval exists:

```powershell
git add src/pages/PieceRegister.tsx src/pages/pieceRegister src/styles/piece-control-command.css
git commit -m "ui: unify Piece Register command workspace"
```

---

### Task 5: Imports and Lots & Links visual integration

**Files:**
- Modify: `src/pages/PieceRegister.tsx:721-850`
- Modify: `src/components/pieceControl/PieceRelationshipManager.tsx:22-310`
- Create or modify: focused relationship component test.
- Modify: `src/styles/piece-control-command.css`

**Interfaces:**
- Consumes: existing import and relationship queries/mutations.
- Produces: command-styled staged import workflow and relationship workspace with unchanged writes.

- [ ] **Step 1: Write tests for preserved behavior and operational language**

Imports:

```tsx
expect(screen.getByText("Stage import")).toBeInTheDocument();
expect(screen.getByText(/no direct changes to the active register/i)).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Stage for review" })).toBeDisabled();
```

Relationships:

```tsx
expect(screen.getByRole("heading", { name: "Piece assignments" })).toBeInTheDocument();
expect(screen.queryByText(/pieces\\.work_package_id/i)).not.toBeInTheDocument();
expect(screen.getByText(/read-only readiness check/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests and verify copy/layout failures**

Run:

```powershell
npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/components/pieceControl/__tests__/PieceRelationshipManager.test.tsx
```

Expected: FAIL on the new operational labels before implementation.

- [ ] **Step 3: Restyle Imports**

Preserve `stageMutation`, `approveMutation`, `applyMutation`, `applyConfirmed`, and batch selection. Organize the section as:

```tsx
<section className="piece-import-workspace">
  <DecisionPanel title="Stage import">{stageForm}</DecisionPanel>
  <DecisionPanel title="Import batches">{batchWorkspace}</DecisionPanel>
</section>
```

Use `cmd-btn`, `cmd-pill`, `cmd-table`, and Piece Control-scoped form classes. Keep the approval and apply confirmation separate.

- [ ] **Step 4: Restyle Lots & Links**

Change presentation and copy only:

```tsx
<div className={`piece-relationships${compact ? " is-compact" : ""}`}>
  <DecisionPanel title="Piece assignments">{assignmentControls}</DecisionPanel>
  <DecisionPanel title="Piece and drawing links">{drawingControls}</DecisionPanel>
  <DecisionPanel title="Work package readiness">{readinessRows}</DecisionPanel>
</div>
```

Required copy:

```text
Assign active pieces to a work package.
Create explicit links between piece lots and drawings.
Read-only readiness check. Work package status is not changed.
```

Do not change repository calls or mutation arguments.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/components/pieceControl/__tests__/PieceRelationshipManager.test.tsx src/lib/pieceControl/__tests__/readiness.test.ts
```

Expected: PASS.

- [ ] **Step 6: Named commit checkpoint**

If and only if explicit commit approval exists:

```powershell
git add src/pages/PieceRegister.tsx src/components/pieceControl/PieceRelationshipManager.tsx src/components/pieceControl/__tests__/PieceRelationshipManager.test.tsx src/styles/piece-control-command.css
git commit -m "ui: integrate Piece Register imports and relationships"
```

---

### Task 6: Production and Logistics visual integration

**Files:**
- Modify: `src/components/pieceControl/PieceProductionControl.tsx:40-end`
- Modify: `src/components/pieceControl/PieceLogisticsControl.tsx:59-end`
- Create or modify: focused production and logistics component tests.
- Modify: `src/styles/piece-control-command.css`

**Interfaces:**
- Consumes: current repository queries, eligibility helpers, transitions, confirmations, and history.
- Produces: compact command workspaces with clear prerequisites and immutable history.

- [ ] **Step 1: Write behavior-preservation tests**

Production:

```tsx
expect(screen.getByText(/physical station transitions/i)).toBeInTheDocument();
expect(screen.getByText(/cannot be overridden or reversed/i)).toBeInTheDocument();
expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
```

Logistics:

```tsx
expect(screen.getByRole("heading", { name: "Ship" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Deliver" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Erect" })).toBeInTheDocument();
expect(screen.getByText(/immutable logistics history/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests and verify presentation failures**

Run:

```powershell
npx vitest run src/components/pieceControl/__tests__/PieceProductionControl.test.tsx src/components/pieceControl/__tests__/PieceLogisticsControl.test.tsx
```

Expected: FAIL on the new headings and command layout.

- [ ] **Step 3: Restyle Production**

Use this hierarchy:

```tsx
<section className="piece-operations">
  <header className="piece-operations__head">
    <div>
      <h2>Production</h2>
      <p>Record controlled physical station transitions.</p>
    </div>
    {summary}
  </header>
  <div className="piece-operations__grid">{stationPanels}</div>
  <DecisionPanel title="Production history">{history}</DecisionPanel>
</section>
```

Keep existing eligibility, confirmation, mutation, and history logic unchanged. Disabled candidates must continue to display the exact reason.

- [ ] **Step 4: Restyle Logistics**

Use aligned operational panels:

```tsx
<section className="piece-operations">
  <header className="piece-operations__head">
    <div>
      <h2>Logistics</h2>
      <p>Record shipment, delivery, and erection as controlled physical events.</p>
    </div>
  </header>
  <div className="piece-logistics-grid">
    {shipPanel}
    {deliverPanel}
    {erectPanel}
  </div>
  <DecisionPanel title="Immutable logistics history">{history}</DecisionPanel>
</section>
```

Do not change `requiredLifecycleForAction`, `logisticsDisabledReason`, RPC calls, reference payloads, or the browser confirmation.

- [ ] **Step 5: Run focused and repository tests**

Run:

```powershell
npx vitest run src/components/pieceControl/__tests__/PieceProductionControl.test.tsx src/components/pieceControl/__tests__/PieceLogisticsControl.test.tsx src/lib/pieceControl/logisticsRepository.test.ts src/lib/pieceControl/stationProgress.test.ts
```

Expected: PASS.

- [ ] **Step 6: Named commit checkpoint**

If and only if explicit commit approval exists:

```powershell
git add src/components/pieceControl/PieceProductionControl.tsx src/components/pieceControl/PieceLogisticsControl.tsx src/components/pieceControl/__tests__ src/styles/piece-control-command.css
git commit -m "ui: integrate Piece Register production and logistics"
```

---

### Task 7: Settings, readiness, responsive states, and full validation

**Files:**
- Modify: `src/components/pieceControl/PieceControlPilotReadiness.tsx:25-end`
- Modify: `src/pages/PieceRegister.tsx`
- Modify: `src/styles/piece-control-command.css`
- Modify: relevant focused tests.
- Update: `docs/superpowers/specs/2026-07-22-piece-register-unified-design.md` only if implementation reveals an approved design correction.

**Interfaces:**
- Consumes: existing readiness report, admin role, allowed mode transitions, typed confirmation, CSV export, and audit history.
- Produces: friendly mode language, compact blocker lists, responsive command layout, and verified repository build.

- [ ] **Step 1: Write readiness language and safety tests**

```tsx
expect(screen.getByText("Shadow review")).toBeInTheDocument();
expect(screen.getByText(/existing production records remain authoritative/i)).toBeInTheDocument();
expect(screen.getByText(/Pilot workflow blocked/i)).toBeInTheDocument();
expect(screen.getByText(/Live workflow blocked/i)).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Confirm mode change" })).toBeDisabled();
```

Also retain a test that enters the exact expected confirmation and verifies the existing mutation arguments.

- [ ] **Step 2: Run the readiness tests and verify copy failures**

Run:

```powershell
npx vitest run src/components/pieceControl/__tests__/PieceControlPilotReadiness.test.tsx
```

Expected: FAIL on friendly labels before implementation.

- [ ] **Step 3: Apply friendly mode language without changing transition rules**

Use `modePresentation(currentMode)` for the current label and authority statement.

Map target options visually:

```tsx
{nextModes[currentMode].map((mode) => {
  const option = modePresentation(mode);
  return (
    <option key={mode} value={mode}>
      {option.label}
    </option>
  );
})}
```

Keep the expected confirmation value internal and exact:

```ts
const expectedConfirmation =
  `CHANGE ${currentMode.toUpperCase()} TO ${targetMode.toUpperCase()}`;
```

Do not change readiness blockers, admin checks, mutation parameters, or audit history.

- [ ] **Step 4: Finish compact loading, error, empty, and responsive states**

Complete scoped CSS for:

- Dashboard compact panel.
- Page summary grid.
- Section navigation overflow.
- Filter wrapping.
- Register table scrolling.
- Import two-column stacking.
- Relationship panel stacking.
- Production/logistics grid stacking.
- Settings confirmation layout.

At `1100px`, reduce wide grids. At `680px`, stack summary panels, preserve horizontal tab/table scrolling, and keep primary actions visible.

- [ ] **Step 5: Run all focused Piece Control tests**

Run:

```powershell
npx vitest run src/lib/pieceControl src/components/pieceControl src/pages/pieceRegister
```

Expected: PASS.

- [ ] **Step 6: Run repository static validation**

Run:

```powershell
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
```

Expected: all commands exit 0. Strict ratchets may report grandfathered findings but no newly enforced failures.

- [ ] **Step 7: Run the full test suite and production build**

Run:

```powershell
npm run test
npm run build
```

Expected: full Vitest suite passes and Vite production build exits 0.

- [ ] **Step 8: Perform visual verification**

Start the app with the existing project environment and inspect:

- Dashboard at the supplied wide desktop viewport.
- Piece Register Overview and Register.
- Imports.
- Lots & Links.
- Production.
- Logistics.
- Settings.
- Narrow responsive layout.

Compare against the approved Integrated Command Deck visual. Confirm:

- Dashboard hero appears before Piece Control.
- Piece Control is one compact Dashboard panel.
- No tall empty regions.
- No debug-facing labels.
- No clipped tabs, filters, tables, or actions.
- Mode authority remains visible.

Do not use a different browser or Playwright browser control without the user's permission.

- [ ] **Step 9: Review final diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat
git diff -- src/lib/pieceControl src/components/pieceControl src/pages/PieceRegister.tsx src/pages/Dashboard.jsx src/pages/dashboardCC/DashboardControlCenter.tsx src/styles/piece-control-command.css
```

Expected: only planned Piece Register, Dashboard integration, tests, styles, and approved docs are changed.

- [ ] **Step 10: Named commit checkpoint**

If and only if explicit commit approval exists:

```powershell
git add docs/superpowers src/lib/pieceControl src/components/pieceControl src/pages/PieceRegister.tsx src/pages/pieceRegister src/pages/Dashboard.jsx src/pages/dashboardCC/DashboardControlCenter.tsx src/styles/piece-control-command.css
git commit -m "ui: unify Piece Register with SteelBuild Pro"
```
