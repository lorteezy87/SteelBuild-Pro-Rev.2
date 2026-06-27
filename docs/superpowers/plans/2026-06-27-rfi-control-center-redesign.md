# RFI Control Center Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the RFI page into the new light-default "RFI Control Center" workbench (hero + KPI strip + 3 decision panels + filter bar + table) behind the `command_ui` flag, behavior-preserving, while extracting the reusable Command UI kit.

**Architecture:** `RFIs.jsx` stays the sole owner of data, mutations, and modals. A new presentation-only `RfiControlCenter.tsx` (built from a new `src/components/command/` kit, styled by `src/styles/command.css` scoped under `[data-skin="command"]`) renders when `useFlag("command_ui")` is true; the classic page renders otherwise. All RFI KPIs/panels/columns derive from a new pure, unit-tested `rfiControlCenter.derive.ts` reusing existing helpers. Zero schema changes.

**Tech Stack:** Vite + React 18, TypeScript (strict-null + noImplicitAny CI gates), React Query, `lucide-react`, Vitest. Spec: `docs/superpowers/specs/2026-06-27-rfi-control-center-redesign-design.md`.

---

## File Structure

**New files:**
- `src/pages/rfis/rfiControlCenter.derive.ts` — pure derivations (`daysUntil`, `riskScore`, `ballInCourtSummary`, `buildRfiSummary`) + the `RfiRecord`/`RfiSummary`/`BicSummaryRow` types.
- `src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts` — unit tests for the above.
- `src/components/command/launchTiles.tsx` — the 8 launch-tile config (label + path + lucide icon).
- `src/components/command/useCommandSkin.ts` — sets `[data-skin="command"]` on `<html>` while mounted.
- `src/components/command/Pill.tsx` — status/priority/semantic chip.
- `src/components/command/KpiStrip.tsx` — `KpiStrip` + `KpiCell`.
- `src/components/command/DecisionPanel.tsx` — titled card with optional "View all".
- `src/components/command/LaunchTileGrid.tsx` — `LaunchTileGrid` + `LaunchTile`.
- `src/components/command/PageHero.tsx` — photo band + icon/title/subtitle + chips + tiles slot.
- `src/components/command/FilterBar.tsx` — search + filter slot + actions.
- `src/components/command/DataTable.tsx` — generic dense table + pagination.
- `src/components/command/index.ts` — barrel.
- `src/styles/command.css` — light-default tokens + component styles, all scoped under `[data-skin="command"]`.
- `src/pages/rfis/RfiControlCenter.tsx` — composes the kit + derive into the page.

**Modified:**
- `src/pages/RFIs.jsx` — read `useFlag("command_ui")`, extract a shared `modals` fragment, branch the main region.

**Untouched:** `RfiCommandCenter.jsx`, `RfiInsightsStrip.jsx`, `RfiRow.jsx`, `utils.js`, all mutations.

**Deferred to field-verify / follow-on (called out, not silently dropped):** pixel-polishing `command.css` to the mockup; bulk-select checkboxes in the new table; dark-secondary theme; the full sidebar shell.

---

## Task 1: Pure derivations + tests (the TDD heart)

