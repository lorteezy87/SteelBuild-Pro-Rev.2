# Detailing Control Center — Sub-project 1 (Foundation + Control Board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the light Command-UI shell (hero + KPI strip + on-skin tab nav) for the Detailing Control Center behind `command_ui`, and convert the default **Control Board** (`overview`) tab onto the kit, behavior-preserving, with un-converted tabs rendered legibly in a non-skinned region.

**Architecture:** `DrawingSubmittalHub.tsx` stays the data owner; when `command_ui` is on it renders a new presentation-only `DrawingSubmittalControlCenter` fed by the existing read-models (`triage`, `drawingKpis`, `kpis`, `fabReady`) + the same handlers. The Control Center scopes `[data-skin="command"]` to its own wrapper (not `<html>`) so converted content is a light island while legacy tabs render outside it. A scoped **token-alias block** maps the app's theme CSS vars to the kit's light tokens, so the Control Board's heavy bespoke sub-sections render light without a full rewrite.

**Tech Stack:** Vite + React + TypeScript, TanStack Query (untouched here), the `src/components/command/` kit (`PageHero`/`KpiStrip`/`DecisionPanel`/`DataTable`/`Pill`/`FilterBar`), `src/styles/command.css`, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-30-detailing-control-center-reskin-design.md`

---

## Pre-flight (once, before Task 1)

- [ ] **P1. Branch from latest origin/main in an isolated worktree.**

Run:
```bash
git fetch origin
git worktree add ../sbp-command-ui-detailing -b claude/command-ui-detailing origin/main
cd ../sbp-command-ui-detailing
```
(Windows/local equivalent: `git worktree add C:\dev\sbp-command-ui-detailing -b claude/command-ui-detailing origin/main`.)

- [ ] **P2. Claim the files in AGENT_CLAIMS.md** (a parallel dark-theme effort touches the same area). Add one row:
```
2026-06-30 · <session> · detailing command_ui re-skin SP1 · src/pages/DrawingSubmittalHub.tsx, src/pages/drawingSubmittalHub/*, src/styles/command.css · re-skin Control Board onto command kit
```
Commit just that file:
```bash
git add AGENT_CLAIMS.md
git commit -m "chore: claim detailing command_ui re-skin SP1"
```

- [ ] **P3. Confirm baseline green** so later failures are attributable:
```bash
npx vitest run src/pages/drawingSubmittalHub --maxWorkers=2 2>&1 | tail -30
```
Expected: existing detailing tests PASS (or none present). Note the count.

---

## Task 1: Pure derivations — `drawingControlCenter.derive.ts` (TDD)

Reshapes the **already-computed** read-models into kit-shaped props. No React, no network, no recomputation. This is the only logic-bearing file in SP1 and is fully unit-tested.

**Files:**
- Create: `src/pages/drawingSubmittalHub/drawingControlCenter.derive.ts`
- Test: `src/pages/drawingSubmittalHub/__tests__/drawingControlCenter.derive.test.ts`

Input shapes (already produced by `DrawingSubmittalHub.tsx`, verified):
- `drawingKpis`: `{ totalSets, totalSheets, released, inReview, overdue }` (all numbers).
- `kpis`: `{ total, pending, rejected, … }` (from `useSubmittals`).
- `fabReady`: `{ numerator, denominator, percent }`.
- `triage`: `{ overdue[], dueSoon[], needsAction[], noDate[], openItems[], pipelineCounts, overdueDrawingSets, overdueUnlinkedSubmittals, dueSoonDrawingSets, noDateDrawingSets, atRiskCount, … }` where each item is a `TriageItem` (see `./types.ts`).

- [ ] **Step 1: Write the failing test.**

Create `src/pages/drawingSubmittalHub/__tests__/drawingControlCenter.derive.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  buildDetailingKpiCells,
  buildDetailingHeroChips,
  buildControlBoardModel,
} from "../drawingControlCenter.derive";

const drawingKpis = { totalSets: 12, totalSheets: 240, released: 4, inReview: 5, overdue: 3 };
const kpis = { total: 18, pending: 7, rejected: 2 };
const fabReady = { numerator: 4, denominator: 12, percent: 33 };

function item(over: Partial<any> = {}) {
  return {
    id: over.id || "set-x",
    kind: over.kind || "Drawing Set",
    title: over.title || "Main Steel - IFC",
    group: "10 sheets - Submittal 3",
    status: over.status || "OFA",
    owner: over.owner || "Detailer",
    dueDate: over.dueDate ?? "2026-06-01",
    due: over.due || { label: "5d late", days: -5, overdue: true, dueSoon: false, tone: "x", sort: -5 },
    closed: false,
    needsAction: !!over.needsAction,
    routeTab: "drawings",
    _submittalId: "sub1", _drawingSetId: "ds1", _firstSheetId: "sh1", _sheetIds: ["sh1"],
    ...over,
  };
}

const triage = {
  overdue: [item({ id: "a", due: { overdue: true, dueSoon: false, sort: -5 } })],
  dueSoon: [item({ id: "b", due: { overdue: false, dueSoon: true, sort: 2 } })],
  needsAction: [item({ id: "c", needsAction: true })],
  noDate: [item({ id: "d", dueDate: null })],
  openItems: [item({ id: "a" }), item({ id: "b" })],
  pipelineCounts: { OFA: 3, IFA: 2, BFA: 1 },
  overdueDrawingSets: 1, overdueUnlinkedSubmittals: 0,
  dueSoonDrawingSets: 1, noDateDrawingSets: 1, atRiskCount: 2,
};

describe("buildDetailingKpiCells", () => {
  it("produces 7 cells with the right values + tones", () => {
    const cells = buildDetailingKpiCells({ drawingKpis, kpis, fabReady, triage });
    expect(cells).toHaveLength(7);
    expect(cells[0]).toMatchObject({ label: "Drawing Sets", value: 12, tone: "neutral" });
    expect(cells[1]).toMatchObject({ label: "Sets Released", value: 4, tone: "good" });
    expect(cells[5]).toMatchObject({ label: "Overdue", value: 1, tone: "danger" });
    expect(cells[6]).toMatchObject({ label: "Fab Ready", value: "4/12", tone: "good" });
  });

  it("uses neutral tone for zero-valued attention KPIs", () => {
    const cells = buildDetailingKpiCells({
      drawingKpis, kpis: { ...kpis, rejected: 0 }, fabReady,
      triage: { ...triage, overdue: [] },
    });
    expect(cells[4]).toMatchObject({ label: "Needs Action", value: 0, tone: "neutral" });
    expect(cells[5]).toMatchObject({ label: "Overdue", value: 0, tone: "neutral" });
  });
});

describe("buildDetailingHeroChips", () => {
  it("maps the four header signals to toned chips", () => {
    const chips = buildDetailingHeroChips({ triage, drawingKpis, unlinkedCount: 0 });
    expect(chips.map((c) => c.label)).toEqual([
      "1 Overdue", "2 At Risk", "5 In Review", "0 Unlinked",
    ]);
    expect(chips[0].tone).toBe("danger");
    expect(chips[3].tone).toBe("neutral"); // 0 → neutral, not warn
  });
});

describe("buildControlBoardModel", () => {
  it("selects the focus item by urgency (overdue first) and caps queues", () => {
    const model = buildControlBoardModel(triage);
    expect(model.focusItem?.id).toBe("a");
    expect(model.topStatuses[0]).toEqual(["OFA", 3]);
    expect(model.criticalItems.length).toBeGreaterThan(0);
    expect(model.dueSoon.length).toBeLessThanOrEqual(8);
    expect(model.noDate.length).toBeLessThanOrEqual(8);
  });

  it("returns a null focus item when nothing is flagged", () => {
    const empty = { ...triage, overdue: [], dueSoon: [], needsAction: [], noDate: [] };
    const model = buildControlBoardModel(empty as any);
    expect(model.focusItem).toBeNull();
    expect(model.criticalItems).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails.**

Run: `npx vitest run src/pages/drawingSubmittalHub/__tests__/drawingControlCenter.derive.test.ts --maxWorkers=2`
Expected: FAIL — "Failed to resolve import … drawingControlCenter.derive".

- [ ] **Step 3: Write the implementation.**

Create `src/pages/drawingSubmittalHub/drawingControlCenter.derive.ts`:
```ts
/**
 * Pure derivations for the Detailing Control Center (command_ui re-skin, SP1).
 * No React, no network — reshapes the hub's already-computed read-models into
 * Command-UI kit props. Mirrors deliveryControlCenter.derive.ts.
 */
