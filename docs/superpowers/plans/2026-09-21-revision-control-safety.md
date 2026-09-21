# Revision-Control Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a changed structural drawing from being released to fabrication when comparison, downstream, or scoped model evidence is unresolved, while making the next action explicit.

**Architecture:** A single pure TypeScript derivation converts current evidence into `clear`, `review_required`, or `blocked`. The Hub renders that evidence, while the established Supabase release evaluator remains the only authority and receives an additive matching check through an owner-controlled migration. Document Control stays read-only and supplies deterministic navigation guidance only.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest/Testing Library, Supabase Postgres/RLS/RPC, pdf.js raster comparison.

**Spec:** `docs/superpowers/specs/2026-09-21-revision-control-safety-design.md`

## Global Constraints

- Submittals remain the workflow-stage source of truth; do not add a competing drawing-stage workflow.
- `evaluate_fab_release_set` and `evaluate_release_gate` remain the only release authority; browser logic only renders their decision.
- Missing, unloaded, or ambiguous data is `review_required`, never a clear, zero, `No`, or `Not downstream` claim.
- AI comparison is advisory. A completed visual review is valid evidence and never requires an LLM call.
- Retain all release-gate response fields and blockers; add new fields compatibly.
- New source and tests are `.ts`/`.tsx`; do not add new JavaScript files.
- Do not run `supabase db push`, execute live SQL, alter live project records, or deploy. Migration application and ledger stamping are owner-controlled.
- Stage files explicitly and do not weaken strict-typecheck ignore lists.

## Review Focus

- A revised sheet with no downstream dates stays `review_required`, never “not downstream.” Task 1 proves it.
- A roster that exists but has not been loaded stays `review_required`; its global count cannot prove a sheet unaffected. Tasks 1 and 3 prove it.
- A raster failure keeps AI Diff and visual completion unavailable and offers retry. Task 2 proves it.
- A completed visual review with no AI deltas clears comparison evidence without invoking the LLM. Task 2 proves it.
- An ambiguous or capped-register Document Control result never chooses a revision target. Task 4 proves it.

---

## File structure

| Path | Responsibility |
|---|---|
| `src/lib/revisionControlEvidence.ts` | Pure typed evidence and model-scope derivation. |
| `src/lib/__tests__/revisionControlEvidence.test.ts` | Contract tests for clear, review-required, blocked, exact, estimate, and unknown. |
| `src/lib/revisionImpactBoard.ts` | Adds the shared contract to established Revision Impact row joins. |
| `src/pages/DrawingSubmittalHub.tsx` | Queries comparisons and controls lazy model-roster loading. |
| `src/pages/drawingSubmittalHub/{types.ts,RevisionImpactPanel.tsx,RevisionImpactViews.tsx,triageBoard.tsx}` | Typed state, evidence display, mapping request, and consistent count labels. |
| `src/hooks/useRasterCompare.ts` | Bounded retry and raster-ready state. |
| `src/lib/revisionSnapshotDiff.js` | Persists visual review through existing guarded RPCs. |
| `src/components/drawings/RevisionCompareModal.jsx` | Retry and visual-review controls; correct AI-disable state. |
| `src/lib/docControl/nextAction.ts` | Pure read-only intake action selection. |
| `src/pages/DocumentControl.tsx` | Displays the action strip and only existing routes. |
| `supabase/tests/revision_control_release_gate.sql` | Owner-run fixture assertions, added with the ledger-stamped migration. |

### Task 1: Establish the pure revision-control evidence contract

**Files:**
- Create: `src/lib/revisionControlEvidence.ts`
- Create: `src/lib/__tests__/revisionControlEvidence.test.ts`
- Modify: `src/lib/revisionImpactBoard.ts`