**Files:**
- Create: `src/pages/rfis/rfiControlCenter.derive.ts`
- Test: `src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { daysUntil, riskScore, ballInCourtSummary, buildRfiSummary } from "../rfiControlCenter.derive";
import { daysOpen } from "../utils";

// Build an ISO date (YYYY-MM-DD) `offsetDays` from today (UTC midnight basis).
function isoOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("daysUntil", () => {
  it("returns null for missing/invalid dates", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil("not-a-date")).toBeNull();
  });
  it("is negative in the past, ~0 today, positive in the future", () => {
    expect(daysUntil(isoOffset(-3))).toBeLessThan(0);
    expect(daysUntil(isoOffset(0))).toBe(0);
    expect(daysUntil(isoOffset(5))).toBeGreaterThan(0);
  });
});

describe("riskScore", () => {
  it("ranks an overdue critical RFI above a fresh low-priority one", () => {
    const hot = { status: "Open", priority: "Critical", submitted_date: isoOffset(-30), date_required: isoOffset(-5) };
    const calm = { status: "Open", priority: "Low", submitted_date: isoOffset(-1), date_required: isoOffset(20) };
    expect(riskScore(hot)).toBeGreaterThan(riskScore(calm));
  });
  it("adds weight for incomplete-response status", () => {
    const base = { status: "Open", priority: "Medium", submitted_date: isoOffset(-2), date_required: isoOffset(10) };
    const incomplete = { ...base, status: "Incomplete Response" };
    expect(riskScore(incomplete)).toBeGreaterThan(riskScore(base));
  });
});

describe("ballInCourtSummary", () => {
  const rfis = [
    { id: "1", rfi_number: "RFI #001", status: "Open", ball_in_court: "Engineer", submitted_date: isoOffset(-10) },
    { id: "2", rfi_number: "RFI #002", status: "Open", ball_in_court: "Engineer", submitted_date: isoOffset(-4) },
    { id: "3", rfi_number: "RFI #003", status: "Open", ball_in_court: "GC", submitted_date: isoOffset(-6) },
    { id: "4", rfi_number: "RFI #004", status: "Closed", ball_in_court: "GC", submitted_date: isoOffset(-99) },
    { id: "5", rfi_number: "RFI #005", status: "Open", ball_in_court: null, submitted_date: isoOffset(-1) },
  ];
  it("groups OPEN rfis by company, counts, and finds the oldest number", () => {
    const rows = ballInCourtSummary(rfis);
    const eng = rows.find((r) => r.company === "Engineer");
    expect(eng?.count).toBe(2);
    expect(eng?.oldestNumber).toBe("RFI #001"); // older submitted_date
    const gc = rows.find((r) => r.company === "GC");
    expect(gc?.count).toBe(1); // the Closed one is excluded
  });
  it("buckets a null ball_in_court under 'Contractor' and sorts by count desc", () => {
    const rows = ballInCourtSummary(rfis);
    expect(rows[0].company).toBe("Engineer"); // highest count first
    expect(rows.some((r) => r.company === "Contractor")).toBe(true);
  });
  it("reports a finite, non-negative average age", () => {
    const rows = ballInCourtSummary(rfis);
    for (const r of rows) {
      expect(Number.isFinite(r.avgAgeDays)).toBe(true);
      expect(r.avgAgeDays).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("buildRfiSummary", () => {
  const rfis = [
    { id: "1", status: "Open", priority: "Critical", submitted_date: isoOffset(-10), date_required: isoOffset(-2), cost_impact: true, cost_impact_amount: 5000 },
    { id: "2", status: "Under Review", priority: "Medium", submitted_date: isoOffset(-5), date_required: isoOffset(2), schedule_impact: true, schedule_impact_days: 3 },
    { id: "3", status: "Incomplete Response", priority: "High", submitted_date: isoOffset(-8), date_required: isoOffset(20) },
    { id: "4", status: "Answered", priority: "Low", submitted_date: isoOffset(-20), date_answered: isoOffset(-1) },
    { id: "5", status: "Closed", priority: "Low", submitted_date: isoOffset(-30), date_answered: isoOffset(-2) },
  ];
  it("computes the KPI counts from real fields", () => {
    const s = buildRfiSummary(rfis);
    expect(s.total).toBe(5);
    expect(s.needAction).toBe(3); // Open + Under Review + Incomplete Response
    expect(s.overdue).toBe(1); // #1 only (not closed, date_required in past)
    expect(s.incomplete).toBe(1);
    expect(s.critical).toBe(1);
    expect(s.dueSoon).toBe(1); // #2 due in 2d
    expect(s.responseRate).toBe(40); // 2 of 5 answered/closed
    expect(s.costExposure).toBe(5000);
    expect(s.scheduleExposure).toBe(3);
  });
  it("returns a riskQueue and workQueue of open RFIs, hottest first", () => {
    const s = buildRfiSummary(rfis);
    expect(s.riskQueue.length).toBeGreaterThan(0);
    expect(s.riskQueue[0].id).toBe("1"); // overdue critical is hottest
    expect(s.workQueue.length).toBeGreaterThan(0);
    expect(s.ballInCourt).toBeInstanceOf(Array);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module '../rfiControlCenter.derive'`.

- [ ] **Step 3: Write the implementation**

Create `src/pages/rfis/rfiControlCenter.derive.ts`:

```ts
/**
 * Pure derivations for the RFI Control Center (command_ui redesign).
 * No React, no network. Reuses the canonical helpers in ./utils so the
 * redesigned page computes identically to the classic one.
 */
import { daysOpen, isOverdue } from "./utils";

export interface RfiRecord {
  id?: string;
  rfi_number?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  discipline?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  date_required?: string | null;
  date_answered?: string | null;
  cost_impact?: boolean | null;
  cost_impact_amount?: number | null;
  schedule_impact?: boolean | null;
  schedule_impact_days?: number | null;
  [key: string]: unknown;
}

export interface BicSummaryRow {
  company: string;
  count: number;
  oldestNumber: string;
  avgAgeDays: number;
}

export interface RfiSummary {
  total: number;
  open: number;
  needAction: number;
  overdue: number;
  incomplete: number;
  critical: number;
  dueSoon: number;
  responseRate: number;
  costExposure: number;
  scheduleExposure: number;
  riskQueue: RfiRecord[];
  workQueue: RfiRecord[];
  ballInCourt: BicSummaryRow[];
}

const OPEN_STATUSES = new Set(["Open", "Under Review", "Incomplete Response"]);

/** Whole days from today (UTC-midnight basis) until `dateStr`; null if absent/invalid. */
export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

/** Urgency score — copied 1:1 from the classic RfiCommandCenter so both paths rank identically. */
export function riskScore(rfi: RfiRecord): number {
  const age = daysOpen(rfi);
  const due = daysUntil(rfi.date_required);
  let score = age * 4;
  if (isOverdue(rfi)) score += 900;
  if (due !== null && due >= 0 && due <= 3) score += 280;
  if (rfi.status === "Incomplete Response") score += 420;
  if (rfi.status === "Under Review") score += 140;
  if (rfi.priority === "Critical") score += 520;
  if (rfi.priority === "High") score += 230;
  if (rfi.cost_impact) score += 90;
  if (rfi.schedule_impact) score += 90;
  return score;
}

function percent(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

/** Group OPEN rfis by ball-in-court company → count, oldest RFI #, average age. */
export function ballInCourtSummary(rfis: RfiRecord[]): BicSummaryRow[] {
  const groups = new Map<string, RfiRecord[]>();
  for (const rfi of rfis) {
    if (!OPEN_STATUSES.has(rfi.status || "Open")) continue;
    const company = rfi.ball_in_court || "Contractor";
    const bucket = groups.get(company);
    if (bucket) bucket.push(rfi);
    else groups.set(company, [rfi]);
  }
  const rows: BicSummaryRow[] = [];
  for (const [company, members] of groups) {
    let oldest = members[0];
    for (const m of members) {
      if ((m.submitted_date || "") < (oldest.submitted_date || "")) oldest = m;
    }
    const totalAge = members.reduce((sum, m) => sum + daysOpen(m), 0);
    rows.push({
      company,
      count: members.length,
      oldestNumber: oldest.rfi_number || "—",
      avgAgeDays: Math.round(totalAge / members.length),
    });
  }
  return rows.sort((a, b) => b.count - a.count);
}

/** All KPIs + queues + ball-in-court for the RFI Control Center. */
export function buildRfiSummary(rfis: RfiRecord[]): RfiSummary {
  const active = rfis.filter((r) => OPEN_STATUSES.has(r.status || "Open"));
  const overdue = active.filter((r) => isOverdue(r));
  const dueSoon = active.filter((r) => {
    const diff = daysUntil(r.date_required);
    return diff !== null && diff >= 0 && diff <= 3;
  });
  const critical = active.filter((r) => r.priority === "Critical");
  const incomplete = active.filter((r) => r.status === "Incomplete Response");
  const answeredOrClosed = rfis.filter((r) => r.status === "Answered" || r.status === "Closed").length;
  const costExposure = active.reduce((sum, r) => {
    const v = Number(r.cost_impact_amount);
    return r.cost_impact && Number.isFinite(v) ? sum + v : sum;
  }, 0);
  const scheduleExposure = active.reduce((sum, r) => {
    const v = Number(r.schedule_impact_days);
    return r.schedule_impact && Number.isFinite(v) ? sum + v : sum;
  }, 0);
  const byRisk = [...active].sort((a, b) => riskScore(b) - riskScore(a));
  return {
    total: rfis.length,
    open: active.length,
    needAction: active.length,
    overdue: overdue.length,
    incomplete: incomplete.length,
    critical: critical.length,
    dueSoon: dueSoon.length,
    responseRate: percent(answeredOrClosed, rfis.length),
    costExposure,
    scheduleExposure,
    riskQueue: byRisk.slice(0, 5),
    workQueue: byRisk.slice(0, 6),
    ballInCourt: ballInCourtSummary(rfis),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts --maxWorkers=2`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Typecheck the new strict file**

