# Detailing Control Center — Logic/Data/Efficiency Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the reasoning inconsistencies, misleading data‑population, and scale risks in the Detailing Control Center (`DrawingSubmittalHub`) without changing the upstream import or schema.

**Architecture:** Four independent workstreams. (1) Point all engines at the canonical `isRfiOpen`. (2) Remove the inert RFI fab‑hold path from `modelElementStatus` and make the hub's mapping panel truthful by surfacing the element's own `fab_status` (which the viewer's existing "Fab mode" already colors by). (3) Single‑source the Overdue KPI + deterministic Critical‑Work‑Queue dedup. (4) Virtualize the two large tables and reconcile the embedded Submittal tab's duplicate fetch. Plus the two missing engine test files.

**Tech Stack:** Vite + React + TypeScript, Vitest, `@tanstack/react-virtual` (already a dependency), `entityPredicates.isRfiOpen`, `lib/fabStatus`.

**Spec:** `docs/superpowers/specs/2026-06-26-detailing-control-center-logic-fixes-design.md`

**Branch:** `claude/dcc-logic-fixes` (already checked out — commit here; do NOT push until the user asks to ship).

**Verified anchors (from audit + DB):**
- Canonical predicate: `src/lib/entityPredicates.js:25` `isRfiOpen = (r) => !RFI_CLOSED_STATUSES.has(r?.status)`, `RFI_CLOSED_STATUSES = {"Answered","Closed","Void"}`. DB statuses are Title Case.
- `src/lib/fabStatus.js` — `FAB_STATUS_META` (`{label,color}` per status), `FAB_STATUS_ORDER = ["not_started","in_fabrication","fabricated","shipped","erected"]`.
- `model_elements.fab_status` values in prod: erected 25,023 · not_started 6,830 · in_fabrication 6,259 · shipped 230 · fabricated 113 (47% populated). `rfis` has NO `fab_hold`/`piece_marks` columns.
- `useVirtualizer` house pattern: `src/pages/submittals/components.tsx:3,47-105` (div rows, absolute positioning, `measureElement`). Also `src/components/drawings/DrawingsTable.jsx`.

---

## Task 1: Unify open-RFI in drawingHealthScore + add agreement test

**Files:**
- Create: `src/lib/__tests__/rfiOpenAgreement.test.js`
- Modify: `src/services/drawingHealthScore.ts` (the `RFI_NON_OPEN` set ~line 67 and its use ~line 121)

- [ ] **Step 1: Write the failing agreement test**

Create `src/lib/__tests__/rfiOpenAgreement.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { isRfiOpen } from "@/lib/entityPredicates";

// The real production RFI statuses (Title Case, from the live CHECK constraint).
describe("isRfiOpen — canonical open-RFI definition", () => {
  it("treats Open / Under Review / Incomplete Response as OPEN", () => {
    expect(isRfiOpen({ status: "Open" })).toBe(true);
    expect(isRfiOpen({ status: "Under Review" })).toBe(true);
    expect(isRfiOpen({ status: "Incomplete Response" })).toBe(true);
  });
  it("treats Answered / Closed / Void as CLOSED", () => {
    expect(isRfiOpen({ status: "Answered" })).toBe(false);
    expect(isRfiOpen({ status: "Closed" })).toBe(false);
    expect(isRfiOpen({ status: "Void" })).toBe(false);
  });
  it("treats unknown/empty status as open (conservative)", () => {
    expect(isRfiOpen({ status: "" })).toBe(true);
    expect(isRfiOpen({})).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — should pass already (it documents the canonical contract)**

Run: `npx vitest run src/lib/__tests__/rfiOpenAgreement.test.js`
Expected: PASS (this test pins the contract the engines must adopt).

- [ ] **Step 3: Switch drawingHealthScore to the canonical predicate**

In `src/services/drawingHealthScore.ts`: add the import near the top with the other imports:
```typescript
import { isRfiOpen } from "@/lib/entityPredicates";
```
Delete the local `const RFI_NON_OPEN = new Set([...]);` (~line 67). Find the open-RFI count (~line 119-121), currently:
```typescript
    const status = String(rfi.status ?? "").toLowerCase();
    if (!RFI_NON_OPEN.has(status)) open += 1;
```
Replace with:
```typescript
    if (isRfiOpen(rfi)) open += 1;
```
(Remove the now-unused `status` local if it's only used here; if `status` is used elsewhere in that loop, leave it.)

- [ ] **Step 4: Run the health-score test + build**

Run: `npx vitest run src/services/__tests__/drawingHealthScore.test.js` (if it exists; the audit said there is NO dedicated test — if the file is absent, skip and rely on Task 11). Then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -8`.
Expected: tests PASS (or N/A), build EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/rfiOpenAgreement.test.js src/services/drawingHealthScore.ts
git commit -m "fix(dcc): drawingHealthScore uses canonical isRfiOpen"
```

---

## Task 2: Unify open-RFI in revisionImpactBoard (flips "Answered" to closed)

**Files:**
- Modify: `src/lib/revisionImpactBoard.ts` (the local `RFI_CLOSED` ~line 17 + `isRfiOpenRow` ~line 32)
- Modify: `src/lib/__tests__/revisionImpactBoard.test.js` (assertions where "Answered" was treated as open)

- [ ] **Step 1: Update the test to the new behavior FIRST (TDD)**

Open `src/lib/__tests__/revisionImpactBoard.test.js`. Find any case that uses an RFI with `status: "Answered"` (or relies on `openRfiCount`/`fabBlocked` counting an Answered RFI as open). Change the expectation so an "Answered" RFI is **closed** (not counted in `openRfiCount`, doesn't set `fabBlocked` on its own). If no such case exists, ADD one:
```javascript
it("counts an Answered RFI as CLOSED (matches the canonical predicate)", () => {
  const rows = buildRevisionImpactRows(
    [{ drawingId: "d1", revisionCode: "B", severity: "low", sheetNumber: "S-1" }],
    {
      drawings: [{ id: "d1", linked_rfi_ids: "100", drawing_set_id: "set-1" }],
      drawingSets: [{ id: "set-1", set_name: "Set 1" }],
      workPackages: [],
      rfis: [{ id: "r1", rfi_number: "100", status: "Answered" }],
      modelElements: [],
    },
  );
  expect(rows[0].openRfiCount).toBe(0);
  expect(rows[0].fabBlocked).toBe(false);
});
```
(Adjust field names to match the file's existing test fixtures — read a neighboring test first to copy the exact `buildRevisionImpactRows` arg shape.)

- [ ] **Step 2: Run it — confirm it FAILS** (current code treats Answered as open)

Run: `npx vitest run src/lib/__tests__/revisionImpactBoard.test.js`
Expected: FAIL on the new Answered case.

- [ ] **Step 3: Switch revisionImpactBoard to the canonical predicate**

In `src/lib/revisionImpactBoard.ts`: add import:
```typescript
import { isRfiOpen } from "@/lib/entityPredicates";
```
Delete the local `const RFI_CLOSED = new Set([...]);` (~line 17). Find the open-RFI helper (~line 32), currently:
```typescript
  return !!r && !RFI_CLOSED.has(String(r.status ?? "").trim().toLowerCase());
```
Replace the function body so it delegates:
```typescript
  return isRfiOpen(r);
```
(Keep the surrounding function name/signature it already has so call sites don't change.)

- [ ] **Step 4: Run the test + build**

Run: `npx vitest run src/lib/__tests__/revisionImpactBoard.test.js` then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -8`.
Expected: PASS; build EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/revisionImpactBoard.ts src/lib/__tests__/revisionImpactBoard.test.js
git commit -m "fix(dcc): revisionImpactBoard open-RFI uses canonical isRfiOpen (Answered=closed)"
```

---

## Task 3: Remove the inert RFI fab-hold path from modelElementStatus

**Files:**
- Modify: `src/services/modelElementStatus.ts` (remove `buildHeldPieceMarkSet`, `RFI_CLOSED`, `RfiLike`, the `heldPieceMarks` param)
- Modify: `src/pages/DrawingSubmittalHub.tsx` (remove the import + call, ~line 29 + ~line 347)
- Modify: `src/services/__tests__/modelElementStatus.test.ts` (remove held-mark cases + the param)

- [ ] **Step 1: Update the test FIRST**

In `src/services/__tests__/modelElementStatus.test.ts`:
- Remove the `buildHeldPieceMarkSet` import and its test block (the audit cited lines ~3-7 import and ~25-36 test).
- For every `resolveElementStatus(...)` / `summarizeElementStatuses(...)` call, remove the 4th `heldPieceMarks` argument (the `held` / `new Set([...])` arg). E.g. `resolveElementStatus({ piece_mark: "1B1" }, new Map(), new Map(), held)` → `resolveElementStatus({ piece_mark: "1B1" }, new Map(), new Map())`.
- Delete the "piece-mark fab hold wins…" test entirely (the behavior is gone).
- Keep the `summarizeElementStatuses` shape assertions (counts/guidsByStatus/marksByStatus/idsByStatus/mappedPct) unchanged — that shape is NOT changing in this task.

- [ ] **Step 2: Run it — confirm it FAILS to compile/resolve** (buildHeldPieceMarkSet import removed but still exported, signatures still take the param)

Run: `npx vitest run src/services/__tests__/modelElementStatus.test.ts`
Expected: FAIL (arity / removed-symbol mismatch once you edit the source in step 3 — at this point it may still pass; the real gate is step 4).

- [ ] **Step 3: Edit `modelElementStatus.ts`**

- Delete `export function buildHeldPieceMarkSet(...) { ... }` (the whole function, ~lines 84-97), the `const RFI_CLOSED = new Set([...])` (~line 78) and its comment, and the `RfiLike` interface (~lines 65-70) **only if** nothing else imports `RfiLike` (grep first: `grep -rn "RfiLike" src`).
- `resolveElementStatus`: drop the `heldPieceMarks` param and the `markHeld` logic. New body:
```typescript
export function resolveElementStatus(
  element: ModelElementLike,
  readinessBySetId: Map<string, PackageReadinessLike>,
  sheetSetIdByDrawingId: Map<string, string> = new Map(),
): ElementStatusKey {
  const setId =
    (element.drawing_set_id as string | null) ||
    (element.drawing_id ? sheetSetIdByDrawingId.get(String(element.drawing_id)) ?? null : null);
  const readiness = setId ? readinessBySetId.get(String(setId)) : undefined;
  if (!readiness) return "unmapped";
  if (readiness.rfiBlocked) return "rfi_blocked";
  if (readiness.atRisk) return "behind_schedule";
  if (readiness.erectionReady) return "erection_ready";
  if (readiness.fabricationReady) return "fab_ready";
  const stateIdx = DETAILING_STATE_ORDER.indexOf(String(readiness.effectiveState ?? ""));
  return stateIdx >= IFA_IDX ? "in_review" : "in_detailing";
}
```
- `summarizeElementStatuses`: drop the `heldPieceMarks` param; update the internal `resolveElementStatus(...)` call to pass only 3 args. Everything else (BUCKETS, counts, mappedPct) stays.
- Keep `normalizePieceMark` (still used by `marksByStatus`).

- [ ] **Step 4: Edit the hub call site `DrawingSubmittalHub.tsx`**

- Remove `buildHeldPieceMarkSet` from the import on ~line 29 → `import { summarizeElementStatuses } from "@/services/modelElementStatus";`
- In the `modelMappingSummary` memo (~lines 333-349), delete `const held = buildHeldPieceMarkSet(rfis as any[]);` and change the return to:
```typescript
  return summarizeElementStatuses(modelElements as any[], readinessBySetId, sheetSetIdByDrawingId);
```
- The memo dep array `[modelElements, setPackages, readinessByKey, rfis]` — `rfis` is no longer read here; remove it from the deps → `[modelElements, setPackages, readinessByKey]`.

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run src/services/__tests__/modelElementStatus.test.ts` then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -10`.
Expected: PASS; build EXIT 0. (If `RfiLike` was imported elsewhere, restore it.)

- [ ] **Step 6: Commit**

```bash
git add src/services/modelElementStatus.ts src/pages/DrawingSubmittalHub.tsx src/services/__tests__/modelElementStatus.test.ts
git commit -m "fix(dcc): remove inert RFI fab-hold path (rfis has no fab_hold/piece_marks)"
```

---

## Task 4: Add `summarizeFabStatus` helper

**Files:**
- Modify: `src/lib/fabStatus.js` (add the helper)
- Create/Modify: `src/lib/__tests__/fabStatus.test.js`

- [ ] **Step 1: Write the failing test**

Create or extend `src/lib/__tests__/fabStatus.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { summarizeFabStatus, FAB_STATUS_ORDER } from "../fabStatus";

describe("summarizeFabStatus", () => {
  it("counts elements by fab_status and computes coverage", () => {
    const els = [
      { fab_status: "erected" }, { fab_status: "erected" },
      { fab_status: "in_fabrication" },
      { fab_status: null }, { fab_status: "" }, {},
      { fab_status: "bogus" }, // unknown value — counted in total but not a known bucket
    ];
    const s = summarizeFabStatus(els);
    expect(s.total).toBe(7);
    expect(s.counts.erected).toBe(2);
    expect(s.counts.in_fabrication).toBe(1);
    expect(s.withFabStatus).toBe(3); // erected x2 + in_fabrication x1 (known statuses only)
    expect(s.pct).toBe(Math.round((3 / 7) * 100));
  });
  it("handles empty input", () => {
    const s = summarizeFabStatus([]);
    expect(s.total).toBe(0);
    expect(s.withFabStatus).toBe(0);
    expect(s.pct).toBe(0);
    for (const k of FAB_STATUS_ORDER) expect(s.counts[k]).toBe(0);
  });
  it("ignores deleted elements", () => {
    const s = summarizeFabStatus([{ fab_status: "erected", is_deleted: true }, { fab_status: "shipped" }]);
    expect(s.total).toBe(1);
    expect(s.counts.shipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — confirm FAIL** (`summarizeFabStatus` not exported)

Run: `npx vitest run src/lib/__tests__/fabStatus.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the helper in `src/lib/fabStatus.js`**

Append:
```javascript
/**
 * Summarize a project's model elements by their own fab_status (the populated,
 * hand-set/imported fab stage). Distinct from the detailing-readiness engine.
 * `counts` is keyed by FAB_STATUS_ORDER; unknown/blank statuses count toward
 * `total` only. `pct` = % of non-deleted elements with a known fab status.
 */
export function summarizeFabStatus(elements) {
  const counts = Object.fromEntries(FAB_STATUS_ORDER.map((s) => [s, 0]));
  let total = 0;
  let withFabStatus = 0;
  for (const el of Array.isArray(elements) ? elements : []) {
    if (!el || el.is_deleted) continue;
    total += 1;
    const s = el.fab_status;
    if (s && Object.prototype.hasOwnProperty.call(counts, s)) {
      counts[s] += 1;
      withFabStatus += 1;
    }
  }
  return { counts, withFabStatus, total, pct: total > 0 ? Math.round((withFabStatus / total) * 100) : 0 };
}
```

- [ ] **Step 4: Run it — PASS**

Run: `npx vitest run src/lib/__tests__/fabStatus.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fabStatus.js src/lib/__tests__/fabStatus.test.js
git commit -m "feat(dcc): summarizeFabStatus helper for the model-mapping panel"
```

---

## Task 5: Make the ModelMappingSection panel truthful + show fab status

**Files:**
- Modify: `src/pages/drawingSubmittalHub/components.tsx` (`ModelMappingSection`, ~lines 364-437)

- [ ] **Step 1: Add the fab-status imports to components.tsx**

Near the existing `import { ELEMENT_STATUS_META } from "@/services/modelElementStatus";`, add:
```typescript
import { FAB_STATUS_META, FAB_STATUS_ORDER, summarizeFabStatus } from "@/lib/fabStatus";
```

- [ ] **Step 2: Relabel the package-linkage line**

In `ModelMappingSection` find the block (~lines 405-409) that renders "Mapped to packages" + `summary?.mappedPct`. Change the label text only:
```tsx
  <span style={{ color: textMuted }}>Linked to detailing packages</span>
```
(Leave the `{summary?.mappedPct ?? 0}%` value + bar as-is — `mappedPct` correctly measures package linkage; only the label was misleading.)

- [ ] **Step 3: Render a fabrication-status breakdown below the bucket chips**

`ModelMappingSection` already receives an `elements` prop. Inside the component, compute:
```tsx
  const fab = useMemo(() => summarizeFabStatus(elements || []), [elements]);
```
(Add `useMemo` to the React import in this file if not already imported.) After the existing bucket-chips block (after the `ELEMENT_BUCKET_ORDER.map(...)` group, ~line 437), add a fab section:
```tsx
  {fab.total > 0 && (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: textPrimary, marginBottom: 6 }}>
        <span style={{ color: textMuted }}>Fabrication status (from model)</span>
        <span className="sbd-num">{fab.pct}% tracked</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {FAB_STATUS_ORDER.map((s) => {
          const count = fab.counts[s] || 0;
          if (!count) return null;
          const meta = (FAB_STATUS_META as any)[s];
          return (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 999, background: surface2, border: `1px solid ${border}`, fontFamily: mono, fontSize: 10, color: textPrimary }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: meta.color }} />
              {meta.label} · <span className="sbd-num">{count}</span>
            </span>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontFamily: mono, fontSize: 9, color: textMuted }}>
        Color the model by these in the 3D Model tab → Fab mode.
      </div>
    </div>
  )}
```
(Match the file's existing style tokens — `mono`, `textMuted`, `textPrimary`, `surface2`, `border` are already imported/used in this file; verify and reuse them.)

- [ ] **Step 4: Build + lint**

Run: `npm run lint 2>&1 | tail -15` then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -10`.
Expected: lint clean for the file; build EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/drawingSubmittalHub/components.tsx
git commit -m "feat(dcc): truthful model-mapping panel + fabrication-status breakdown"
```

---

## Task 6: Single-source the Overdue KPI

**Files:**
- Modify: `src/pages/DrawingSubmittalHub.tsx` (the Overdue `KpiTile`, ~line 721)

- [ ] **Step 1: Change the Overdue tile to one definition + a clarifying sub**

Find (~line 721):
```tsx
<KpiTile compact label="Overdue" value={Math.max(kpis.overdue, triage.overdue.length)} color={error} loading={isLoading} />
```
Replace with:
```tsx
<KpiTile compact label="Overdue" value={triage.overdue.length} sub="packages + unlinked subs" color={error} loading={isLoading} />
```
(`triage.overdue` already counts overdue drawing‑set packages + overdue unlinked submittals — the exact set the board lists. The `sub` documents the definition. `KpiTile` already supports a `sub` prop, per the other tiles in this strip.)

- [ ] **Step 2: Build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -8`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DrawingSubmittalHub.tsx
git commit -m "fix(dcc): single-source Overdue KPI to the triage definition"
```

---

## Task 7: Deterministic Critical Work Queue dedup

**Files:**
- Modify: `src/pages/drawingSubmittalHub/components.tsx` (`criticalItems`, ~lines 151-153)

- [ ] **Step 1: Import itemUrgency into components.tsx**

Confirm whether `itemUrgency` is imported here (the audit said it is NOT). Add it to the existing `from "./format"` import in components.tsx (or add a new import):
```typescript
import { itemUrgency } from "./format";
```
(Verify the relative path — `components.tsx` and `format.ts` are siblings in `src/pages/drawingSubmittalHub/`, so `"./format"` is correct.)

- [ ] **Step 2: Sort before dedup so the top-12 is true priority order**

Find (~lines 151-153):
```tsx
const criticalItems = Array.from(
  new Map([...triage.overdue, ...triage.needsAction, ...triage.dueSoon].map((item: any) => [item.id, item])).values()
).slice(0, 12) as any[];
```
Replace with:
```tsx
const criticalItems = Array.from(
  new Map(
    [...triage.overdue, ...triage.needsAction, ...triage.dueSoon]
      .sort(itemUrgency)
      .map((item: any) => [item.id, item]),
  ).values(),
).slice(0, 12) as any[];
```
(`Map` keeps the first occurrence per id; sorting first means the highest‑priority instance of a duplicated item wins and the top‑12 is deterministic.)

- [ ] **Step 3: Build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -8`
Expected: EXIT 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/drawingSubmittalHub/components.tsx
git commit -m "fix(dcc): deterministic Critical Work Queue ordering (sort before dedup)"
```

---

## Task 8: Virtualize the Drawing Register table

**Files:**
- Modify: `src/pages/drawingSubmittalHub/components.tsx` (`DrawingRegisterTable`, ~lines 1361-1540)

> Risk note: the register is a `<table>`. The house virtualization pattern (`src/pages/submittals/components.tsx:47-105`) uses absolutely‑positioned `<div>` rows. Converting a `<table>` to div rows risks column‑alignment regressions. Apply windowing ONLY above a threshold so small projects are untouched, and keep the existing `<table>` rendering as the non‑virtualized branch.

- [ ] **Step 1: Read the house pattern + the current table**

Read `src/pages/submittals/components.tsx:47-105` (the `useVirtualizer` pattern) and the current `DrawingRegisterTable` rows (~1465-1538). Note the row container (`<div style={{overflow:hidden}}><table>`), the per‑row `<tr key={r.pkg.key}>`, and the columns.

- [ ] **Step 2: Gate virtualization on row count**

At the top of `DrawingRegisterTable`'s render, compute `const VIRTUALIZE_THRESHOLD = 100; const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;`. Keep the EXISTING `<table>` branch for `!shouldVirtualize` (unchanged). For `shouldVirtualize`, render a virtualized list:
- `import { useVirtualizer } from "@tanstack/react-virtual";` (top of file).
- A `parentRef` scroll `<div style={{ maxHeight: <viewport>, overflowY: "auto" }}>`.
- A spacer `<div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>`.
- `virtualizer.getVirtualItems().map(v => <div key={rows[v.index].pkg.key} ref={virtualizer.measureElement} style={{ position:"absolute", top:0, width:"100%", transform:`translateY(${v.start}px)` }}>…row…</div>)`.
- Extract the existing per‑row JSX (the `<tr>…</tr>` body) into a `<RegisterRow r={r} ... />` presentational component used by BOTH branches (the table branch wraps it in `<tr>`, the virtual branch in the positioned `<div>` with CSS grid columns matching the table header). Keep the header row visible above the scroll area in the virtualized branch.

> If, while implementing, the column alignment between the sticky header and the div‑rows proves fiddly, fall back to keeping the `<table>` and instead capping the table at the threshold with a "Showing first N — refine search to see more" footer, and report that as a DONE_WITH_CONCERNS deviation rather than shipping a misaligned grid.

- [ ] **Step 3: Verify behavior preserved**

Run: `npx vitest run src/pages/drawingSubmittalHub 2>&1 | tail -15` (if tests exist for this area) then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -8`.
Expected: tests PASS; build EXIT 0. Field-check deferred to Task 12.

- [ ] **Step 4: Commit**

```bash
git add src/pages/drawingSubmittalHub/components.tsx
git commit -m "perf(dcc): virtualize Drawing Register table above 100 rows"
```

---

## Task 9: Virtualize the Revision Impact board

**Files:**
- Modify: `src/pages/drawingSubmittalHub/components.tsx` (`RevisionImpactBoard`, ~lines 1688-1776)

- [ ] **Step 1: Apply the same gated-virtualization pattern**

Mirror Task 8 for `RevisionImpactBoard`: `shouldVirtualize = filtered.length > 100`; keep the existing `<table>` branch unchanged for small lists; for large lists, render the windowed div‑rows via `useVirtualizer`, extracting the per‑row `<tr>` body (`filtered.map(r => …)`, ~1735-1774) into a shared `<RevisionRow r={r} />` component used by both branches. Same header‑stays‑visible + same column‑alignment fallback note as Task 8.

- [ ] **Step 2: Verify + build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -8`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add src/pages/drawingSubmittalHub/components.tsx
git commit -m "perf(dcc): virtualize Revision Impact board above 100 rows"
```

---

## Task 10: Reconcile the embedded Submittal tab's duplicate fetch

**Files:**
- Modify: `src/pages/Submittals.tsx` (the internal `useQuery` key, ~lines 94-99)

The hub's `useSubmittals` fetches with `getQueryKey("submittal", projectId)` (`src/hooks/useSubmittals.ts:354`). The embedded `Submittals` page fetches the SAME data with a raw `queryKey: ["submittals", projectId]` (`Submittals.tsx:94-99`). If those keys differ, the Submittal tab triggers a **second** network fetch of identical data.

- [ ] **Step 1: Read both keys**

Read `src/services/cacheRegistry.ts` (or wherever `getQueryKey` lives) and evaluate `getQueryKey("submittal", projectId)`. Compare to `["submittals", projectId]`.
- If they are **identical**, React Query already dedupes → NO code change. Add a one‑line comment at `Submittals.tsx:94` noting the shared key and STOP (commit the comment only).
- If they **differ**, continue to step 2.

- [ ] **Step 2: Make the page use the canonical key**

In `src/pages/Submittals.tsx`, import `getQueryKey` (same import the hook uses) and change the `useQuery` `queryKey` from `["submittals", projectId]` to `getQueryKey("submittal", projectId)`, leaving the `queryFn`/`enabled`/`staleTime` as‑is. This makes the page share the hub's cache entry — one fetch, no refactor of the component's props.

> Do NOT change the standalone `Submittals` route's behavior otherwise — it must keep working when opened directly (where the hub hasn't pre‑fetched). Sharing the key is safe: whichever mounts first fetches, the other reads cache.

- [ ] **Step 3: Verify**

Run: `npx vitest run src/pages/submittals 2>&1 | tail -10` (if tests exist) then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -8`.
Expected: PASS; build EXIT 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Submittals.tsx
git commit -m "perf(dcc): Submittal tab shares the hub's submittals cache key (no double fetch)"
```

---

## Task 11: Fill the missing engine test files

**Files:**
- Create: `src/services/__tests__/drawingHealthScore.test.ts`
- Modify: `src/services/__tests__/modelElementStatus.test.ts` (add precedence cases)

- [ ] **Step 1: Write drawingHealthScore tests**

Create `src/services/__tests__/drawingHealthScore.test.ts`. Read `src/services/drawingHealthScore.ts` first to get the exact `calculateDrawingHealthScore(pkg, context)` + `summarizeFleetHealth(scores)` signatures and the `pkg`/`context` shapes. Cover:
- a clean package (no open RFIs, terminal‑approved submittal, no revisions) → high score / band `excellent`;
- a package with an open RFI → lower score, an `issues` entry;
- grade/band thresholds (90→A/excellent, 75→good, 60→at_risk, else critical) via crafted inputs;
- `summarizeFleetHealth([])` → safe zeros; `summarizeFleetHealth([oneScore])` → that score is the average; worst‑first ordering with several.
Write each as a concrete `it(...)` with real assertions (read the source to use real field names — no guessed shapes).

- [ ] **Step 2: Add modelElementStatus precedence tests**

In `src/services/__tests__/modelElementStatus.test.ts`, add cases for `resolveElementStatus` (now 3‑arg) precedence: unmapped (no set), rfi_blocked (`readiness.rfiBlocked`), behind_schedule (`atRisk`), erection_ready, fab_ready, in_review (state ≥ IFA), in_detailing (below IFA). Plus `summarizeElementStatuses` counts + `mappedPct` with a mix of mapped/unmapped.

- [ ] **Step 3: Run both + the whole services suite**

Run: `npx vitest run src/services 2>&1 | tail -20`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/__tests__/drawingHealthScore.test.ts src/services/__tests__/modelElementStatus.test.ts
git commit -m "test(dcc): cover drawingHealthScore + modelElementStatus precedence"
```

---

## Task 12: Full validation ladder + field verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full ladder**

```powershell
npm run lint 2>&1 | Select-Object -Last 6; Write-Host "LINT: $LASTEXITCODE"
npm run typecheck 2>&1 | Select-Object -Last 6; Write-Host "TYPECHECK: $LASTEXITCODE"
npm run typecheck:js 2>&1 | Select-Object -Last 6; Write-Host "TYPECHECKJS: $LASTEXITCODE"
npm run typecheck:strict 2>&1 | Select-Object -Last 6; Write-Host "STRICT: $LASTEXITCODE"
npm run typecheck:noimplicitany 2>&1 | Select-Object -Last 6; Write-Host "NOIMPLICITANY: $LASTEXITCODE"
npx vitest run --maxWorkers=2 2>&1 | Select-Object -Last 8; Write-Host "TEST: $LASTEXITCODE"
node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 8; Write-Host "BUILD: $LASTEXITCODE"
```
Expected: all EXIT 0. (Use `--maxWorkers=2` — the default flakes with worker‑startup timeouts on this Windows box.) Do NOT grow the strict/noImplicitAny ignore lists.

- [ ] **Step 2: Field-verify in the running app (REQUIRED before "done")**

`npm run dev`, open a project's Detailing Control Center, and confirm:
- [ ] **Overview KPI strip:** "Overdue" equals the count the board lists (packages + unlinked subs); no inflated/again‑different number.
- [ ] **3D Model Mapping panel:** reads "Linked to detailing packages — N%" (honest) and shows a **Fabrication status** breakdown with real counts (erected/in_fabrication/etc.), not just "0% mapped."
- [ ] **3D Model tab → Fab mode:** still colors pieces by fab status (unchanged).
- [ ] **Revision Impact board:** open‑RFI counts treat "Answered" as closed; the board still renders.
- [ ] **Drawing Register + Revision Impact tabs:** scroll smoothly on a large project; columns line up under the header.
- [ ] **Submittal Register tab:** opens and shows the same submittals (one network fetch, via DevTools Network if checking).

- [ ] **Step 3: Report** using the CLAUDE.md format (Changed / Tested / Notes‑risks / Commit‑deploy), labeling verification level (unit/build vs field). Do NOT push to `main` unless the user asks to ship.

---

## Self-review notes (author)

- **Spec coverage:** WS1 (T1, T2) ✓; WS2 dead‑path removal (T3) + fab summary (T4) + truthful panel (T5) ✓ — matches the refined spec WS2 (fab_status surfaced separately, detailing buckets untouched, leveraging the existing viewer Fab mode); WS3 Overdue KPI (T6) + dedup (T7) ✓; WS4 virtualization (T8, T9) + Submittal fetch (T10) ✓; test gaps (T11) ✓; validation + field‑verify (T12) ✓.
- **Name/type consistency:** `isRfiOpen` (entityPredicates) used in T1/T2; `summarizeFabStatus(elements) → {counts,withFabStatus,total,pct}` defined T4, consumed T5; `resolveElementStatus` 3‑arg signature defined T3, tested T11; `mappedPct` retained (label‑only change) T5.
- **Known risks:** T8/T9 `<table>`→virtualized‑div conversion is the highest‑risk slice (column alignment) — explicit fallback documented. Line anchors in the 1900‑line `components.tsx` and 932‑line `DrawingSubmittalHub.tsx` will drift — locate by symbol name (grep), not line number. T10 is a no‑op if the query keys already match (decided by reading, not assumed).
