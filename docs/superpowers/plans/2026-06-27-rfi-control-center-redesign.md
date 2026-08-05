# RFI Control Center Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the RFI page into the new light-default "RFI Control Center" workbench (light hero + KPI cards + 3 decision panels + filter bar + table) behind the `command_ui` flag, behavior-preserving, while extracting the reusable Command UI kit.

**Architecture:** `RFIs.jsx` stays the sole owner of data, mutations, and modals. A new presentation-only `RfiControlCenter.tsx` (built from a new `src/components/command/` kit, styled by `src/styles/command.css` scoped under `[data-skin="command"]`) renders when `useFlag("command_ui")` is true; the classic page renders otherwise. All RFI KPIs/panels/columns derive from a new pure, unit-tested `rfiControlCenter.derive.ts` reusing existing helpers. Zero schema changes.

**Visual source of truth:** the owner's light-theme PNG mockup `06_rfis.png` (module #6). Match it: a **light** hero (white/very-light surface, dark text, optional faint jobsite photo from the right) with `?` icon + title + subtitle + 3 chips on the left and **two compact stat cards on the right** (NO launch-tile grid — the sidebar owns navigation); a row of **7 individual white KPI cards** each with a small colored line-icon, a big colored number, label, and sublabel; then the 3 decision panels, filter bar, and table.

**Tech Stack:** Vite + React 18, TypeScript (strict-null + noImplicitAny CI gates), React Query, `lucide-react`, Vitest. Spec: `docs/superpowers/specs/2026-06-27-rfi-control-center-redesign-design.md`.

**REVISION (2026-06-27, post-mockup):** the owner supplied the real light PNG mockups mid-build. Dropped the dark photo band + `LaunchTileGrid` (not in the light design); `PageHero` is now light with a `stats` slot; `KpiStrip` renders individual white cards with icons. Task 1 (pure derivations) was already merged (`1d031ad3`) and is unaffected.

---

## File Structure

**New files:**
- `src/pages/rfis/rfiControlCenter.derive.ts` — pure derivations. **(Task 1 — DONE)**
- `src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts` — tests. **(Task 1 — DONE)**
- `src/components/command/useCommandSkin.ts` — sets `[data-skin="command"]` while mounted.
- `src/components/command/Pill.tsx` — status/priority/semantic chip.
- `src/components/command/KpiStrip.tsx` — `KpiStrip` + `KpiCell` (white cards w/ icon + colored value).
- `src/components/command/DecisionPanel.tsx` — titled card with optional "View all".
- `src/components/command/PageHero.tsx` — light hero: icon/title/subtitle/chips + right-side stat cards.
- `src/components/command/FilterBar.tsx` — search + filter slot + actions.
- `src/components/command/DataTable.tsx` — generic dense table.
- `src/components/command/index.ts` — barrel.
- `src/styles/command.css` — light-default tokens + component styles, scoped under `[data-skin="command"]`.
- `src/pages/rfis/RfiControlCenter.tsx` — composes the kit + derive into the page.

**Modified:** `src/pages/RFIs.jsx` — flag branch + shared `modals`.

**Untouched:** `RfiCommandCenter.jsx`, `RfiInsightsStrip.jsx`, `RfiRow.jsx`, `utils.js`, all mutations.

**Deferred (called out, not silently dropped):** the hero jobsite-photo bleed (needs a wide hero asset); hero "Project Health / % Complete" project-level cards (a shared-shell concern — the slice shows real RFI-program stats instead); the Work Queue sub-tab strip; additional filter dropdowns; bulk-select checkboxes; dark-secondary theme; the full sidebar shell.

---

## Task 1: Pure derivations + tests — ✅ DONE (`1d031ad3`)

`rfiControlCenter.derive.ts` (`daysUntil`, `riskScore`, `ballInCourtSummary`, `buildRfiSummary` + `RfiRecord`/`BicSummaryRow`/`RfiSummary`) and its tests are implemented and merged; 9/9 tests pass, both typecheck gates clean. No further action.

---

## Task 2: Skin attribute hook

