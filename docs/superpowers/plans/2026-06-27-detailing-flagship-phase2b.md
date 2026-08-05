# Detailing Control Center Flagship Rebuild (Phase 2B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Detailing Control Center (`DrawingSubmittalHub`) presentation onto the Phase 2A module kit — photo `ModuleHeader`, `SectionCard`s, kit `DataTable` styling — proving the kit on the moat screen, **without changing any data, logic, mutations, query keys, tabs, or RLS**.

**Architecture:** Behavior-preserving PRESENTATION re-house. All computed data objects (`triage`, `readinessByKey`, `revisionImpact`, `healthByKey`, `modelMappingSummary`), the `?hub_tab=` tab routing, the inline mutations, the dual register codepaths, and lazy tabs stay exactly as they are. We only change the JSX that *frames* them. New header is **flag-branched**: `ModuleHeader` (kit, desktop skin) when `desktop_shell` is on; the existing `CommandBar`+KPI strip+tab bar unchanged when off — so non-flag users see zero change.

**Tech Stack:** React 18 + TS, the Phase 2A kit (`@/components/desktop/module`), `useFlag`, Vitest + @testing-library/react. No new deps. No domain-logic changes.

**Spec:** `docs/superpowers/specs/2026-06-27-module-design-language-phase2-design.md`
**Prereq:** Plan 2A (the kit) is merged into branch `claude/desktop-redesign` (it is).

**Re-house methodology (read this first):** Re-housing existing JSX means **wrapping current markup in kit components**, not rewriting it. For the deeper groups, each task names the exact file + region + the kit wrapper to apply, shows the wrapper usage, and requires the implementer to **read the current JSX and wrap it verbatim** (move the existing children inside the wrapper; do not alter their logic/props). After every task: run the hub tests + build. This keeps a 3,600-line hub safe.

---

## Conventions (every task)
- Windows PowerShell; vitest `--maxWorkers=2`. Branch `claude/desktop-redesign`; no push.
- Stage only the explicit files per task; never `git add -A`.
- The hub tests that MUST stay green after every task: `src/__tests__/components/DrawingSubmittalHub.test.jsx`, `src/__tests__/components/DrawingRegisterTable.test.jsx`, `src/pages/drawingSubmittalHub/__tests__/format.test.ts`.
- Behavior-preservation rule: do NOT edit any `useMemo`/`useQuery`/mutation/handler/computed value or any file under `drawingSubmittalHub/` except to wrap JSX. If a task seems to require a logic change, STOP and report.
- A PostToolUse SQL-linter hook prints a harmless error on writes — ignore it.

## File structure
Modified:
- `src/pages/DrawingSubmittalHub.tsx` — header region (Group A) + overview/matrix/revimpact tab JSX wrapping (Groups B, D).
- `src/pages/drawingSubmittalHub/components.tsx` — wrap `TriageBoard` sections (Group B) and `DrawingRegisterTable` (Group C) in kit components.
Created:
- `src/pages/drawingSubmittalHub/__tests__/moduleHeader.integration.test.jsx` — flag-branch header test (Group A).

---

## GROUP A — Photo ModuleHeader (flag-branched)

### Task A1: Import the kit + add the flag

**Files:** Modify `src/pages/DrawingSubmittalHub.tsx`

- [ ] **Step 1:** Near the existing imports (after the other `@/components` imports), add:
```tsx
import { ModuleHeader } from "@/components/desktop/module";
```
(The hub already imports `useFlag` — confirm; it reads `viewer_3d`/`revision_ai_diff`. If `useFlag` is imported, reuse it; otherwise add `import { useFlag } from "@/hooks/useFeatureFlag";`.)

- [ ] **Step 2:** In the component body, near the other `useFlag` calls, add:
```tsx
const desktopShell = useFlag("desktop_shell");
```

- [ ] **Step 3:** Build to confirm imports resolve: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 8` (EXIT 0).

- [ ] **Step 4:** Commit:
```powershell
git add src/pages/DrawingSubmittalHub.tsx
git commit -m "feat(detailing): import module kit + desktop_shell flag into hub" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A2: Flag-branch the header — ModuleHeader when desktop_shell on

**Files:** Modify `src/pages/DrawingSubmittalHub.tsx` (the `CommandBar` block, lines ~690-731)