import type { KpiCellDef, KpiTone, HeroChip } from "@/components/command";
import { itemUrgency } from "./format";
import type { TriageItem } from "./types";

interface DrawingKpis { totalSets: number; totalSheets: number; released: number; inReview: number; overdue: number }
interface SubmittalKpis { total: number; pending: number; rejected: number }
interface FabReady { numerator: number; denominator: number; percent: number }

interface TriageModel {
  overdue: TriageItem[]; dueSoon: TriageItem[]; needsAction: TriageItem[]; noDate: TriageItem[];
  openItems: TriageItem[]; pipelineCounts: Record<string, number>;
  overdueDrawingSets: number; overdueUnlinkedSubmittals: number;
  dueSoonDrawingSets: number; noDateDrawingSets: number; atRiskCount: number;
}

/** Tone helper: a count KPI is `tone` when non-zero, `neutral` when zero. */
function countTone(value: number, tone: KpiTone): KpiTone {
  return value > 0 ? tone : "neutral";
}

/** The 7 KPI cells, identical values to the legacy KpiTile strip. */
export function buildDetailingKpiCells({
  drawingKpis, kpis, fabReady, triage,
}: { drawingKpis: DrawingKpis; kpis: SubmittalKpis; fabReady: FabReady; triage: TriageModel }): KpiCellDef[] {
  return [
    { label: "Drawing Sets", value: drawingKpis.totalSets, sublabel: `${drawingKpis.totalSheets} active sheets`, tone: "neutral" },
    { label: "Sets Released", value: drawingKpis.released, sublabel: "terminal", tone: "good" },
    { label: "Sets In Review", value: drawingKpis.inReview, sublabel: "IFA–IFC", tone: "info" },
    { label: "Submittals", value: kpis.total, sublabel: `${kpis.pending} pending`, tone: "neutral" },
    { label: "Needs Action", value: kpis.rejected, sublabel: "rejected / R&R", tone: countTone(kpis.rejected, "warn") },
    { label: "Overdue", value: triage.overdue.length, sublabel: `${triage.overdueDrawingSets} sets · ${triage.overdueUnlinkedSubmittals} subs`, tone: countTone(triage.overdue.length, "danger") },
    { label: "Fab Ready", value: `${fabReady.numerator}/${fabReady.denominator}`, sublabel: `${fabReady.percent}% released`, tone: "good" },
  ];
}