**Files:** Create `src/components/command/useCommandSkin.ts`

- [ ] **Step 1: Write the hook** (mirrors how `DesktopShell` sets `[data-skin]`):

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

- [ ] **Step 2: Typecheck** — `npm run typecheck`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany` (last 6 lines each). All pass.
- [ ] **Step 3: Commit**

```bash
git add src/components/command/useCommandSkin.ts
git commit -m "feat(command-ui): [data-skin=command] mount hook" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Kit primitives (light, mockup-accurate)

**Files:** the 6 component files + `index.ts` + `command.css`. Light-styled to `06_rfis.png`; final pixel-polish is a field-verify iteration (Task 6).

- [ ] **Step 1: `Pill.tsx`**

```tsx
import type { ReactNode } from "react";

export type PillTone = "neutral" | "good" | "warn" | "danger" | "info" | "review";

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`cmd-pill cmd-pill--${tone}`}>{children}</span>;
}

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

- [ ] **Step 2: `KpiStrip.tsx`** (individual white cards, each with an optional icon + colored value + sublabel)

```tsx
import type { ComponentType, ReactNode } from "react";

export type KpiTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface KpiCellDef {
  label: string;
  value: ReactNode;
  sublabel?: string;
  tone?: KpiTone;
  Icon?: ComponentType<{ size?: number | string }>;
}