The current `CommandBar` (lines ~690-731) renders title/eyebrow + four `HeaderSignal`s (Overdue/At Risk/In Review/Unlinked) + a Lead Times button. Wrap it so the new `ModuleHeader` renders when the flag is on, and the **existing `CommandBar` block stays byte-identical** when off.

- [ ] **Step 1:** Replace the `CommandBar` element (the whole `<CommandBar ...> ... </CommandBar>`, lines ~690-731) with:
```tsx
{desktopShell ? (
  <ModuleHeader
    page="DrawingSubmittalHub"
    title="Drawing & Submittal Control"
    subtitle={projectName ? `Detailing control · ${projectName}` : "Detailing control"}
    stats={[
      { label: "Overdue", value: triage.overdue.length, tone: triage.overdue.length ? "danger" : "neutral" },
      { label: "At Risk", value: triage.atRiskCount, tone: triage.atRiskCount ? "amber" : "neutral" },
      { label: "In Review", value: drawingKpis.inReview, tone: drawingKpis.inReview ? "blue" : "neutral" },
      { label: "Unlinked", value: triage.unlinkedSubmittalItems.length, tone: triage.unlinkedSubmittalItems.length ? "amber" : "neutral" },
    ]}
    actions={
      <button type="button" className="sbd-btn-ghost" onClick={() => setLeadModalOpen(true)}
        title="Edit the project's detailing lead times (drives the backward schedule)"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32 }}>
        <CalendarClock size={14} /> Lead Times
      </button>
    }
  />
) : (
  <CommandBar
    eyebrow={projectName ? `Detailing control - ${projectName}` : "Detailing control"}
    title="Drawing & Submittal Control"
    count={drawingKpis.totalSets}
    unit={` sets | ${drawingKpis.totalSheets} sheets`}
    subtitle="Set-level drawing packages, submittal status, due dates, ownership, and fabrication-release readiness."
  >
    <HeaderSignal icon={AlertTriangle} label="Overdue" value={triage.overdue.length} tone={triage.overdue.length ? error : success} />
    <HeaderSignal icon={CalendarClock} label="At Risk" value={triage.atRiskCount} tone={triage.atRiskCount ? warning : success} />
    <HeaderSignal icon={Gauge} label="In Review" value={drawingKpis.inReview} tone={drawingKpis.inReview > 0 ? info : textMuted} />
    <HeaderSignal icon={Link2} label="Unlinked" value={triage.unlinkedSubmittalItems.length} tone={triage.unlinkedSubmittalItems.length ? warning : textMuted} />
    <button type="button" className="sbd-btn-ghost" onClick={() => setLeadModalOpen(true)}
      title="Edit the project's detailing lead times (drives the backward schedule)"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36 }}>
      <CalendarClock size={14} /> Lead Times
    </button>
  </CommandBar>
)}
```
(The 8-tile KPI strip, zero-state note, and tab bar below stay exactly as-is — the in-page KPI strip complements the header's 4 signal stats.)

- [ ] **Step 2:** Write the flag-branch test — create `src/pages/drawingSubmittalHub/__tests__/moduleHeader.integration.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
// This is a focused unit of the header branch logic. The full hub has heavy
// providers; rather than boot it, assert ModuleHeader renders the stats it is
// given (the integration with the flag is exercised by the existing hub smoke
// test + field verification).
import { render } from "@testing-library/react";
import { ModuleHeader } from "@/components/desktop/module";

describe("Detailing header uses ModuleHeader stats", () => {
  it("renders the four detailing signal stats", () => {
    const { getByText } = render(
      <ModuleHeader page="DrawingSubmittalHub" title="Drawing & Submittal Control"
        stats={[
          { label: "Overdue", value: 2, tone: "danger" },
          { label: "At Risk", value: 1, tone: "amber" },
          { label: "In Review", value: 5, tone: "blue" },
          { label: "Unlinked", value: 0, tone: "neutral" },
        ]} />,
    );
    expect(getByText("Drawing & Submittal Control")).toBeTruthy();
    expect(getByText("Overdue")).toBeTruthy();
    expect(getByText("In Review")).toBeTruthy();
    expect(getByText("5")).toBeTruthy();
  });
});
```

- [ ] **Step 3:** Run it + the existing hub tests:
```powershell
npx vitest run src/pages/drawingSubmittalHub/__tests__/moduleHeader.integration.test.jsx src/__tests__/components/DrawingSubmittalHub.test.jsx --maxWorkers=2
```
Expected: PASS (new test + the hub smoke test still green — the smoke test runs with the flag off, so it still sees the `CommandBar` path; verify it doesn't assert on CommandBar-specific text that the branch removed — if it does, it still passes because flag is off).

- [ ] **Step 4:** Build (EXIT 0), then commit:
```powershell
git add src/pages/DrawingSubmittalHub.tsx src/pages/drawingSubmittalHub/__tests__/moduleHeader.integration.test.jsx
git commit -m "feat(detailing): photo ModuleHeader when desktop_shell on (CommandBar fallback)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A3: Move the hub tab bar into the header zone (desktop skin only)

**Files:** Modify `src/pages/DrawingSubmittalHub.tsx` (tab bar, lines ~795-857)

Keep the existing tab bar JSX (counts + logic) exactly; only adjust its top margin so it sits tight under the `ModuleHeader` when the flag is on (purely spacing).

- [ ] **Step 1:** In the tab-bar wrapper `style`, change `marginBottom: 16,` to `marginBottom: 16, marginTop: desktopShell ? 14 : 0,`. No other change.
- [ ] **Step 2:** Run hub tests + build (both green).
- [ ] **Step 3:** Commit:
```powershell
git add src/pages/DrawingSubmittalHub.tsx
git commit -m "style(detailing): tighten tab bar under ModuleHeader on desktop skin" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## GROUP B — Overview tab: TriageBoard sections → SectionCards

The `TriageBoard` (`components.tsx` ~147-366) + its nested sections (Critical Work Queue, Next Decision, Model Mapping, Sequence Readiness, Revision Impact, Pipeline, Triage Lists) currently render as ad-hoc `sbd-card-strong` blocks. Re-house each section's existing markup inside a kit `SectionCard` — wrapping only, no logic change.

### Task B1: Import the kit into components.tsx
- [ ] **Step 1:** Add to `src/pages/drawingSubmittalHub/components.tsx` imports:
```tsx
import { SectionCard, StatusPill } from "@/components/desktop/module";
```
- [ ] **Step 2:** Build (EXIT 0). Commit (`git add src/pages/drawingSubmittalHub/components.tsx`; message `chore(detailing): import kit into hub components`).

### Tasks B2–B7 (one per section): wrap in SectionCard
For EACH of these TriageBoard sections, do the same safe transform — read the section's current outer wrapper `<div ...card styling...>` and its title, replace **only** the outer card wrapper + heading with `<SectionCard title="…" icon={…}>…existing children…</SectionCard>`, leaving all inner JSX, props, handlers, and computed values untouched:

- [ ] **B2 — Critical Work Queue** (`components.tsx` ~171-194): title "Critical work queue".
- [ ] **B3 — Next Decision** (~196 onward): title "Next decision".
- [ ] **B4 — Model Mapping** (~373-552): title "Model mapping" (keep the conditional render guard).
- [ ] **B5 — Sequence Readiness** (~554-603): title "Sequence readiness".
- [ ] **B6 — Revision Impact (overview)** (~619-699): title "Revision impact".
- [ ] **B7 — Pipeline + Triage lists** (~1126-1160 pipeline; the 3 triage lists): wrap the pipeline panel and each triage list (Overdue / Due Soon / Needs Action) in its own `SectionCard`; render any status chips via `StatusPill`.

Each task's steps: (1) read the section, (2) wrap its outer card in `SectionCard` (move children inside verbatim), (3) `npx vitest run src/__tests__/components/DrawingSubmittalHub.test.jsx --maxWorkers=2` (green), (4) build (EXIT 0), (5) commit just `components.tsx` with message `refactor(detailing): re-house <section> into SectionCard`.

> If a section's card styling is load-bearing for layout (e.g. grid child sizing), keep the `SectionCard` className passthrough (`<SectionCard className="…">`) to preserve grid placement. Do not change the parent grid.

---

## GROUP C — Drawing Register tab → SectionCard + kit table styling

`DrawingRegisterTable` (`components.tsx` ~1575-1821) has a toolbar + dual codepaths (plain `<table>` for <100 sets, `RegisterVirtualList` for ≥100). **Preserve both codepaths.**

- [ ] **C1 — Wrap in SectionCard:** wrap the whole register body (toolbar + table/grid) in a `<SectionCard title="Drawing register" headerAction={…the existing "Open full editor" link…}>`; move the toolbar's other controls (search, Upload, Import Log) inside the card body above the table. Read the current JSX; wrap only.
- [ ] **C2 — Apply kit table class to the plain-table codepath:** on the `<table>` element (~1717), add `className="desk-table"`; mark numeric columns (Sheets, Released, Rev) cells with `className="is-num"`. Do NOT touch `RegisterVirtualList` (the ≥100 path keeps its current styling — note this divergence in a code comment so the mirror stays intentional).
- [ ] **C3 — Status chips → StatusPill:** where the register renders the operational status chip, render it via `StatusPill` mapping the operational state to a tone (open→open, released/done→done, overdue→danger, in-review→review). Keep the existing status value/logic.

Each: read → wrap/restyle → `npx vitest run src/__tests__/components/DrawingRegisterTable.test.jsx --maxWorkers=2` (MUST stay green — it asserts rows, status, released counts, search, permission gating) → build → commit `components.tsx` (message `refactor(detailing): register tab on kit table/cards`).

> The `DrawingRegisterTable.test.jsx` is the guardrail here — if any step reds it, the wrap altered behavior; revert that step and re-house more conservatively.

---

## GROUP D — Approval Matrix + Revision Impact tabs → SectionCards

- [ ] **D1 — ApprovalMatrix** (`components.tsx` ~2165-2543): wrap the matrix in a `SectionCard title="Approval matrix"`; leave the matrix grid + STATUS_COLORS cells untouched.
- [ ] **D2 — RevisionImpactBoard** (`components.tsx` ~2059-2163): wrap in `SectionCard title="Revision impact"`; render the severity + status chips via `StatusPill`.
- [ ] Lazy tabs (`process`/SubmittalVisualBoard, `submittals`/SubmittalsPage, `doccontrol`/DocControlPanel, `model3d`/Model3DTab) are **left as-is** — they're separate screens/components, out of this plan's scope.

Each: read → wrap → hub tests green → build → commit.

---

## GROUP E — Validation + field verification

- [ ] **E1 — Full ladder:** run and expect EXIT 0 each:
```powershell
npm run lint; npm run typecheck:strict; npm run typecheck:noimplicitany; npx vitest run --maxWorkers=2; node ./node_modules/vite/bin/vite.js build
```
- [ ] **E2 — Field-verify in the running app** (the real bar): `npm run dev`, sign in as the owner (desktop_shell on), open the Detailing Control Center, and confirm: photo header renders with the four signal stats + Lead Times; every tab still loads (overview sections in cards, register both codepaths, matrix, revision impact, process, submittals, doc control, 3D); inline edits (owner, due date, detailing state, readiness flags) still save; lead-times modal saves; tab counts correct; toggling the flag OFF restores the exact classic `CommandBar` hub. Test a small (<100 sets) and a large (≥100 sets) project for the register codepaths.
- [ ] **E3 — Final commit** (only if fixups needed).

---

## Self-review

**Spec coverage:** ModuleHeader on flagship (Group A) ✓; SectionCard re-house of overview + matrix + revimpact (Groups B, D) ✓; kit DataTable styling on register (Group C) ✓; StatusPill usage (B7, C3, D2) ✓; behavior-preserving (flag-branch + wrap-only rule + guardrail tests every task) ✓; lazy tabs untouched (documented) ✓; field verification (E2) ✓.

**Placeholder scan:** Group A is complete code. Groups B–D are deliberate "read current JSX → wrap in the shown kit component" transforms with exact file+line regions and the wrapper code shown — this is the correct, non-placeholder way to re-house large existing markup; each names its guardrail test.

**Type/name consistency:** kit imports (`ModuleHeader`, `SectionCard`, `StatusPill`) match the Plan 2A barrel exports. `ModuleHeader` props (`page`, `title`, `subtitle`, `stats:[{label,value,tone}]`, `actions`) match the kit. `StatTile` tones used (`danger/amber/blue/neutral`) are valid kit tones. `useFlag("desktop_shell")` matches the Phase 1 flag. Tab routing param stays `hub_tab` (unchanged). Guardrail test paths verified against the Explore map.