Run: `npm run typecheck:strict 2>&1 | Select-Object -Last 8` and `npm run typecheck:noimplicitany 2>&1 | Select-Object -Last 8`
Expected: both gates still pass (0 enforced errors). The new `.ts` is strict-clean.

- [ ] **Step 6: Commit**

```bash
git add src/pages/rfis/rfiControlCenter.derive.ts src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts
git commit -m "feat(command-ui): RFI Control Center pure derivations + tests" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Skin attribute + launch-tile config

**Files:**
- Create: `src/components/command/useCommandSkin.ts`
- Create: `src/components/command/launchTiles.tsx`

- [ ] **Step 1: Write `useCommandSkin`**

`src/components/command/useCommandSkin.ts` (mirrors `DesktopShell` setting `[data-skin]`):

```ts
import { useEffect } from "react";

/** Sets [data-skin="command"] on <html> while the calling component is mounted. */
export function useCommandSkin(): void {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-skin");
    root.setAttribute("data-skin", "command");
    return () => {
      if (prev) root.setAttribute("data-skin", prev);
      else root.removeAttribute("data-skin");
    };
  }, []);
}
```

- [ ] **Step 2: Write the launch-tile config**

`src/components/command/launchTiles.tsx` (real route paths verified against `src/config/routes.js`):

```tsx
import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Star,
  HelpCircle,
  FileStack,
  CalendarRange,
  FileSignature,
  BarChart3,
  HardHat,
} from "lucide-react";

export interface LaunchTileDef {
  key: string;
  label: string;
  path: string;
  Icon: ComponentType<{ size?: number | string }>;
}

export const LAUNCH_TILES: LaunchTileDef[] = [
  { key: "Dashboard", label: "Dashboard", path: "/Dashboard", Icon: LayoutDashboard },
  { key: "CommandCenter", label: "Command Center", path: "/CommandCenter", Icon: Star },
  { key: "RFIs", label: "RFIs", path: "/RFIs", Icon: HelpCircle },
  { key: "DrawingSubmittalHub", label: "Submittals", path: "/DrawingSubmittalHub", Icon: FileStack },
  { key: "Schedule", label: "Schedule", path: "/Schedule", Icon: CalendarRange },
  { key: "ChangeOrders", label: "Change Orders", path: "/ChangeOrders", Icon: FileSignature },
  { key: "Reports", label: "Reports", path: "/Reports", Icon: BarChart3 },
  { key: "FieldHub", label: "Field Hub", path: "/FieldHub", Icon: HardHat },
];
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | Select-Object -Last 6`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/command/useCommandSkin.ts src/components/command/launchTiles.tsx
git commit -m "feat(command-ui): skin hook + launch-tile config" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Kit primitives (presentational)

**Files:** Create the 6 component files + `index.ts` + `command.css`. These are light-styled, structurally faithful to the mockup; pixel-polish is a field-verify iteration (Task 6).

- [ ] **Step 1: `Pill.tsx`**

```tsx
import type { ReactNode } from "react";

export type PillTone = "neutral" | "good" | "warn" | "danger" | "info" | "review";

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`cmd-pill cmd-pill--${tone}`}>{children}</span>;
}

/** Map an RFI status string to a pill tone. */
export function statusTone(status?: string | null): PillTone {
  switch (status) {
    case "Open": return "warn";
    case "Under Review": return "review";
    case "Incomplete Response": return "danger";
    case "Answered": return "good";
    case "Closed": return "neutral";
    default: return "neutral";
  }
}