**Interfaces:**
- Consumes: changed-sheet IDs, `drawing_revision_comparisons`, existing downstream severity, drawing-set ID, roster state, and `model_elements` rows.
- Produces: `deriveRevisionControlEvidence(input): RevisionControlEvidence` and `modelScopeEvidence(input): ModelScopeEvidence`.
- `RevisionControlEvidence` is `{ status: "clear" | "review_required" | "blocked"; reasons: RevisionControlReason[]; comparison: EvidenceState; downstream: EvidenceState; model: ModelScopeEvidence }`.
- `ModelScopeEvidence` is `{ state: "exact" | "sequence_estimate" | "not_loaded" | "absent" | "unresolved"; affectedPieces: number | null; reasonCode: string }`.

- [ ] **Step 1: Write the failing evidence test**

```ts
import { deriveRevisionControlEvidence, modelScopeEvidence } from "@/lib/revisionControlEvidence";

it("keeps missing downstream dates review-required", () => {
  expect(deriveRevisionControlEvidence({
    isChanged: true,
    comparison: { status: "complete" },
    downstreamSeverity: "unknown",
    model: { state: "exact", affectedPieces: 2 },
  })).toMatchObject({ status: "review_required", reasons: [{ code: "DOWNSTREAM_UNKNOWN" }] });
});

it("does not turn an unloaded model roster into zero pieces", () => {
  expect(modelScopeEvidence({ rosterCount: 664, rosterLoaded: false, drawingSetId: "set-1", elements: [] }))
    .toMatchObject({ state: "not_loaded", affectedPieces: null, reasonCode: "MODEL_ROSTER_NOT_LOADED" });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/lib/__tests__/revisionControlEvidence.test.ts`

Expected: FAIL because the evidence module does not exist.

- [ ] **Step 3: Implement the minimal typed derivation**

```ts
export type RevisionControlStatus = "clear" | "review_required" | "blocked";

export function deriveRevisionControlEvidence(input: RevisionControlEvidenceInput): RevisionControlEvidence {
  const reasons = [comparisonReason(input), downstreamReason(input), modelReason(input)].filter(Boolean);
  return {
    status: reasons.some((reason) => reason!.severity === "blocked") ? "blocked" : reasons.length ? "review_required" : "clear",
    reasons: reasons as RevisionControlReason[],
    comparison: comparisonState(input.comparison),
    downstream: downstreamState(input.downstreamSeverity),
    model: input.model,
  };
}
```

Use exact drawing-set links first. Use a work-package sequence only when its existing value is non-empty; return `null` for every unproven piece count.

- [ ] **Step 4: Attach evidence without changing legacy joins**

```ts
return {
  ...existingRow,
  revisionControl: deriveRevisionControlEvidence({
    isChanged: true,
    comparison: comparisonByPair.get(pairKey) ?? null,
    downstreamSeverity: imp.severity,
    model: modelScopeEvidence(modelInput),
  }),
};
```

Keep the existing RFI, work-package, and `fabBlocked` data shape intact.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/lib/__tests__/revisionControlEvidence.test.ts src/lib/__tests__/detailingRevisionImpact.test.js`

Run: `npm run typecheck`

Expected: PASS, including the existing unknown-downstream regression test.

```bash
git add src/lib/revisionControlEvidence.ts src/lib/__tests__/revisionControlEvidence.test.ts src/lib/revisionImpactBoard.ts
git commit -m "feat: derive revision control evidence"
```

### Task 2: Make revision comparison recoverable and record visual review

**Files:**
- Modify: `src/hooks/useRasterCompare.ts`
- Modify: `src/lib/revisionSnapshotDiff.js`
- Modify: `src/components/drawings/RevisionCompareModal.jsx`
- Create: `src/hooks/__tests__/useRasterCompare.test.tsx`
- Create: `src/components/drawings/__tests__/RevisionCompareModal.test.tsx`
- Modify: `src/lib/__tests__/revisionSnapshotDiff.test.js`

**Interfaces:**
- Consumes: selected old/new files and existing `create_revision_comparison` / `record_revision_comparison` RPCs.
- Produces: `retryRender(): void`, `rastersReady: boolean`, and `recordVisualRevisionReview({ drawingId, fromRevisionId, toRevisionId }): Promise<Comparison>`.
- AI Diff and visual review enable only when `rastersReady === true` and no render error exists.

- [ ] **Step 1: Write the failing retry and visual-review tests**

```tsx
it("retries a failed raster pair and clears error only after both rasters render", async () => {
  rasterizePage.mockRejectedValueOnce(new Error("network"));
  const { result } = renderHook(() => useRasterCompare({ open: true, oldPage, newPage }));
  await waitFor(() => expect(result.current.renderError).toMatch(/network/));
  act(() => result.current.retryRender());
  await waitFor(() => expect(result.current.rastersReady).toBe(true));
});