/** The four header signals as toned hero chips. */
export function buildDetailingHeroChips({
  triage, drawingKpis, unlinkedCount,
}: { triage: TriageModel; drawingKpis: DrawingKpis; unlinkedCount: number }): HeroChip[] {
  const tone = (n: number, t: HeroChip["tone"]): HeroChip["tone"] => (n > 0 ? t : "neutral");
  return [
    { label: `${triage.overdue.length} Overdue`, tone: tone(triage.overdue.length, "danger") },
    { label: `${triage.atRiskCount} At Risk`, tone: tone(triage.atRiskCount, "warn") },
    { label: `${drawingKpis.inReview} In Review`, tone: tone(drawingKpis.inReview, "info") },
    { label: `${unlinkedCount} Unlinked`, tone: tone(unlinkedCount, "warn") },
  ];
}

export interface ControlBoardModel {
  focusItem: TriageItem | null;
  criticalItems: TriageItem[];
  dueSoon: TriageItem[];
  noDate: TriageItem[];
  topStatuses: [string, number][];
  openCount: number;
}

/** Focus item + capped queues for the Control Board panel. Pure reshaping. */
export function buildControlBoardModel(triage: TriageModel): ControlBoardModel {
  const focusItem = triage.overdue[0] || triage.dueSoon[0] || triage.needsAction[0] || triage.noDate[0] || null;
  const criticalItems = Array.from(
    new Map(
      [...triage.overdue, ...triage.needsAction, ...triage.dueSoon]
        .sort(itemUrgency)
        .map((it) => [it.id, it]),
    ).values(),
  ).slice(0, 12);
  const topStatuses = Object.entries(triage.pipelineCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 6) as [string, number][];
  return {
    focusItem,
    criticalItems,
    dueSoon: triage.dueSoon.slice(0, 8),
    noDate: triage.noDate.slice(0, 8),
    topStatuses,
    openCount: triage.openItems.length,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes.**

Run: `npx vitest run src/pages/drawingSubmittalHub/__tests__/drawingControlCenter.derive.test.ts --maxWorkers=2`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Typecheck the new file (strict + no-implicit-any clean).**

Run: `npm run typecheck:strict 2>&1 | tail -20 && npm run typecheck:noimplicitany 2>&1 | tail -20`
Expected: no new errors referencing `drawingControlCenter.derive.ts`.

- [ ] **Step 6: Commit.**
```bash
git add src/pages/drawingSubmittalHub/drawingControlCenter.derive.ts src/pages/drawingSubmittalHub/__tests__/drawingControlCenter.derive.test.ts
git commit -m "feat(detailing): pure Control Center derivations (SP1)"
```

---

## Task 2: Scoped CSS — token alias + `cmd-tabs` + control-board classes

Adds three blocks to `command.css`, all under `[data-skin="command"]` so nothing leaks to the classic app.

**Files:**
- Modify: `src/styles/command.css` (append a new section at end of file)

- [ ] **Step 1: Append the token-alias + tab-nav + control-board block.**

Append to `src/styles/command.css`:
```css
/* ===========================================================================
   Detailing Control Center (command_ui re-skin, SP1)
   =========================================================================== */

/* (a) Token alias — map the classic app's theme CSS vars to the kit's light
   tokens, scoped to the command island. Lets the detailing module's existing
   inline-styled bespoke sub-sections (Sequence Readiness, Model Mapping,
   Revision Impact) render light + legible without a full rewrite. Only affects
   elements INSIDE [data-skin="command"]; legacy tabs render outside it. */
[data-skin="command"] {
  --text-primary: var(--cmd-text);
  --text-secondary: #3a4452;
  --text-muted: var(--cmd-text-muted);
  --bg-page: var(--cmd-bg);
  --bg-surface: var(--cmd-surface);
  --bg-surface-low: var(--cmd-surface);
  --bg-surface-high: #f7f9fc;
  --bg-input: var(--cmd-surface);
  --border-default: var(--cmd-border);
  --border: var(--cmd-border);
  --accent: var(--cmd-gold);
  --status-success: var(--cmd-good);
  --status-warning: var(--cmd-warn);
  --status-error: var(--cmd-danger);
  --status-info: var(--cmd-info);
  --status-review: var(--cmd-review);
}
/* Light treatment for the legacy .sbd-* controls that appear in the island. */
[data-skin="command"] .sbd-btn,
[data-skin="command"] .sbd-btn-ghost {
  background: var(--cmd-surface); border: 1px solid var(--cmd-border); color: var(--cmd-text);
}
[data-skin="command"] .sbd-btn-primary {
  background: var(--cmd-gold); border: 1px solid var(--cmd-gold); color: #20160a;
}
[data-skin="command"] .sbd-badge-info {
  background: #e6effb; color: var(--cmd-info); border: 1px solid #cfe0f8;
}

/* (b) Tab nav — the kit has no tabs primitive. Reusable by every later slice. */
[data-skin="command"] .cmd-tabs {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
  padding: 6px; margin-bottom: 14px;
  background: var(--cmd-surface); border: 1px solid var(--cmd-border); border-radius: 12px;
}
[data-skin="command"] .cmd-tab {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 40px; padding: 8px 13px; border-radius: 9px;
  border: 1px solid transparent; background: transparent;
  color: var(--cmd-text-muted); font-size: 12px; font-weight: 600; cursor: pointer;
}
[data-skin="command"] .cmd-tab:hover { background: #f1f4f8; color: var(--cmd-text); }
[data-skin="command"] .cmd-tab:focus-visible { outline: 2px solid var(--cmd-gold); outline-offset: 2px; }
[data-skin="command"] .cmd-tab.is-active {
  background: #fdf3da; border-color: var(--cmd-gold); color: var(--cmd-text);
}
[data-skin="command"] .cmd-tab__count {
  padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 700;
  background: #eef1f5; color: var(--cmd-text-muted);
}
[data-skin="command"] .cmd-tab.is-active .cmd-tab__count { background: var(--cmd-gold); color: #20160a; }

/* (c) Control Board layout helpers. */
[data-skin="command"] .cmd-cc { display: flex; flex-direction: column; gap: 14px; padding: 16px; background: var(--cmd-bg); color: var(--cmd-text); min-height: 100%; }
[data-skin="command"] .cmd-legacy-region { /* non-skin sibling lives outside; this is the skinned-region content wrap */ }
[data-skin="command"] .cmd-cb-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
[data-skin="command"] .cmd-cb-queues { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: 14px; }
[data-skin="command"] .cmd-cb-editors { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
@media (max-width: 680px) {
  [data-skin="command"] .cmd-cb-editors { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Verify the classic app is untouched (no leak).**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -20 && echo "EXIT: $?"`
Expected: build succeeds, EXIT 0. (All new rules are under `[data-skin="command"]`; with the flag off and the attribute unset, none apply.)

- [ ] **Step 3: Commit.**
```bash
git add src/styles/command.css
git commit -m "feat(detailing): scoped token-alias + cmd-tabs + control-board CSS (SP1)"
```

---

## Task 3: `DrawingSubmittalControlCenter.tsx` — light shell

Presentation-only. Renders `PageHero` + `KpiStrip` + the `cmd-tabs` nav, then **two regions**: the skinned region (shell + the active tab if converted) and a **non-skinned sibling** (`<div>` with no `data-skin`) hosting legacy tab content. SP1 converts only `overview`; all other tabs flow through the legacy region.

**Files:**
- Create: `src/pages/drawingSubmittalHub/DrawingSubmittalControlCenter.tsx`

- [ ] **Step 1: Write the component.**

Create `src/pages/drawingSubmittalHub/DrawingSubmittalControlCenter.tsx`:
```tsx
/**
 * DrawingSubmittalControlCenter — presentation-only Command-UI skin for the
 * Detailing Control Center (command_ui re-skin, SP1). The container
 * (DrawingSubmittalHub.tsx) owns all data, mutations, and state.
 *
 * Scoped skin: [data-skin="command"] is set on THIS wrapper (not <html>) so
 * converted content renders in a light island while un-converted tabs render
 * in a sibling region with no data-skin (graceful degradation, spec §4.4).
 */
import { useEffect, type ComponentType, type ReactNode } from "react";
import "@/styles/command.css";
import { FileStack } from "lucide-react";
import { PageHero, KpiStrip } from "@/components/command";
import type { KpiCellDef, HeroChip } from "@/components/command";

export interface DetailingTabDef { key: string; label: string; icon: ComponentType<{ size?: number | string }> }

export interface DrawingSubmittalControlCenterProps {
  projectName?: string;
  subtitle: string;
  heroChips: HeroChip[];
  kpiCells: KpiCellDef[];
  tabs: DetailingTabDef[];
  tabCounts: Record<string, number>;
  activeTab: string;
  onTabChange: (key: string) => void;
  /** True when `activeTab` is converted to the kit — its content goes in the
   *  light island. False → it renders in the non-skinned legacy region. */
  isActiveTabConverted: boolean;
  /** The active tab's content (converted panel OR legacy component). */
  children: ReactNode;
  /** Optional hero action (e.g. Lead Times button). */
  heroAction?: ReactNode;
}

export default function DrawingSubmittalControlCenter({
  projectName, subtitle, heroChips, kpiCells, tabs, tabCounts,
  activeTab, onTabChange, isActiveTabConverted, children, heroAction,
}: DrawingSubmittalControlCenterProps) {
  // Skin is scoped to the wrapper below; ensure it is removed from <html> if a
  // prior page set it (defensive — converted siblings rely on local scoping).
  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute("data-skin") === "command") {
      // leave html-level skin to pages that own it; we scope locally instead.
    }
  }, []);

  const nav = (
    <div className="cmd-tabs" role="tablist" aria-label="Detailing views">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            className={`cmd-tab${isActive ? " is-active" : ""}`}
            onClick={() => onTabChange(tab.key)}
          >
            <Icon size={14} />
            <span>{tab.label}</span>
            <span className="cmd-tab__count">{tabCounts[tab.key] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="dsh-cc-root">
      {/* Light island: hero + KPI + tab nav + the active tab IF converted. */}
      <div className="cmd-cc" data-skin="command">
        <PageHero
          Icon={FileStack}
          title="Drawing & Submittal Control"
          subtitle={subtitle}
          projectName={projectName}
          chips={heroChips}
        >
          {heroAction}
        </PageHero>
        <KpiStrip cells={kpiCells} />
        {nav}
        {isActiveTabConverted && children}
      </div>

      {/* Non-skinned sibling: legacy (un-converted) tab content renders in the
          app's normal theme so it stays legible during the transition. */}
      {!isActiveTabConverted && <div className="dsh-cc-legacy">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck.**

Run: `npm run typecheck:strict 2>&1 | tail -20`
Expected: no errors referencing `DrawingSubmittalControlCenter.tsx`.

- [ ] **Step 3: Commit.**
```bash
git add src/pages/drawingSubmittalHub/DrawingSubmittalControlCenter.tsx
git commit -m "feat(detailing): Control Center light shell + tab nav (SP1)"
```

---

## Task 4: `ControlBoardPanel.tsx` — the converted `overview` tab

On-skin Control Board. Uses `DecisionPanel`/`DataTable`/`Pill` for the triage queues + Next Decision, fed by `buildControlBoardModel`. The four inline editors are reproduced on-skin preserving the **exact** callback contracts (`onUpdateOwner`, `onUpdateDueDate`, `onAdvanceDetailing`, `onToggleReadiness`). The three heavy analytical sub-sections (Sequence Readiness, 3D Model Mapping, Revision Impact) are rendered by the **existing** `TriageBoard` sub-section components, which become light automatically via the Task 2 token alias — so SP1 preserves them without a rewrite.

> **Decomposition note:** This task is the largest in SP1. Build and field-verify it section-by-section, in this order: (4a) triage-metric row → (4b) queues → (4c) Next Decision card + inline editors → (4d) analytical sub-sections passthrough. Run build + typecheck after each; commit per section.

**Files:**
- Create: `src/pages/drawingSubmittalHub/ControlBoardPanel.tsx`
- Modify: `src/pages/drawingSubmittalHub/components.tsx` — `export` the three analytical sub-section components and the four inline controls (see Step 1).

- [ ] **Step 1 (prep): Export the reusable sub-sections + inline controls from `components.tsx`.**

In `src/pages/drawingSubmittalHub/components.tsx`, add `export` to these existing function declarations (they are currently module-private): `SequenceReadinessSection`, `ModelMappingSection`, `RevisionImpactSection`, `InlineOwnerControl`, `InlineDateControl`, `InlineDetailingControl`, `ReadinessPanel`. Do not change their bodies. (They read theme tokens via CSS vars → the Task-2 alias makes them light inside the island.)

Run: `npm run typecheck:strict 2>&1 | tail -20` → no new errors.
Commit:
```bash
git add src/pages/drawingSubmittalHub/components.tsx
git commit -m "refactor(detailing): export Control Board sub-sections for kit reuse (SP1)"
```

- [ ] **Step 2 (4a + 4b): Write the panel scaffold — metric row + queues.**

Create `src/pages/drawingSubmittalHub/ControlBoardPanel.tsx`:
```tsx
/**
 * ControlBoardPanel — the on-skin Detailing Control Board (overview tab).
 * Presentation-only; fed by the hub's read-models + handlers. Renders inside
 * the command light island (DrawingSubmittalControlCenter).
 */
import { ArrowRight, FileQuestion, CircleDollarSign } from "lucide-react";
import { DecisionPanel, Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import { buildControlBoardModel } from "./drawingControlCenter.derive";
import {
  SequenceReadinessSection, ModelMappingSection, RevisionImpactSection,
  InlineOwnerControl, InlineDateControl, InlineDetailingControl, ReadinessPanel,
} from "./components";
import type { TriageItem } from "./types";

type EscalationKind = "rfi" | "pco";

export interface ControlBoardPanelProps {
  triage: any;
  kpis: any;
  drawingKpis: any;
  sequenceReadiness: any[];
  revisionImpact: any[];
  modelMapping?: any;
  modelElementRows?: any[];
  isSaving: boolean;
  onOpenTab: (key: string) => void;
  onUpdateOwner: (item: TriageItem, owner: string) => void;
  onUpdateDueDate: (item: TriageItem, date: string) => void;
  onAdvanceDetailing: (item: TriageItem, next: string) => void;
  onToggleReadiness: (item: TriageItem, field: string, value: boolean) => void;
  onEscalate?: (item: TriageItem, kind: EscalationKind) => void;
  onCompareRevision?: (drawingId: string) => void;
  onImportModelElements?: () => void;
}

/** Map a triage item's due/action state to a Pill tone. */
function itemTone(item: TriageItem): PillTone {
  if (item.due?.overdue) return "danger";
  if (item.needsAction) return "review";
  if (item.due?.dueSoon) return "warn";
  return "neutral";
}

function QueueRow({ item, onOpenTab }: { item: TriageItem; onOpenTab: (k: string) => void }) {
  return (
    <div className="cmd-row is-clickable" onClick={() => onOpenTab(item.routeTab)}>
      <div>
        <div className="cmd-row__num">{item.title}</div>
        <div className="cmd-row__meta">{item.group} · {item.owner}</div>
      </div>
      <Pill tone={itemTone(item)}>{item.due?.label || item.status}</Pill>
    </div>
  );
}

export default function ControlBoardPanel(props: ControlBoardPanelProps) {
  const {
    triage, kpis, drawingKpis, sequenceReadiness, revisionImpact, modelMapping, modelElementRows,
    isSaving, onOpenTab, onUpdateOwner, onUpdateDueDate, onAdvanceDetailing, onToggleReadiness,
    onEscalate, onCompareRevision, onImportModelElements,
  } = props;
  const model = buildControlBoardModel(triage);
  const focus = model.focusItem;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* (4c) Next Decision — the focus item + inline editors */}
      <DecisionPanel title="Next decision">
        {!focus ? (
          <div className="cmd-row__meta">No overdue, due-soon, action, or missing-date work is flagged.</div>
        ) : (
          <>
            <div className="cmd-row__num" style={{ fontSize: 15 }}>{focus.title}</div>
            <div className="cmd-row__meta" style={{ marginBottom: 8 }}>{focus.group} · {focus.status}</div>
            <div className="cmd-cb-editors">
              <InlineOwnerControl currentOwner={focus.owner} onAssign={(o: string) => onUpdateOwner(focus, o)} disabled={isSaving} />
              <InlineDateControl currentDate={focus.dueDate} isOverdue={focus.due?.overdue} onSetDate={(d: string) => onUpdateDueDate(focus, d)} disabled={isSaving} />
            </div>
            {focus.kind === "Drawing Set" && focus._canDraft && (
              <InlineDetailingControl current={focus._detailingStateRaw} onAdvance={(n: string) => onAdvanceDetailing(focus, n)} disabled={isSaving} />
            )}
            {focus.kind === "Drawing Set" && focus._readiness && (
              <ReadinessPanel readiness={focus._readiness} onToggle={(f: string, v: boolean) => onToggleReadiness(focus, f, v)} disabled={isSaving} />
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => onOpenTab(focus.routeTab)}>
                Open Work <ArrowRight size={14} />
              </button>
              {onEscalate && (
                <>
                  <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => onEscalate(focus, "rfi")}>
                    <FileQuestion size={13} /> Draft RFI
                  </button>
                  <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => onEscalate(focus, "pco")}>
                    <CircleDollarSign size={13} /> Draft PCO
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </DecisionPanel>

      {/* (4a) Metric row */}
      <div className="cmd-cb-metrics">
        {([
          ["Overdue Sets", triage.overdueDrawingSets, "danger"],
          ["Due This Week", triage.dueSoonDrawingSets, "warn"],
          ["Needs Action", triage.needsAction.length, "review"],
          ["Missing Dates", triage.noDateDrawingSets, "neutral"],
          ["Pending Review", kpis.pending, "warn"],
        ] as [string, number, PillTone][]).map(([label, value, tone]) => (
          <div key={label} className="cmd-kpi">
            <div className="cmd-kpi__value">{value}</div>
            <div className="cmd-kpi__label">{label}</div>
          </div>
        ))}
      </div>

      {/* (4b) Queues */}
      <div className="cmd-cb-queues">
        <DecisionPanel title="Critical Work Queue" onViewAll={() => onOpenTab("matrix")}>
          {model.criticalItems.length === 0
            ? <div className="cmd-row__meta">No critical work is currently queued.</div>
            : model.criticalItems.map((it) => <QueueRow key={it.id} item={it} onOpenTab={onOpenTab} />)}
        </DecisionPanel>
        <DecisionPanel title="Pipeline">
          {model.topStatuses.length === 0
            ? <div className="cmd-row__meta">No open items.</div>
            : model.topStatuses.map(([status, count]) => (
              <div className="cmd-row" key={status}>
                <div className="cmd-row__num">{status}</div>
                <Pill tone="neutral">{count}</Pill>
              </div>
            ))}
        </DecisionPanel>
      </div>

      <div className="cmd-cb-queues">
        <DecisionPanel title="Due Next 7 Days">
          {model.dueSoon.length === 0
            ? <div className="cmd-row__meta">No due dates in the next week.</div>
            : model.dueSoon.map((it) => <QueueRow key={it.id} item={it} onOpenTab={onOpenTab} />)}
        </DecisionPanel>
        <DecisionPanel title="Missing Due Dates">
          {model.noDate.length === 0
            ? <div className="cmd-row__meta">All open items have due dates.</div>
            : model.noDate.map((it) => <QueueRow key={it.id} item={it} onOpenTab={onOpenTab} />)}
        </DecisionPanel>
      </div>

      {/* (4d) Analytical sub-sections — existing components, light via token alias */}
      <SequenceReadinessSection rows={sequenceReadiness} />
      {onImportModelElements && (
        <ModelMappingSection summary={modelMapping} elements={modelElementRows} onImport={onImportModelElements} />
      )}
      <RevisionImpactSection rows={revisionImpact} onCompare={onCompareRevision} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build.**

Run: `npm run typecheck:strict 2>&1 | tail -20 && node ./node_modules/vite/bin/vite.js build 2>&1 | tail -15 && echo "EXIT: $?"`
Expected: no errors referencing the new files; build EXIT 0.

- [ ] **Step 4: Commit.**
```bash
git add src/pages/drawingSubmittalHub/ControlBoardPanel.tsx
git commit -m "feat(detailing): on-skin Control Board panel (SP1)"
```

---

## Task 5: Wire the `command_ui` branch into `DrawingSubmittalHub.tsx`

The hub already computes `commandUi`? No — it computes `desktopShell`, `show3d`, `aiDiff`. Add the flag and the branch. Keep all data/mutation logic above the branch unchanged.

**Files:**
- Modify: `src/pages/DrawingSubmittalHub.tsx`

- [ ] **Step 1: Add the flag near the other `useFlag` calls (~line 130).**

Find:
```tsx
  const show3d = useFlag("viewer_3d");
```
Add directly below it:
```tsx
  const commandUi = useFlag("command_ui");
```

- [ ] **Step 2: Add the imports (top of file, with the other page imports).**
```tsx
import DrawingSubmittalControlCenter from "./drawingSubmittalHub/DrawingSubmittalControlCenter";
import ControlBoardPanel from "./drawingSubmittalHub/ControlBoardPanel";
import { buildDetailingKpiCells, buildDetailingHeroChips } from "./drawingSubmittalHub/drawingControlCenter.derive";
```

- [ ] **Step 3: Insert the command branch just before the existing `return (` at line ~682.**

Immediately above `// ── Render ─────` / `return (`, add:
```tsx
  // ── command_ui branch — Detailing Control Center (SP1: shell + Control Board) ──
  if (commandUi) {
    const convertedTabs = new Set(["overview"]);
    const heroAction = (
      <button
        type="button"
        className="sbd-btn-ghost"
        onClick={() => setLeadModalOpen(true)}
        title="Edit the project's detailing lead times"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36 }}
      >
        <CalendarClock size={14} /> Lead Times
      </button>
    );
    const ccContent = activeTab === "overview" ? (
      <ControlBoardPanel
        triage={triage}
        kpis={kpis}
        drawingKpis={drawingKpis}
        sequenceReadiness={sequenceReadiness}
        revisionImpact={revisionImpact}
        modelMapping={modelMappingSummary}
        modelElementRows={modelElements as any[]}
        isSaving={updateOwnerMut.isPending || updateDueDateMut.isPending || updateDetailingStateMut.isPending || updateReadinessFlagMut.isPending}
        onOpenTab={setActiveTab}
        onUpdateOwner={(item, owner) => updateOwnerMut.mutate({ item, owner })}
        onUpdateDueDate={(item, date) => updateDueDateMut.mutate({ item, date })}
        onAdvanceDetailing={(item, next) => updateDetailingStateMut.mutate({ item, next })}
        onToggleReadiness={(item, field, value) => updateReadinessFlagMut.mutate({ item, field, value })}
        onEscalate={canEscalate ? (item: any, kind: EscalationKind) => { setEscalateItem(item); setEscalateKind(kind); } : undefined}
        onCompareRevision={(drawingId: string) => setCompareDrawingId(drawingId)}
        onImportModelElements={() => setImportModelOpen(true)}
      />
    ) : (
      // Legacy tab content — rendered in the non-skinned region (graceful degradation).
      <ErrorBoundary>
        <Suspense fallback={<LoadingSkeleton />}>
          {activeTab === "process" && <SubmittalVisualBoard setPackages={setPackages} submittals={submittals} isLoading={isLoading} onOpenTab={setActiveTab} />}
          {activeTab === "drawings" && (
            <DrawingRegisterTable setPackages={setPackages} projectId={projectId} activeProject={activeProject} drawingSets={drawingSets} isLoading={isLoading} healthByKey={healthByKey} currentRevByDrawingId={currentRevByDrawingId} summariesBySet={summariesBySet} onRevisionUploaded={handleRevisionUploaded} onOpenSummary={setSummaryCard} />
          )}
          {activeTab === "submittals" && <SubmittalsPage />}
          {activeTab === "matrix" && <ApprovalMatrix drawingSets={drawingSets} submittals={submittals as unknown as HubSubmittal[]} roundsBySubmittal={roundsBySubmittal} isLoading={isLoading} />}
          {activeTab === "revimpact" && <RevisionImpactBoard rows={revisionImpactRows} onCompareRevision={(drawingId: string) => setCompareDrawingId(drawingId)} isLoading={isLoading} />}
          {activeTab === "doccontrol" && <DocControlPanel projectId={projectId} />}
          {activeTab === "model3d" && <Model3DTab modelMapping={modelMappingSummary} modelElementRows={modelElements as any[]} projectId={projectId} rosterLoading={modelElementsLoading} />}
        </Suspense>
      </ErrorBoundary>
    );
    return (
      <>
        <DrawingSubmittalControlCenter
          projectName={projectName}
          subtitle="Set-level drawing packages, submittal status, due dates, ownership, and fabrication-release readiness."
          heroChips={buildDetailingHeroChips({ triage, drawingKpis, unlinkedCount: triage.unlinkedSubmittalItems.length })}
          kpiCells={buildDetailingKpiCells({ drawingKpis, kpis, fabReady, triage })}
          tabs={tabs}
          tabCounts={tabCounts}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isActiveTabConverted={convertedTabs.has(activeTab)}
          heroAction={heroAction}
        >
          {ccContent}
        </DrawingSubmittalControlCenter>
        {/* Modals are shared with the classic branch (rendered below in the
            existing return); duplicate the modal block here OR hoist it. */}
        {renderHubModals()}
      </>
    );
  }
```

> **Modal sharing:** the existing modal JSX (lines ~957–1024: `LeadTimesModal`, `EscalateModal`, `RevisionCompareModalLazy`, `ModelElementImportModal`, `RevisionSummaryCard`, `RFIFormModal`, `RevisionDeepDiveModal`) must render in BOTH branches. Extract it into a local `const renderHubModals = () => (<>…</>)` defined above both returns, and call it in each. (Modals will look themed/dark in SP1 — expected, fixed in SP4 per spec §5.5.)

- [ ] **Step 4: Extract the shared modal block.**

Cut the modal JSX (the `{leadModalOpen && …}` through `{deepDiveSet && …}` block) from the classic return into a `renderHubModals` arrow function declared just before the `if (commandUi)` branch, and replace both call sites with `{renderHubModals()}`.

- [ ] **Step 5: Typecheck + build.**

Run: `npm run lint 2>&1 | tail -15 && npm run typecheck:strict 2>&1 | tail -20 && npm run typecheck:noimplicitany 2>&1 | tail -20 && node ./node_modules/vite/bin/vite.js build 2>&1 | tail -15 && echo "EXIT: $?"`
Expected: lint clean, no new type errors, build EXIT 0.

- [ ] **Step 6: Run the full detailing + related suite.**

Run: `npx vitest run src/pages/drawingSubmittalHub src/pages/__tests__ --maxWorkers=2 2>&1 | tail -30`
Expected: PASS — behavior preserved (data layer untouched).

- [ ] **Step 7: Commit.**
```bash
git add src/pages/DrawingSubmittalHub.tsx
git commit -m "feat(detailing): gate Control Center on command_ui — shell + Control Board (SP1)"
```

---

## Task 6: Field-verify + ship

- [ ] **Step 1: Full validation ladder.**

Run, capturing EXIT after each:
```bash
npm run lint; npm run typecheck; npm run typecheck:js; npm run typecheck:strict; npm run typecheck:noimplicitany
npx vitest run --maxWorkers=2 2>&1 | tail -40
node ./node_modules/vite/bin/vite.js build 2>&1 | tail -20; echo "EXIT: $?"
```
Expected: all green, build EXIT 0.

- [ ] **Step 2: Owner field-verify (REQUIRED — moat workflow, CLAUDE.md §32).**

Owner signs in as `nickl@shsteelaz.com` (command_ui is global-ON) and opens the Detailing Control Center. Confirm:
  - Hero + 7 KPI cells render light; **KPI numbers match the legacy hub** side-by-side (toggle `command_ui` off via override to compare if needed).
  - Tab nav switches; the `overview` (Control Board) tab is fully light.
  - Control Board: Next Decision shows the right focus item; **inline owner / due-date / detailing-state / readiness edits persist**; Draft RFI / Draft PCO open; queues + metric row correct; Sequence Readiness / Model Mapping / Revision Impact render light + legible (token alias).
  - Switching to a legacy tab (Drawing Register, etc.) shows the **light shell above a themed legacy panel** — legible, acceptable seam (no dark-text-on-white).
  - iPad width: KPI strip + queues stack; tab nav wraps; touch targets ≥40px; focus rings visible on tab/keyboard nav.
  - Modals (Lead Times, Escalate) open and function (dark styling expected in SP1).

  Until the owner confirms, label SP1 **code-verified, NOT field-verified** with a field-verify TODO.

- [ ] **Step 3: Merge to main + deploy (only on owner go).**

```bash
cd C:\dev\SteelBuild-Pro-Rev.2
git fetch origin && git checkout main && git pull origin main
git merge claude/command-ui-detailing --no-edit
node ./node_modules/vite/bin/vite.js build 2>&1 | tail -15; echo "EXIT: $?"
git push origin main
git rev-parse --short HEAD
```
Push a **verified SHA** (never `HEAD:main`). Watch CI: `gh run watch <id>` / `gh run list --branch main`. CI re-runs the ladder and only deploys on green.

- [ ] **Step 4: Remove the AGENT_CLAIMS.md row** for this session and commit.

---

## Self-review notes (coverage vs spec)

- Spec §5.1 KPI/hero mapping → Task 1 (`buildDetailingKpiCells`/`buildDetailingHeroChips`, tested) + Task 5 wiring. ✅
- Spec §5.2 layout (hero → KPI → zero-state → tab nav → Control Board) → Tasks 3–4. ✅ (zero-state note: carried by the legacy region until SP2; add to the island only if it triggers — low priority, noted.)
- Spec §5.3 behavior-preserving wiring (same handlers/mutations) → Task 5, data layer untouched. ✅
- Spec §4.3 scoped skin + §4.4 two-region graceful degradation → Task 3. ✅
- Spec §4.2 `derive.ts` pure + tested → Task 1. ✅
- Spec §7 a11y (focus rings, aria-current, ≥touch) → Task 2 CSS + Task 3 nav. ✅
- Spec §5.5 modals dark in SP1 → Task 5 note, deferred to SP4. ✅
- `cmd-tabs` reusable primitive (spec §3 SP1 deliverable) → Task 2. ✅

**Known intentional deviation:** the three analytical sub-sections (Sequence Readiness, Model Mapping, Revision Impact) are made light via the **token-alias** strategy (Task 2a) rather than rewritten to `cmd-*` markup. This is a deliberate low-risk SP1 choice; a later polish pass (or the relevant slice — Model Mapping↔3D in SP5, Revision Impact↔SP3) can convert them to native kit markup. Flagged here so it is a conscious decision, not an oversight.