/** Map an RFI priority string to a pill tone. */
export function priorityTone(priority?: string | null): PillTone {
  switch (priority) {
    case "Critical": return "danger";
    case "High": return "warn";
    case "Medium": return "info";
    case "Low": return "neutral";
    default: return "neutral";
  }
}
```

- [ ] **Step 2: `KpiStrip.tsx`**

```tsx
import type { ReactNode } from "react";

export type KpiTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface KpiCellDef {
  label: string;
  value: ReactNode;
  sublabel?: string;
  tone?: KpiTone;
}

export function KpiStrip({ groups }: { groups: KpiCellDef[][] }) {
  return (
    <div className="cmd-kpi-strip">
      {groups.map((cells, gi) => (
        <div className="cmd-kpi-group" key={gi}>
          {cells.map((c, ci) => (
            <div className={`cmd-kpi cmd-kpi--${c.tone || "neutral"}`} key={ci}>
              <div className="cmd-kpi__label">{c.label}</div>
              <div className="cmd-kpi__value">{c.value}</div>
              {c.sublabel ? <div className="cmd-kpi__sub">{c.sublabel}</div> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `DecisionPanel.tsx`**

```tsx
import type { ReactNode } from "react";

export function DecisionPanel({
  title,
  onViewAll,
  children,
}: {
  title: string;
  onViewAll?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="cmd-panel">
      <header className="cmd-panel__head">
        <h2 className="cmd-panel__title">{title}</h2>
        {onViewAll ? (
          <button type="button" className="cmd-panel__viewall" onClick={onViewAll}>
            View all
          </button>
        ) : null}
      </header>
      <div className="cmd-panel__body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: `LaunchTileGrid.tsx`**

```tsx
import { useNavigate } from "react-router-dom";
import { LAUNCH_TILES } from "./launchTiles";

export function LaunchTileGrid({ activeKey }: { activeKey?: string }) {
  const navigate = useNavigate();
  return (
    <div className="cmd-tilegrid">
      {LAUNCH_TILES.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`cmd-tile${t.key === activeKey ? " is-active" : ""}`}
          onClick={() => navigate(t.path)}
          title={t.label}
        >
          <t.Icon size={18} />
          <span className="cmd-tile__label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `PageHero.tsx`**

```tsx
import type { ComponentType, ReactNode } from "react";

export interface HeroChip { label: string }

export function PageHero({
  Icon,
  title,
  subtitle,
  projectName,
  chips = [],
  photoSrc,
  children,
}: {
  Icon: ComponentType<{ size?: number | string }>;
  title: string;
  subtitle: string;
  projectName: string;
  chips?: HeroChip[];
  photoSrc?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className="cmd-hero"
      style={photoSrc ? { backgroundImage: `linear-gradient(90deg, var(--cmd-hero-scrim) 0%, rgba(0,0,0,0.25) 100%), url(${photoSrc})` } : undefined}
    >
      <div className="cmd-hero__main">
        <div className="cmd-hero__icon"><Icon size={34} /></div>
        <div>
          <h1 className="cmd-hero__title">{title}</h1>
          <p className="cmd-hero__subtitle">{subtitle}</p>
          <div className="cmd-hero__context">
            <span className="cmd-hero__project">{projectName}</span>
            <span className="cmd-hero__chips">
              {chips.map((c, i) => <span className="cmd-chip" key={i}>{c.label}</span>)}
            </span>
          </div>
        </div>
      </div>
      <div className="cmd-hero__tiles">{children}</div>
    </section>
  );
}
```

- [ ] **Step 6: `FilterBar.tsx`**

```tsx
import type { ReactNode } from "react";
import { Search, Download, Plus } from "lucide-react";

export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = "Search…",
  filters,
  onExport,
  primaryLabel,
  onPrimary,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  onExport?: () => void;
  primaryLabel?: string;
  onPrimary?: (() => void) | null;
}) {
  return (
    <div className="cmd-filterbar">
      <div className="cmd-search">
        <Search size={15} />
        <input
          className="cmd-search__input"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
        />
      </div>
      <div className="cmd-filterbar__filters">{filters}</div>
      <div className="cmd-filterbar__actions">
        {onExport ? (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}>
            <Download size={14} /> Export
          </button>
        ) : null}
        {primaryLabel && onPrimary ? (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={onPrimary}>
            <Plus size={14} /> {primaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `DataTable.tsx`**

```tsx
import type { ReactNode } from "react";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  render: (row: Row) => ReactNode;
}

export function DataTable<Row extends { id?: string }>({
  columns,
  rows,
  onRowClick,
  emptyMessage = "No rows.",
}: {
  columns: Column<Row>[];
  rows: Row[];
  onRowClick?: (row: Row) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="cmd-table-wrap">
      <table className="cmd-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || "left" }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="cmd-table__empty" colSpan={columns.length}>{emptyMessage}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id || i}
                className={onRowClick ? "is-clickable" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || "left" }}>{c.render(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8: `index.ts` barrel**

```ts
export { PageHero } from "./PageHero";
export { LaunchTileGrid } from "./LaunchTileGrid";
export { KpiStrip } from "./KpiStrip";
export type { KpiCellDef, KpiTone } from "./KpiStrip";
export { DecisionPanel } from "./DecisionPanel";
export { Pill, statusTone, priorityTone } from "./Pill";
export type { PillTone } from "./Pill";
export { FilterBar } from "./FilterBar";
export { DataTable } from "./DataTable";
export type { Column } from "./DataTable";
export { useCommandSkin } from "./useCommandSkin";
export { LAUNCH_TILES } from "./launchTiles";
```

- [ ] **Step 9: `src/styles/command.css` (first-pass light tokens + styles)**

Create `src/styles/command.css`. Every rule scoped under `[data-skin="command"]`:

```css
/* Command UI — light-default design system. Scoped under [data-skin="command"]
   so it never touches the classic SteelBuild Dark app. Pixel-polish to the
   mockup happens in the field-verify loop. */
[data-skin="command"] {
  --cmd-bg: #f4f6f9;
  --cmd-surface: #ffffff;
  --cmd-border: #e2e6ec;
  --cmd-text: #1c2430;
  --cmd-text-muted: #65707e;
  --cmd-gold: #d7a928;
  --cmd-good: #1f9d57;
  --cmd-warn: #c9810b;
  --cmd-danger: #d23b35;
  --cmd-info: #2f6fd0;
  --cmd-review: #6b54c8;
  --cmd-hero-scrim: rgba(8, 14, 22, 0.82);
  background: var(--cmd-bg);
  color: var(--cmd-text);
}
[data-skin="command"] .rfi-cc { display: flex; flex-direction: column; gap: 16px; padding: 16px; }

/* Hero */
[data-skin="command"] .cmd-hero { display: flex; justify-content: space-between; gap: 24px; padding: 28px; border-radius: 14px; background-size: cover; background-position: center; color: #fff; }
[data-skin="command"] .cmd-hero__main { display: flex; gap: 18px; align-items: flex-start; }
[data-skin="command"] .cmd-hero__icon { opacity: 0.92; }
[data-skin="command"] .cmd-hero__title { font-size: 30px; font-weight: 700; margin: 0; }
[data-skin="command"] .cmd-hero__subtitle { margin: 4px 0 12px; max-width: 520px; color: rgba(255,255,255,0.82); font-size: 14px; }
[data-skin="command"] .cmd-hero__context { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
[data-skin="command"] .cmd-hero__project { font-weight: 600; }
[data-skin="command"] .cmd-chip { padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,0.16); font-size: 12px; margin-right: 6px; }
[data-skin="command"] .cmd-hero__tiles { flex-shrink: 0; }

/* Launch tiles */
[data-skin="command"] .cmd-tilegrid { display: grid; grid-template-columns: repeat(4, 64px); gap: 8px; }
[data-skin="command"] .cmd-tile { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; background: rgba(10,16,24,0.55); color: #fff; cursor: pointer; font-size: 10px; }
[data-skin="command"] .cmd-tile.is-active { border-color: var(--cmd-gold); }
[data-skin="command"] .cmd-tile__label { white-space: nowrap; }

/* KPI strip */
[data-skin="command"] .cmd-kpi-strip { display: flex; gap: 12px; background: var(--cmd-surface); border: 1px solid var(--cmd-border); border-radius: 12px; padding: 16px; }
[data-skin="command"] .cmd-kpi-group { display: flex; gap: 12px; flex: 1; }
[data-skin="command"] .cmd-kpi-group + .cmd-kpi-group { border-left: 1px solid var(--cmd-border); padding-left: 12px; }
[data-skin="command"] .cmd-kpi { flex: 1; min-width: 90px; }
[data-skin="command"] .cmd-kpi__label { font-size: 11px; color: var(--cmd-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
[data-skin="command"] .cmd-kpi__value { font-size: 26px; font-weight: 700; line-height: 1.1; }
[data-skin="command"] .cmd-kpi__sub { font-size: 11px; color: var(--cmd-text-muted); }
[data-skin="command"] .cmd-kpi--good .cmd-kpi__value { color: var(--cmd-good); }
[data-skin="command"] .cmd-kpi--warn .cmd-kpi__value { color: var(--cmd-warn); }
[data-skin="command"] .cmd-kpi--danger .cmd-kpi__value { color: var(--cmd-danger); }
[data-skin="command"] .cmd-kpi--info .cmd-kpi__value { color: var(--cmd-info); }

/* Decision panels row */
[data-skin="command"] .cmd-panels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
[data-skin="command"] .cmd-panel { background: var(--cmd-surface); border: 1px solid var(--cmd-border); border-radius: 12px; }
[data-skin="command"] .cmd-panel__head { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--cmd-border); }
[data-skin="command"] .cmd-panel__title { font-size: 14px; font-weight: 700; margin: 0; }
[data-skin="command"] .cmd-panel__viewall { background: none; border: none; color: var(--cmd-info); cursor: pointer; font-size: 12px; }
[data-skin="command"] .cmd-panel__body { padding: 8px 16px 14px; }
[data-skin="command"] .cmd-row { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px solid var(--cmd-border); cursor: pointer; }
[data-skin="command"] .cmd-row:first-child { border-top: none; }
[data-skin="command"] .cmd-row__num { font-weight: 700; }
[data-skin="command"] .cmd-row__meta { font-size: 12px; color: var(--cmd-text-muted); }

/* Pills */
[data-skin="command"] .cmd-pill { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; }
[data-skin="command"] .cmd-pill--neutral { background: #eef1f5; color: #4a5560; }
[data-skin="command"] .cmd-pill--good { background: #e3f5ea; color: var(--cmd-good); }
[data-skin="command"] .cmd-pill--warn { background: #fdf1dc; color: var(--cmd-warn); }
[data-skin="command"] .cmd-pill--danger { background: #fae4e3; color: var(--cmd-danger); }
[data-skin="command"] .cmd-pill--info { background: #e6effb; color: var(--cmd-info); }
[data-skin="command"] .cmd-pill--review { background: #ece8fb; color: var(--cmd-review); }

/* Filter bar + buttons */
[data-skin="command"] .cmd-filterbar { display: flex; gap: 10px; align-items: center; background: var(--cmd-surface); border: 1px solid var(--cmd-border); border-radius: 12px; padding: 10px 12px; }
[data-skin="command"] .cmd-search { display: flex; align-items: center; gap: 6px; flex: 0 1 320px; padding: 6px 10px; border: 1px solid var(--cmd-border); border-radius: 8px; color: var(--cmd-text-muted); }
[data-skin="command"] .cmd-search__input { border: none; outline: none; width: 100%; background: transparent; color: var(--cmd-text); font-size: 13px; }
[data-skin="command"] .cmd-filterbar__filters { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
[data-skin="command"] .cmd-filterbar__actions { display: flex; gap: 8px; }
[data-skin="command"] .cmd-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--cmd-border); background: var(--cmd-surface); color: var(--cmd-text); }
[data-skin="command"] .cmd-btn--primary { background: var(--cmd-gold); border-color: var(--cmd-gold); color: #20160a; }
[data-skin="command"] .cmd-btn--ghost { background: transparent; }
[data-skin="command"] .cmd-chip-btn { padding: 5px 11px; border-radius: 999px; border: 1px solid var(--cmd-border); background: var(--cmd-surface); color: var(--cmd-text-muted); cursor: pointer; font-size: 12px; }
[data-skin="command"] .cmd-chip-btn.is-active { background: var(--cmd-gold); border-color: var(--cmd-gold); color: #20160a; }

/* Table */
[data-skin="command"] .cmd-table-wrap { background: var(--cmd-surface); border: 1px solid var(--cmd-border); border-radius: 12px; overflow: auto; }
[data-skin="command"] .cmd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
[data-skin="command"] .cmd-table th { text-align: left; padding: 10px 14px; color: var(--cmd-text-muted); font-weight: 600; border-bottom: 1px solid var(--cmd-border); white-space: nowrap; }
[data-skin="command"] .cmd-table td { padding: 11px 14px; border-bottom: 1px solid var(--cmd-border); }
[data-skin="command"] .cmd-table tr.is-clickable { cursor: pointer; }
[data-skin="command"] .cmd-table tr.is-clickable:hover td { background: #f7f9fc; }
[data-skin="command"] .cmd-table__empty { text-align: center; color: var(--cmd-text-muted); padding: 32px; }
[data-skin="command"] .cmd-overdue { color: var(--cmd-danger); font-weight: 600; }
```

- [ ] **Step 10: Build to verify the kit compiles and CSS is valid**

Run: `npm run typecheck 2>&1 | Select-Object -Last 6` then `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 8`
Expected: typecheck PASS; build succeeds (`✓ built`).

- [ ] **Step 11: Commit**

```bash
git add src/components/command/ src/styles/command.css
git commit -m "feat(command-ui): light-first kit primitives + scoped command.css" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Compose the RFI Control Center page

**Files:**
- Create: `src/pages/rfis/RfiControlCenter.tsx`

- [ ] **Step 1: Write the component**

`src/pages/rfis/RfiControlCenter.tsx`:

```tsx
import { useMemo } from "react";
import { HelpCircle } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, LaunchTileGrid, KpiStrip, DecisionPanel, Pill, statusTone, priorityTone,
  FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { buildRfiSummary } from "./rfiControlCenter.derive";
import type { RfiRecord } from "./rfiControlCenter.derive";
import { daysOpen, isOverdue } from "./utils";

const DISCIPLINES = ["All", "Structural", "Connections", "Misc Metals", "Anchor Bolts"];

function fmtMoney(n: number): string { return n ? `$${n.toLocaleString()}` : "$0"; }
function dueCell(rfi: RfiRecord): JSX.Element {
  if (!rfi.date_required) return <span className="cmd-row__meta">No due date</span>;
  if (isOverdue(rfi)) return <span className="cmd-overdue">{rfi.date_required} · overdue</span>;
  return <span>{rfi.date_required}</span>;
}

export interface RfiControlCenterProps {
  projectName: string;
  rfis: RfiRecord[];
  filtered: RfiRecord[];
  search: string;
  onSearch: (v: string) => void;
  disciplineFilter: string;
  onDisciplineChange: (v: string) => void;
  onOpenRfi: (rfi: RfiRecord) => void;
  onExport: () => void;
  onCreate?: (() => void) | null;
}

export default function RfiControlCenter(props: RfiControlCenterProps) {
  const { projectName, rfis, filtered, search, onSearch, disciplineFilter, onDisciplineChange, onOpenRfi, onExport, onCreate } = props;
  useCommandSkin();
  const s = useMemo(() => buildRfiSummary(rfis), [rfis]);

  const kpiGroups: KpiCellDef[][] = [
    [
      { label: "Need Action", value: s.needAction, sublabel: "RFIs", tone: "warn" },
      { label: "Overdue", value: s.overdue, sublabel: "RFIs", tone: s.overdue ? "danger" : "neutral" },
      { label: "Incomplete", value: s.incomplete, sublabel: "RFIs", tone: s.incomplete ? "danger" : "neutral" },
      { label: "Critical", value: s.critical, sublabel: "RFIs", tone: s.critical ? "danger" : "neutral" },
    ],
    [
      { label: "Response Rate", value: `${s.responseRate}%`, sublabel: "answered/closed", tone: "good" },
      { label: "Cost Exposure", value: fmtMoney(s.costExposure), sublabel: "active impact", tone: s.costExposure ? "warn" : "neutral" },
      { label: "Schedule Impact", value: `${s.scheduleExposure}d`, sublabel: "active impact", tone: s.scheduleExposure ? "warn" : "neutral" },
    ],
  ];

  const columns: Column<RfiRecord>[] = [
    { key: "num", header: "RFI #", render: (r) => <span className="cmd-row__num">{r.rfi_number || "—"}</span> },
    { key: "subject", header: "Subject", render: (r) => r.title || "Untitled RFI" },
    { key: "discipline", header: "Discipline", render: (r) => r.discipline || "—" },
    { key: "status", header: "Status", render: (r) => <Pill tone={statusTone(r.status)}>{r.status || "Open"}</Pill> },
    { key: "priority", header: "Priority", render: (r) => <Pill tone={priorityTone(r.priority)}>{r.priority || "—"}</Pill> },
    { key: "bic", header: "Ball in Court", render: (r) => r.ball_in_court || "Contractor" },
    { key: "age", header: "Age", align: "right", render: (r) => `${daysOpen(r)}d` },
    { key: "due", header: "Response Due", render: dueCell },
    { key: "cost", header: "Cost Exposure", align: "right", render: (r) => (r.cost_impact && r.cost_impact_amount ? fmtMoney(Number(r.cost_impact_amount)) : "—") },
  ];

  const chips = [
    { label: `${s.total} Total` },
    { label: `${s.open} Open` },
    { label: `${s.overdue} Overdue` },
  ];

  return (
    <div className="rfi-cc">
      <PageHero Icon={HelpCircle} title="RFI Control Center" subtitle="Manage unresolved questions, drive timely responses, and prevent fabrication delays." projectName={projectName} chips={chips}>
        <LaunchTileGrid activeKey="RFIs" />
      </PageHero>

      <KpiStrip groups={kpiGroups} />

      <div className="cmd-panels">
        <DecisionPanel title="RFI Work Queue">
          {s.workQueue.map((r) => (
            <div className="cmd-row" key={r.id} onClick={() => onOpenRfi(r)}>
              <div>
                <div className="cmd-row__num">{r.rfi_number || "RFI"}</div>
                <div className="cmd-row__meta">{r.title || "Untitled RFI"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Pill tone={priorityTone(r.priority)}>{r.priority || "—"}</Pill>
                <span className="cmd-row__meta">{daysOpen(r)}d</span>
              </div>
            </div>
          ))}
          {s.workQueue.length === 0 ? <div className="cmd-row__meta">Nothing in the queue.</div> : null}
        </DecisionPanel>

        <DecisionPanel title="Ball-in-Court">
          {s.ballInCourt.map((b) => (
            <div className="cmd-row" key={b.company}>
              <div className="cmd-row__num">{b.company}</div>
              <div className="cmd-row__meta">{b.count} open · oldest {b.oldestNumber} · avg {b.avgAgeDays}d</div>
            </div>
          ))}
          {s.ballInCourt.length === 0 ? <div className="cmd-row__meta">No open RFIs.</div> : null}
        </DecisionPanel>

        <DecisionPanel title="Highest-Risk RFIs">
          {s.riskQueue.map((r) => (
            <div className="cmd-row" key={r.id} onClick={() => onOpenRfi(r)}>
              <div>
                <div className="cmd-row__num">{r.rfi_number || "RFI"}</div>
                <div className="cmd-row__meta">{r.ball_in_court || "Contractor"}</div>
              </div>
              <Pill tone={isOverdue(r) ? "danger" : "neutral"}>{isOverdue(r) ? "Late" : `${daysOpen(r)}d`}</Pill>
            </div>
          ))}
          {s.riskQueue.length === 0 ? <div className="cmd-row__meta">No active RFIs.</div> : null}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search RFI number, title, drawing, question, or answer"
        onExport={onExport}
        primaryLabel="New RFI"
        onPrimary={onCreate || null}
        filters={
          <>
            {DISCIPLINES.map((d) => (
              <button key={d} type="button" className={`cmd-chip-btn${disciplineFilter === d ? " is-active" : ""}`} onClick={() => onDisciplineChange(d)}>{d}</button>
            ))}
          </>
        }
      />

      <DataTable columns={columns} rows={filtered} onRowClick={onOpenRfi} emptyMessage="No RFIs match your filters." />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the new strict file**

Run: `npm run typecheck:strict 2>&1 | Select-Object -Last 8` and `npm run typecheck:noimplicitany 2>&1 | Select-Object -Last 8`
Expected: both PASS. (If `JSX.Element` import is flagged, add `import type { JSX } from "react";` — React 18 provides the `JSX` global, so it should resolve without it.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/rfis/RfiControlCenter.tsx
git commit -m "feat(command-ui): RfiControlCenter page composition" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the flag branch into `RFIs.jsx`

**Files:**
- Modify: `src/pages/RFIs.jsx`

- [ ] **Step 1: Add imports**

At the top of `src/pages/RFIs.jsx`, after the existing imports (near line 47), add:

```jsx
import { useFlag } from "@/hooks/useFeatureFlag";
import RfiControlCenter from "./rfis/RfiControlCenter";
```

- [ ] **Step 2: Read the flag**

Inside `export default function RFIs() {`, after `const { can } = usePermissions();` (line 79), add:

```jsx
  const commandUi = useFlag("command_ui");
```

- [ ] **Step 3: Branch the render**

Replace the existing `return (` block's opening so that when `commandUi` is true the new page renders, while the modals stay shared. Specifically, after the loading guard (line 405) and `const activeProjectName = ...` (line 407), insert the new branch BEFORE the existing `return (`:

```jsx
  if (commandUi) {
    return (
      <div
        className="rfi-page"
        style={{ "--density-row-height": `${densityPreset.rowHeight}px`, "--rfi-row-grid": RFI_ROW_GRID }}
      >
        <RfiControlCenter
          projectName={activeProjectName}
          rfis={rfis}
          filtered={filtered}
          search={search}
          onSearch={setSearch}
          disciplineFilter={disciplineFilter}
          onDisciplineChange={setDisciplineFilter}
          onOpenRfi={setSelectedRFI}
          onExport={() => exportRFIsToCSV(filtered)}
          onCreate={can("create", "rfi") ? () => { setEditingRFI(null); setShowForm(true); } : null}
        />
        {modals}
      </div>
    );
  }
```

- [ ] **Step 4: Extract the shared `modals` fragment**

The modal block (the JSX from `<RfiDetailModal ...>` through the second `<DeleteDialog ...>` at the end of the current return, lines ~597–717) is needed by BOTH paths. Lift it into a `const modals = ( ... )` declared just before the `if (commandUi)` branch, then render `{modals}` in place of that block in the existing (flag-off) return. Move the JSX verbatim — do not change any handler. Example shape:

```jsx
  const modals = (
    <>
      <RfiDetailModal /* ...all existing props verbatim... */ />
      <NudgeDraftModal /* ... */ />
      <RfiLogImportModal /* ... */ />
      {showForm && (<RFIFormModal /* ... */ />)}
      <DeleteDialog /* delete-target ... */ />
      <DeleteDialog /* bulk-delete ... */ />
    </>
  );
```

In the existing flag-off `return`, replace the inline modal block (and the `<RfiBulkEditModal>` that precedes it) appropriately so the classic path renders `{modals}` once. Keep `<RfiBulkEditModal>` in the flag-off branch only (bulk-edit is not part of the new slice).

- [ ] **Step 5: Lint + typecheck:js (RFIs.jsx is JS)**

Run: `npm run lint 2>&1 | Select-Object -Last 8` and `npm run typecheck:js 2>&1 | Select-Object -Last 8`
Expected: both PASS (no unused vars, no broken refs).

- [ ] **Step 6: Build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 8`
Expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/RFIs.jsx
git commit -m "feat(command-ui): branch RFI page to RfiControlCenter behind command_ui flag" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Full validation + field-verify handoff + deploy

**Files:** none (validation + deploy).

- [ ] **Step 1: Run the FULL validation ladder**

```
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npx vitest run --maxWorkers=2
node ./node_modules/vite/bin/vite.js build
```
Each with `Write-Host "EXIT: $LASTEXITCODE"`. Expected: all green; vitest passes (existing RFI tests unchanged + the new derive tests). The `.env.local` placeholder (CI values) must exist in the worktree for vitest/build.

- [ ] **Step 2: Seed the flag (owner-only) via Supabase MCP**

Insert the flag row (mirrors `desktop_shell`):

```sql
insert into feature_flags (flag_key, enabled, description, user_overrides)
values ('command_ui', false,
        'Light-default Command UI redesign (RFI Control Center vertical slice).',
        '{"nickl@shsteelaz.com": true}'::jsonb)
on conflict (flag_key) do update set user_overrides = excluded.user_overrides;
```

- [ ] **Step 3: Deploy (CI-gated)**

Merge `claude/command-ui-rfi` into `main` (or push a verified merge SHA `<sha>:main` — never `HEAD:main`), watch `gh run watch <id>`. Confirm `ci` + `deploy` jobs green and prod returns 200.

- [ ] **Step 4: Field-verify (owner-driven — REQUIRED before "done")**

Owner signs in as `nickl@shsteelaz.com` (flag already on), opens RFIs, and confirms: hero + tiles render; KPI numbers match the project's real RFI data; the three panels populate; the table lists/filters/searches correctly; clicking a row opens the RFI detail; Export downloads CSV; New RFI opens the form and creates. Note any visual gaps vs the mockup → pixel-polish iteration on `command.css`. Until the owner confirms, label the slice **code-verified, NOT field-verified**.

---

## Self-Review

**Spec coverage:** kit primitives (Task 2–3) ✓ · light-default scoped theming (Task 3 Step 9) ✓ · RFI page + data mapping (Task 1, 4) ✓ · flag-branch behavior-preserving wiring (Task 5) ✓ · flag seed owner-only (Task 6 Step 2) ✓ · validation + field-verify (Task 6) ✓ · no schema change (confirmed — derivations only) ✓. Non-goals respected: no new sidebar shell, no dark theme, no global flip, no mutation changes.

**Placeholder scan:** No "TBD/implement later." Task 5 Step 4 references the existing modal JSX "verbatim" rather than reprinting ~120 lines of `RFIs.jsx` — this is a faithful move of code the implementer is already editing in-file, not an invented placeholder; the surrounding steps give exact insertion points and line ranges.

**Type consistency:** `RfiRecord`/`RfiSummary`/`BicSummaryRow` defined in Task 1 and imported in Task 4. `Column`, `KpiCellDef`, `PillTone`, `statusTone`, `priorityTone` defined in Task 3 and consumed in Task 4. `useFlag` signature matches `useFeatureFlag.ts`. `buildRfiSummary`/`ballInCourtSummary`/`riskScore`/`daysUntil` names consistent between Task 1 definition, tests, and Task 4 usage. `exportRFIsToCSV`/`daysOpen`/`isOverdue` reused from the verified `utils.js` exports.