export function KpiStrip({ cells }: { cells: KpiCellDef[] }) {
  return (
    <div className="cmd-kpi-strip">
      {cells.map((c, i) => (
        <div className={`cmd-kpi cmd-kpi--${c.tone || "neutral"}`} key={i}>
          {c.Icon ? <div className="cmd-kpi__icon"><c.Icon size={18} /></div> : null}
          <div className="cmd-kpi__value">{c.value}</div>
          <div className="cmd-kpi__label">{c.label}</div>
          {c.sublabel ? <div className="cmd-kpi__sub">{c.sublabel}</div> : null}
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
          <button type="button" className="cmd-panel__viewall" onClick={onViewAll}>View all</button>
        ) : null}
      </header>
      <div className="cmd-panel__body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: `PageHero.tsx`** (LIGHT: left content + right stat cards; optional photo)

```tsx
import type { ComponentType, ReactNode } from "react";

export interface HeroChip { label: string; tone?: "neutral" | "good" }
export interface HeroStat { value: ReactNode; label: string }

export function PageHero({
  Icon,
  title,
  subtitle,
  projectName,
  chips = [],
  stats = [],
  photoSrc,
  children,
}: {
  Icon: ComponentType<{ size?: number | string }>;
  title: string;
  subtitle: string;
  projectName: string;
  chips?: HeroChip[];
  stats?: HeroStat[];
  photoSrc?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`cmd-hero${photoSrc ? " cmd-hero--photo" : ""}`} style={photoSrc ? { ["--cmd-hero-photo" as string]: `url(${photoSrc})` } : undefined}>
      <div className="cmd-hero__left">
        <div className="cmd-hero__icon"><Icon size={26} /></div>
        <div>
          <h1 className="cmd-hero__title">{title}</h1>
          <p className="cmd-hero__subtitle">{subtitle}</p>
          <div className="cmd-hero__chips">
            <span className="cmd-hero__project">{projectName}</span>
            {chips.map((c, i) => (
              <span className={`cmd-chip${c.tone === "good" ? " cmd-chip--good" : ""}`} key={i}>{c.label}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="cmd-hero__right">
        {stats.map((s, i) => (
          <div className="cmd-statcard" key={i}>
            <div className="cmd-statcard__value">{s.value}</div>
            <div className="cmd-statcard__label">{s.label}</div>
          </div>
        ))}
        {children}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `FilterBar.tsx`**

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
        <input className="cmd-search__input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} />
      </div>
      <div className="cmd-filterbar__filters">{filters}</div>
      <div className="cmd-filterbar__actions">
        {onExport ? (
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onExport}><Download size={14} /> Export</button>
        ) : null}
        {primaryLabel && onPrimary ? (
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={onPrimary}><Plus size={14} /> {primaryLabel}</button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `DataTable.tsx`**

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
          <tr>{columns.map((c) => <th key={c.key} style={{ textAlign: c.align || "left" }}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="cmd-table__empty" colSpan={columns.length}>{emptyMessage}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.id || i} className={onRowClick ? "is-clickable" : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((c) => <td key={c.key} style={{ textAlign: c.align || "left" }}>{c.render(row)}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: `index.ts` barrel**

```ts
export { PageHero } from "./PageHero";
export type { HeroChip, HeroStat } from "./PageHero";
export { KpiStrip } from "./KpiStrip";
export type { KpiCellDef, KpiTone } from "./KpiStrip";
export { DecisionPanel } from "./DecisionPanel";
export { Pill, statusTone, priorityTone } from "./Pill";
export type { PillTone } from "./Pill";
export { FilterBar } from "./FilterBar";
export { DataTable } from "./DataTable";
export type { Column } from "./DataTable";
export { useCommandSkin } from "./useCommandSkin";
```

- [ ] **Step 8: `src/styles/command.css`** (light, mockup-accurate; every rule scoped under `[data-skin="command"]`)

```css
/* Command UI — light-default design system, matched to 06_rfis.png.
   Scoped under [data-skin="command"] so it never touches the classic dark app. */
[data-skin="command"] {
  --cmd-bg: #f4f6f9;
  --cmd-surface: #ffffff;
  --cmd-border: #e4e8ee;
  --cmd-text: #1b2430;
  --cmd-text-muted: #6b7585;
  --cmd-gold: #d7a928;
  --cmd-good: #1f9d57;
  --cmd-warn: #c9810b;
  --cmd-danger: #d8463d;
  --cmd-info: #2f6fd0;
  --cmd-review: #6b54c8;
  background: var(--cmd-bg);
  color: var(--cmd-text);
}
[data-skin="command"] .rfi-cc { display: flex; flex-direction: column; gap: 14px; padding: 16px; }

/* Hero — light, dark text, optional faint photo from the right */
[data-skin="command"] .cmd-hero { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 22px 24px; border: 1px solid var(--cmd-border); border-radius: 14px; background: var(--cmd-surface); overflow: hidden; }
[data-skin="command"] .cmd-hero--photo::after { content: ""; position: absolute; inset: 0; background: var(--cmd-hero-photo) right center / 55% cover no-repeat; opacity: 0.16; pointer-events: none; }
[data-skin="command"] .cmd-hero--photo::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, var(--cmd-surface) 32%, rgba(255,255,255,0.4) 100%); pointer-events: none; z-index: 1; }
[data-skin="command"] .cmd-hero__left, [data-skin="command"] .cmd-hero__right { position: relative; z-index: 2; }
[data-skin="command"] .cmd-hero__left { display: flex; gap: 14px; align-items: flex-start; }
[data-skin="command"] .cmd-hero__icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #fdf3da; color: var(--cmd-gold); flex-shrink: 0; }
[data-skin="command"] .cmd-hero__title { font-size: 26px; font-weight: 700; margin: 0; color: var(--cmd-text); }
[data-skin="command"] .cmd-hero__subtitle { margin: 3px 0 11px; max-width: 520px; color: var(--cmd-text-muted); font-size: 13px; }
[data-skin="command"] .cmd-hero__chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
[data-skin="command"] .cmd-hero__project { font-weight: 600; font-size: 13px; }
[data-skin="command"] .cmd-chip { padding: 3px 10px; border-radius: 999px; background: #eef1f5; color: var(--cmd-text-muted); font-size: 12px; }
[data-skin="command"] .cmd-chip--good { background: #e3f5ea; color: var(--cmd-good); }
[data-skin="command"] .cmd-hero__right { display: flex; gap: 12px; }
[data-skin="command"] .cmd-statcard { min-width: 96px; padding: 10px 14px; border: 1px solid var(--cmd-border); border-radius: 10px; background: var(--cmd-surface); text-align: center; }
[data-skin="command"] .cmd-statcard__value { font-size: 24px; font-weight: 700; }
[data-skin="command"] .cmd-statcard__label { font-size: 11px; color: var(--cmd-text-muted); }

/* KPI cards — a row of individual white cards */
[data-skin="command"] .cmd-kpi-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; }
[data-skin="command"] .cmd-kpi { background: var(--cmd-surface); border: 1px solid var(--cmd-border); border-radius: 12px; padding: 14px; }
[data-skin="command"] .cmd-kpi__icon { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; background: #f1f4f8; color: var(--cmd-text-muted); margin-bottom: 8px; }
[data-skin="command"] .cmd-kpi__value { font-size: 26px; font-weight: 700; line-height: 1.1; }
[data-skin="command"] .cmd-kpi__label { font-size: 12px; color: var(--cmd-text); margin-top: 2px; }
[data-skin="command"] .cmd-kpi__sub { font-size: 11px; color: var(--cmd-text-muted); }
[data-skin="command"] .cmd-kpi--good .cmd-kpi__value { color: var(--cmd-good); }
[data-skin="command"] .cmd-kpi--good .cmd-kpi__icon { background: #e3f5ea; color: var(--cmd-good); }
[data-skin="command"] .cmd-kpi--warn .cmd-kpi__value { color: var(--cmd-warn); }
[data-skin="command"] .cmd-kpi--warn .cmd-kpi__icon { background: #fdf1dc; color: var(--cmd-warn); }
[data-skin="command"] .cmd-kpi--danger .cmd-kpi__value { color: var(--cmd-danger); }
[data-skin="command"] .cmd-kpi--danger .cmd-kpi__icon { background: #fae4e3; color: var(--cmd-danger); }
[data-skin="command"] .cmd-kpi--info .cmd-kpi__value { color: var(--cmd-info); }
[data-skin="command"] .cmd-kpi--info .cmd-kpi__icon { background: #e6effb; color: var(--cmd-info); }

/* Decision panels */
[data-skin="command"] .cmd-panels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
[data-skin="command"] .cmd-panel { background: var(--cmd-surface); border: 1px solid var(--cmd-border); border-radius: 12px; }
[data-skin="command"] .cmd-panel__head { display: flex; justify-content: space-between; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--cmd-border); }
[data-skin="command"] .cmd-panel__title { font-size: 14px; font-weight: 700; margin: 0; }
[data-skin="command"] .cmd-panel__viewall { background: none; border: none; color: var(--cmd-info); cursor: pointer; font-size: 12px; }
[data-skin="command"] .cmd-panel__body { padding: 6px 16px 12px; }
[data-skin="command"] .cmd-row { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 9px 0; border-top: 1px solid var(--cmd-border); }
[data-skin="command"] .cmd-row.is-clickable { cursor: pointer; }
[data-skin="command"] .cmd-row:first-child { border-top: none; }
[data-skin="command"] .cmd-row__num { font-weight: 700; font-size: 13px; }
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

/* Responsive: stack KPI cards + panels on narrow viewports */
@media (max-width: 1100px) {
  [data-skin="command"] .cmd-kpi-strip { grid-template-columns: repeat(4, 1fr); }
  [data-skin="command"] .cmd-panels { grid-template-columns: 1fr; }
}
@media (max-width: 680px) {
  [data-skin="command"] .cmd-kpi-strip { grid-template-columns: repeat(2, 1fr); }
  [data-skin="command"] .cmd-hero { flex-direction: column; align-items: flex-start; }
}
```

- [ ] **Step 9: Typecheck + build**

Run: `npm run typecheck`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany` (each last 6 lines), then `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 8`. Expected: all gates pass; `✓ built`.

- [ ] **Step 10: Commit**

```bash
git add src/components/command/ src/styles/command.css
git commit -m "feat(command-ui): light kit primitives + scoped command.css (matched to RFI mockup)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Compose the RFI Control Center page

**Files:** Create `src/pages/rfis/RfiControlCenter.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useMemo } from "react";
import { HelpCircle, Clock, FileWarning, AlertTriangle, Gauge, DollarSign, CalendarClock } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, KpiStrip, DecisionPanel, Pill, statusTone, priorityTone,
  FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { buildRfiSummary } from "./rfiControlCenter.derive";
import type { RfiRecord } from "./rfiControlCenter.derive";
import { daysOpen, isOverdue } from "./utils";

const DISCIPLINES = ["All", "Structural", "Connections", "Misc Metals", "Anchor Bolts"];

function fmtMoney(n: number): string { return n ? `$${n.toLocaleString()}` : "$0"; }

function dueCell(rfi: RfiRecord) {
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

  // Real, in-scope hero stats (project-level Health/% Complete come with the shared shell — deferred).
  const avgAge = useMemo(() => {
    const open = rfis.filter((r) => !["Answered", "Closed"].includes(r.status || ""));
    if (!open.length) return 0;
    return Math.round(open.reduce((sum, r) => sum + daysOpen(r), 0) / open.length);
  }, [rfis]);

  const heroStats = [
    { value: s.open, label: "Open RFIs" },
    { value: `${avgAge}d`, label: "Avg Age" },
  ];
  const chips = [
    { label: `${s.total} Total` },
    { label: `${s.open} Open`, tone: "good" as const },
    { label: `${s.overdue} Overdue` },
  ];

  const kpiCells: KpiCellDef[] = [
    { label: "Need Action", value: s.needAction, sublabel: "RFIs", tone: "warn", Icon: HelpCircle },
    { label: "Overdue", value: s.overdue, sublabel: "RFIs", tone: s.overdue ? "danger" : "neutral", Icon: Clock },
    { label: "Incomplete", value: s.incomplete, sublabel: "RFIs", tone: s.incomplete ? "danger" : "neutral", Icon: FileWarning },
    { label: "Critical", value: s.critical, sublabel: "RFIs", tone: s.critical ? "danger" : "neutral", Icon: AlertTriangle },
    { label: "Response Rate", value: `${s.responseRate}%`, sublabel: "answered/closed", tone: "good", Icon: Gauge },
    { label: "Cost Exposure", value: fmtMoney(s.costExposure), sublabel: "active impact", tone: s.costExposure ? "warn" : "neutral", Icon: DollarSign },
    { label: "Schedule Impact", value: `${s.scheduleExposure}d`, sublabel: "active impact", tone: s.scheduleExposure ? "warn" : "info", Icon: CalendarClock },
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

  return (
    <div className="rfi-cc">
      <PageHero
        Icon={HelpCircle}
        title="RFI Control Center"
        subtitle="Track, manage, and resolve RFIs to keep steel fabrication and field work on track."
        projectName={projectName}
        chips={chips}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        <DecisionPanel title="RFI Work Queue">
          {s.workQueue.map((r) => (
            <div className="cmd-row is-clickable" key={r.id} onClick={() => onOpenRfi(r)}>
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
            <div className="cmd-row is-clickable" key={r.id} onClick={() => onOpenRfi(r)}>
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

- [ ] **Step 2: Typecheck (strict)** — `npm run typecheck:strict` + `npm run typecheck:noimplicitany` (last 8 lines each). Both pass. (`JSX` is a React 18 global; if `dueCell`'s return type is flagged, leave the return untyped — TS infers `JSX.Element`.)
- [ ] **Step 3: Commit**

```bash
git add src/pages/rfis/RfiControlCenter.tsx
git commit -m "feat(command-ui): RfiControlCenter page composition (light, matched to mockup)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the flag branch into `RFIs.jsx`

**Files:** Modify `src/pages/RFIs.jsx`

- [ ] **Step 1: Imports** — after the existing imports (~line 47):

```jsx
import { useFlag } from "@/hooks/useFeatureFlag";
import RfiControlCenter from "./rfis/RfiControlCenter";
```

- [ ] **Step 2: Read the flag** — after `const { can } = usePermissions();` (~line 79):

```jsx
  const commandUi = useFlag("command_ui");
```

- [ ] **Step 3: Extract a shared `modals` fragment.** Lift the existing modal block (the JSX from `<RfiBulkEditModal ...>`/`<RfiDetailModal ...>` through the final `<DeleteDialog ...>`, roughly lines 586–717) into a `const modals = ( <> ... </> );` declared just after `const activeProjectName = ...` (~line 407). Move it **verbatim** — do not change any prop or handler. Then in the existing flag-off `return`, render `{modals}` where that block used to be.

- [ ] **Step 4: Branch the render** — immediately after `const activeProjectName = ...` and the `modals` declaration, before the existing `return (`:

```jsx
  if (commandUi) {
    return (
      <div className="rfi-page" style={{ "--density-row-height": `${densityPreset.rowHeight}px`, "--rfi-row-grid": RFI_ROW_GRID }}>
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

- [ ] **Step 5: Lint + typecheck:js** — `npm run lint` and `npm run typecheck:js` (last 8 lines each). Both pass (no unused vars, no broken refs). If `RfiBulkEditModal` ends up referenced only in the flag-off branch, that's fine.
- [ ] **Step 6: Build** — `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 8`. Expected `✓ built`.
- [ ] **Step 7: Commit**

```bash
git add src/pages/RFIs.jsx
git commit -m "feat(command-ui): branch RFI page to RfiControlCenter behind command_ui flag" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Full validation + flag seed + deploy + field-verify

- [ ] **Step 1: FULL validation ladder** — `npm run lint`, `npm run typecheck`, `npm run typecheck:js`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany`, `npx vitest run --maxWorkers=2`, `node ./node_modules/vite/bin/vite.js build` (each with `Write-Host "EXIT: $LASTEXITCODE"`). All green; the `.env.local` placeholder must exist in the worktree.
- [ ] **Step 2: Seed the flag (owner-only) via Supabase MCP**

```sql
insert into feature_flags (flag_key, enabled, description, user_overrides)
values ('command_ui', false,
        'Light-default Command UI redesign (RFI Control Center vertical slice).',
        '{"nickl@shsteelaz.com": true}'::jsonb)
on conflict (flag_key) do update set user_overrides = excluded.user_overrides;
```

- [ ] **Step 3: Deploy (CI-gated)** — merge `claude/command-ui-rfi` into `main` (push a verified merge SHA `<sha>:main`, never `HEAD:main`), watch `gh run watch <id>`. Confirm `ci` + `deploy` green and prod 200.
- [ ] **Step 4: Field-verify (owner-driven — REQUIRED before "done")** — owner signs in as `nickl@shsteelaz.com` (flag on), opens RFIs, confirms hero + KPI cards + 3 panels + table render against real data; row click opens detail; Export + New RFI work; compare to `06_rfis.png` and note pixel gaps for a polish pass. Until confirmed, label **code-verified, NOT field-verified**.

---

## Self-Review

**Spec/mockup coverage:** light hero + stat cards (Task 3 Step 4, Task 4) ✓ · 7 white KPI cards with icons (Task 3 Step 2, Task 4) ✓ · 3 panels + filter bar + table (Task 4) ✓ · scoped light CSS (Task 3 Step 8) ✓ · behavior-preserving flag branch (Task 5) ✓ · flag owner-only (Task 6) ✓ · no schema change ✓ · launch tiles dropped (matches mockup) ✓.

**Placeholder scan:** none. Task 5 Step 3 moves existing modal JSX "verbatim" (a faithful in-file lift, not an invented placeholder) with exact line ranges. Deferred items (hero photo, project-level hero cards, sub-tabs, extra filters, bulk-select) are explicitly listed, not silently dropped.

**Type consistency:** `RfiRecord`/`RfiSummary` (Task 1) imported in Task 4. `Column`, `KpiCellDef`, `HeroChip`, `HeroStat`, `PillTone`, `statusTone`, `priorityTone` defined in Task 3, consumed in Task 4. `KpiStrip` takes `cells` (array) — consistent between Task 3 def and Task 4 use. `PageHero` takes `chips`/`stats` — consistent. `useFlag` matches `useFeatureFlag.ts`. Helpers `daysOpen`/`isOverdue`/`exportRFIsToCSV` reused from verified `utils.js`.