it("records visual review without invoking the LLM", async () => {
  await recordVisualRevisionReview({ drawingId: "d1", fromRevisionId: "r1", toRevisionId: "r2" });
  expect(invokeLlmProxy).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("record_revision_comparison", expect.objectContaining({ p_status: "complete", p_model: "visual-review" }));
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useRasterCompare.test.tsx src/lib/__tests__/revisionSnapshotDiff.test.js`

Expected: FAIL because retry/readiness and visual-review APIs do not exist.

- [ ] **Step 3: Implement bounded retry and visual-review persistence**

```ts
const [retryNonce, setRetryNonce] = useState(0);
const retryRender = useCallback(() => setRetryNonce((value) => value + 1), []);
const rastersReady = Boolean(rastersRef.current.old && rastersRef.current.new) && !rendering && !renderError;

export async function recordVisualRevisionReview(ids) {
  const comparison = await findOrCreateComparison(ids);
  if (comparison.compare_status === "complete") return comparison;
  return recordComparison({ comparisonId: comparison.id, status: "complete", model: "visual-review", summary: "Visual revision comparison reviewed." });
}
```

Include `retryNonce` in the raster effect dependencies. One transient automatic retry is allowed; further attempts use the explicit button. Do not mark a failed render complete or overwrite a completed AI comparison.

- [ ] **Step 4: Wire accessible modal controls**

Render an error panel with a `Retry rendering` button and clear incomplete-evidence copy. Render `Mark visual review complete` only after a valid raster pair. Disable the AI launcher and Generate button whenever `rastersReady` is false or `renderError` is non-empty.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/hooks/__tests__/useRasterCompare.test.tsx src/components/drawings/__tests__/RevisionCompareModal.test.tsx src/lib/__tests__/revisionSnapshotDiff.test.js`

Expected: PASS; failed rendering never enables AI or visual completion.

```bash
git add src/hooks/useRasterCompare.ts src/hooks/__tests__/useRasterCompare.test.tsx src/lib/revisionSnapshotDiff.js src/lib/__tests__/revisionSnapshotDiff.test.js src/components/drawings/RevisionCompareModal.jsx src/components/drawings/__tests__/RevisionCompareModal.test.tsx
git commit -m "fix: recover revision comparison rendering"
```

### Task 3: Render one evidence decision across Revision Impact and model mapping

**Files:**
- Modify: `src/pages/DrawingSubmittalHub.tsx`
- Modify: `src/pages/drawingSubmittalHub/types.ts`
- Modify: `src/pages/drawingSubmittalHub/RevisionImpactPanel.tsx`
- Modify: `src/pages/drawingSubmittalHub/RevisionImpactViews.tsx`
- Modify: `src/pages/drawingSubmittalHub/triageBoard.tsx`
- Modify: `src/pages/drawingSubmittalHub/__tests__/RevisionImpactViews.test.tsx`
- Create: `src/pages/drawingSubmittalHub/__tests__/revisionControlEvidence.integration.test.tsx`

**Interfaces:**
- Consumes: `modelElementCount`, lazy `modelElements`, revision comparisons, and `RevisionControlEvidence` from Task 1.
- Produces: `revisionControl` on every `RevisionImpactViewRow`, `rosterState` (`not_loaded | loaded | load_error`), and a callback that explicitly requests the full roster.
- UI labels are `Clear`, `Review required`, and `Blocked`; legacy `fabBlocked` remains available to other consumers.

- [ ] **Step 1: Write the failing board tests**

```tsx
it("renders Review required instead of a binary clear state when model evidence is unloaded", () => {
  render(<RevisionImpactViews rows={[rowWithUnloadedRoster]} rosterState="not_loaded" />);
  expect(screen.getByText("Review required")).toBeInTheDocument();
  expect(screen.queryByText("Fab Blocked?: No")).not.toBeInTheDocument();
});

it("does not fetch the full roster until mapping evidence is requested", async () => {
  render(<DrawingSubmittalHub />);
  expect(fetchAllModelElements).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /load mapping evidence/i }));
  expect(fetchAllModelElements).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npx vitest run src/pages/drawingSubmittalHub/__tests__/RevisionImpactViews.test.tsx src/pages/drawingSubmittalHub/__tests__/revisionControlEvidence.integration.test.tsx`

Expected: FAIL because the board exposes only binary state and cannot request mapping evidence.

- [ ] **Step 3: Wire facts without eager roster loading**

```tsx
const rosterState = modelElementsError ? "load_error"
  : mappingRosterRequested || activeTab === "model3d" ? "loaded" : "not_loaded";

<RevisionImpactViews
  rows={revisionImpactRows}
  rosterState={rosterState}
  onLoadMappingEvidence={() => setMappingRosterRequested(true)}
/>
```

Add a project-scoped comparison query and pair-key map. Keep the HEAD count as the only automatic roster query. The 3D tab, existing mapping card, and the new Revision Impact action are the only full-roster triggers.

- [ ] **Step 4: Replace ambiguous display copy**

Render the shared label and first reason. Render piece facts as `Exact · N pieces`, `Sequence estimate · N pieces`, or `Unknown · reason`. Name total IFC/model roster count separately from linked and unresolved scoped members; show a last-loaded timestamp only after the roster query completed.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/pages/drawingSubmittalHub/__tests__/RevisionImpactViews.test.tsx src/pages/drawingSubmittalHub/__tests__/revisionControlEvidence.integration.test.tsx src/components/command/__tests__/referencePrimitives.test.tsx`

Run: `npm run typecheck`

Expected: PASS; no path renders an unloaded roster as zero affected pieces.

```bash
git add src/pages/DrawingSubmittalHub.tsx src/pages/drawingSubmittalHub/types.ts src/pages/drawingSubmittalHub/RevisionImpactPanel.tsx src/pages/drawingSubmittalHub/RevisionImpactViews.tsx src/pages/drawingSubmittalHub/triageBoard.tsx src/pages/drawingSubmittalHub/__tests__/RevisionImpactViews.test.tsx src/pages/drawingSubmittalHub/__tests__/revisionControlEvidence.integration.test.tsx
git commit -m "feat: surface revision control evidence"
```

### Task 4: Add read-only Document Control next actions

**Files:**
- Create: `src/lib/docControl/nextAction.ts`
- Create: `src/lib/docControl/__tests__/nextAction.test.ts`
- Modify: `src/pages/DocumentControl.tsx`
- Modify: `src/pages/__tests__/DocumentControl.test.tsx`

**Interfaces:**
- Consumes: existing `DocControlRecord.register` evidence and extraction health.
- Produces: `nextActionForRecord(record, registerComplete): DocControlNextAction`, where `kind` is `start_revision_upload | resolve_ambiguity | upload_set | review_source_pdf`.
- An action includes display copy and an existing route only. It never carries a file, mutation, or target drawing ID for an ambiguous match.

- [ ] **Step 1: Write the failing action-selection tests**

```ts
it("routes an exact live-register match to revision upload", () => {
  expect(nextActionForRecord(exactMatchRecord, true)).toMatchObject({ kind: "start_revision_upload", href: "/Drawings" });
});

it("does not select a target for ambiguous or capped-register evidence", () => {
  expect(nextActionForRecord(ambiguousRecord, true).kind).toBe("resolve_ambiguity");
  expect(nextActionForRecord(missingRecord, false).kind).toBe("review_source_pdf");
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npx vitest run src/lib/docControl/__tests__/nextAction.test.ts src/pages/__tests__/DocumentControl.test.tsx`

Expected: FAIL because no deterministic next-action helper exists.

- [ ] **Step 3: Implement the helper and read-only strip**

```ts
export function nextActionForRecord(record: DocControlRecord, registerComplete: boolean): DocControlNextAction {
  if (!registerComplete) return { kind: "review_source_pdf", label: "Review source PDF", href: null };
  if (record.register.status === "matched") return { kind: "start_revision_upload", label: "Start revision upload", href: "/Drawings" };
  if (record.register.status === "ambiguous") return { kind: "resolve_ambiguity", label: "Resolve sheet match", href: null };
  return { kind: "upload_set", label: "Use Upload Set", href: "/Drawings" };
}
```

Render one action card per identified sheet after the existing review panel. Navigation uses the router only; unresolved states show their review instruction and no fake mutation control.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/lib/docControl/__tests__/nextAction.test.ts src/pages/__tests__/DocumentControl.test.tsx src/lib/docControl/__tests__/docControl.test.ts`

Expected: PASS; Document Control remains read-only and ambiguous records have no hidden target.

```bash
git add src/lib/docControl/nextAction.ts src/lib/docControl/__tests__/nextAction.test.ts src/pages/DocumentControl.tsx src/pages/__tests__/DocumentControl.test.tsx
git commit -m "feat: guide document control handoff"
```

### Task 5: Prepare the owner-controlled server gate extension

**Files:**
- Modify: owner-selected, ledger-stamped migration created through `supabase migration new revision_control_release_gate`
- Create: `supabase/tests/revision_control_release_gate.sql`
- Modify: `src/types/supabase.ts` only after owner application and type generation
- Modify: `e2e/fab-release-gate.spec.ts`

**Interfaces:**
- Consumes: current production `evaluate_fab_release_set`, `work_package_drawing_set_reports`, and `evaluate_release_gate` bodies, plus revision, comparison, downstream, and scoped-model facts.
- Produces: additive JSON `checks.revision_control` with `{ passed, status, reasons, affected_sheet_ids, affected_drawing_set_ids }`.
- Begins only after the owner supplies the current production function snapshot and migration ledger stamp. Never use `supabase db push`.

- [ ] **Step 1: Capture the current server contract before SQL authoring**

Run the owner-approved read-only query against the target environment and keep project-specific output outside source control:

```sql
select pg_get_functiondef('public.evaluate_fab_release_set(uuid,uuid)'::regprocedure);
select pg_get_functiondef('public.work_package_drawing_set_reports(uuid)'::regprocedure);
select pg_get_functiondef('public.evaluate_release_gate(uuid)'::regprocedure);
```

Expected: the snapshot matches the owner-approved lineage. Stop if it differs.

- [ ] **Step 2: Write the failing owner fixture assertions**

```sql
select is(
  public.evaluate_fab_release_set(:project_id, :drawing_set_id) #>> '{checks,revision_control,status}',
  'review_required',
  'changed sheet without comparison is review-required'
);
```

Cover completed visual review, unknown downstream date, exact set link, sequence estimate, absent roster, existing RFI blocker, and reasoned override with disposable fixture rows.

- [ ] **Step 3: Run the fixture to verify failure**

Run: the owner-provided `psql` command with disposable fixture identifiers.

Expected: FAIL because `checks.revision_control` is absent.

- [ ] **Step 4: Create the additive ledger-stamped migration**

Base it on the captured current functions. Add a narrow helper inside the evaluator path that derives changed active sheets and one reason object per missing comparison, unknown downstream state, absent/unresolved scope, or existing hard blocker. Append `checks.revision_control`, combine its pass value with the existing evaluator result, and preserve explicit search path, grants, RLS, JSON keys, and override behavior.

- [ ] **Step 5: Apply only through the owner-controlled procedure and regenerate types**

After the owner applies and stamps the migration in the merge window, run:

```bash
npm run types:db
```

Expected: generated types describe only the applied server contract.

- [ ] **Step 6: Prove server/client parity and commit**

Extend `e2e/fab-release-gate.spec.ts` with a server-rejected `review_required` package and an authorized reasoned override. Run:

```bash
npx playwright test e2e/fab-release-gate.spec.ts
npm run supabase:drift
```

Expected: PASS with no drift.

```bash
```

Stage the one stamped migration safely in PowerShell:

```powershell
$revisionControlMigration = @(Get-ChildItem -LiteralPath supabase/migrations -Filter '*_revision_control_release_gate.sql')
if ($revisionControlMigration.Count -ne 1) { throw 'Expected exactly one owner-stamped revision-control migration.' }
git add -- $revisionControlMigration[0].FullName supabase/tests/revision_control_release_gate.sql src/types/supabase.ts e2e/fab-release-gate.spec.ts
git commit -m "feat: enforce revision control at fab release"
```

### Task 6: Run branch verification and close the slice cleanly

**Files:**
- Modify: `docs/superpowers/specs/2026-09-21-revision-control-safety-design.md` only for a verified scope correction
- Modify: `AGENT_CLAIMS.md` when work is complete

**Interfaces:**
- Consumes: all implemented tasks and current CI commands.
- Produces: verified branch evidence and a preserved boundary before the reviewed hyperlink-proposal slice.

- [ ] **Step 1: Run all affected tests and gates**

Run:

```bash
npx vitest run src/lib/__tests__/revisionControlEvidence.test.ts src/lib/__tests__/detailingRevisionImpact.test.js src/lib/__tests__/revisionSnapshotDiff.test.js src/hooks/__tests__/useRasterCompare.test.tsx src/components/drawings/__tests__/RevisionCompareModal.test.tsx src/pages/drawingSubmittalHub/__tests__/RevisionImpactViews.test.tsx src/pages/drawingSubmittalHub/__tests__/revisionControlEvidence.integration.test.tsx src/lib/docControl/__tests__/nextAction.test.ts src/pages/__tests__/DocumentControl.test.tsx
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm run check:no-new-js
npm test
npm run build
```

Expected: every command exits zero. Record pre-existing failures without changing quality gates or ignore lists.

- [ ] **Step 2: Inspect the exact branch change set**

Run:

```bash
git diff origin/main...HEAD --check
git status --short
git log --oneline origin/main..HEAD
```

Expected: only claimed revision-control files change; no live data, secrets, build output, or hyperlink-proposal logic appears.

- [ ] **Step 3: Release the claim after review/merge handoff**

```bash
git add AGENT_CLAIMS.md
git commit -m "chore: release revision control claim"
```

## Plan self-review

- Spec coverage: Tasks 1–3 implement evidence, comparison recovery, model provenance, and consistent UI. Task 4 covers the read-only Document Control handoff. Task 5 supplies the server-authoritative extension through the owner-controlled procedure. Task 6 verifies the branch and keeps hyperlink proposals out of scope.
- Placeholder scan: no unresolved implementation markers are used; the migration stamp is supplied by the production ledger and is deliberately not invented.
- Type consistency: Task 1 defines `RevisionControlEvidence`, `RevisionControlReason`, `ModelScopeEvidence`, and `RevisionControlStatus`; later tasks use the same names.
- Review-focus coverage: every listed failure mode has a concrete test task.
