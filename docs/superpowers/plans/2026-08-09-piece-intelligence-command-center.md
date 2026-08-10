# Piece Intelligence Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate deterministic drawing-revision exposure, a Changes & Risks Overview, Revision Impact review, Piece Digital Thread, protected actions, and focused dashboard navigation into SteelBuild Pro's existing Piece Register.

**Architecture:** A project-scoped Supabase snapshot repository returns core rows plus per-source availability. Pure TypeScript derives exact revision exposure, shared overview/dashboard metrics, attention priority, URL state, and digital-thread view models. `PieceRegister.tsx` remains orchestration glue; presentational components render immutable models and delegate all writes or owning-module navigation to the page.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, React Router, Supabase JS, Vitest, Testing Library, Playwright, existing command UI and `--cmd-*` CSS tokens.

## Global Constraints

- No database migration, new route family, standalone store, new piece lifecycle, or direct write to `pieces`.
- Exact counts use active `piece_drawing_sets` plus active legacy `piece_drawings` only, then `selectActionableLeafPieces`; mark, profile, and sequence similarity never count as exposure.
- Missing core evidence fails closed. Optional failures remain visible as `unavailable` and make verification `partial`, never zero or safe.
- Bare Approved or Approved as Noted never means fabrication-ready; reuse the existing IFC/Released predicate and canonical release surface.
- Hold writes use `set_piece_hold`; release writes remain in the canonical release RPC/panel; drawing-impact writes use `entities.DrawingImpact` and `withProjectId`.
- The work-package `scheduled_start_date` is the field-needed date. Missing date means unknown and adds no urgency.
- Keep the existing zero-piece Overview onboarding and every existing Piece Register sub-workflow available.
- New source files under `src/` are `.ts`/`.tsx`; imports use `@/*`; components use `--cmd-*` variables under `[data-skin="command"]`.
- Keep query keys project-scoped and invalidate register, relationships, intelligence, drawing impacts, release, reporting, production/logistics, and 3D keys affected by writes.

---

### Task 1: URL intent as a pure, router-safe contract

**Files:**
- Create: `src/lib/pieceControl/pieceIntelligenceUrl.ts`
- Create: `src/lib/pieceControl/pieceIntelligenceUrl.test.ts`
- Modify: `src/pages/pieceRegister/registerHelpers.ts`
- Modify: `src/pages/pieceRegister/__tests__/registerHelpers.test.ts`

**Interfaces:**
- Produces `PieceRegisterIntelligenceView`, `PieceRegisterFocus`, `PieceRegisterUrlState`, `parsePieceRegisterUrl(search)`, and `updatePieceRegisterUrl(search, patch)`.
- `view` values are `overview | impact | register | board | import | relationships | production | logistics | settings`; focus values are `held | revision | release | field`.
- Empty patch values delete the corresponding key while unrelated parameters such as `projectId` remain unchanged.

- [ ] **Step 1: Write failing URL tests**

```ts
expect(parsePieceRegisterUrl("?projectId=p1&view=impact&revision=r1")).toEqual({
  view: "impact", focus: null, pieceId: null, revisionId: "r1",
});
expect(parsePieceRegisterUrl("?view=unknown&focus=unsafe")).toEqual({
  view: "overview", focus: null, pieceId: null, revisionId: null,
});
expect(updatePieceRegisterUrl("?projectId=p1&view=impact", {
  view: "register", pieceId: "piece 1", revisionId: null,
})).toBe("projectId=p1&view=register&piece=piece+1");
```

- [ ] **Step 2: Run the tests and confirm they fail because the module/impact view does not exist**

Run: `npx vitest run src/lib/pieceControl/pieceIntelligenceUrl.test.ts src/pages/pieceRegister/__tests__/registerHelpers.test.ts`  
Expected: FAIL on missing module and missing `impact` view.

- [ ] **Step 3: Implement parsing/serialization and insert the impact tab after Overview**

```ts
export type PieceRegisterFocus = "held" | "revision" | "release" | "field";
export interface PieceRegisterUrlState {
  view: PieceRegisterViewId;
  focus: PieceRegisterFocus | null;
  pieceId: string | null;
  revisionId: string | null;
}
export function parsePieceRegisterUrl(search: string): PieceRegisterUrlState;
export function updatePieceRegisterUrl(
  search: string,
  patch: Partial<PieceRegisterUrlState>,
): string;
```

Update `PIECE_REGISTER_VIEW_IDS` to `overview, impact, register, board, import, relationships, production, logistics, settings` and label `impact` as `Revision Impact`.

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/lib/pieceControl/pieceIntelligenceUrl.test.ts src/pages/pieceRegister/__tests__/registerHelpers.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pieceControl/pieceIntelligenceUrl.ts src/lib/pieceControl/pieceIntelligenceUrl.test.ts src/pages/pieceRegister/registerHelpers.ts src/pages/pieceRegister/__tests__/registerHelpers.test.ts
git commit -m "feat: add Piece Register URL intent"
```

---

### Task 2: Exact revision exposure, overview metrics, and attention priority

**Files:**
- Create: `src/lib/pieceControl/pieceIntelligence.ts`
- Create: `src/lib/pieceControl/pieceIntelligence.test.ts`

**Interfaces:**
- Produces typed source rows, `SourceAvailability<T>`, `PieceIntelligenceSnapshot`, `RevisionExposure`, `PieceAttentionRisk`, `PieceIntelligenceSummary`, `deriveRevisionExposure(snapshot)`, `derivePieceIntelligenceSummary(snapshot, today)`, and `derivePieceAttention(snapshot, exposures, today)`.
- Later repository and UI tasks consume these names verbatim.

- [ ] **Step 1: Write failing exact-link and verification tests**

```ts
const exposures = deriveRevisionExposure(fixture({
  pieces: [container, splitParent, childA, childB, legacyLeaf],
  pieceDrawingSets: [setLink(childA, "set-1"), setLink(childB, "set-1")],
  pieceDrawings: [sheetLink(childA, "dwg-1"), sheetLink(legacyLeaf, "dwg-1")],
  revisions: [currentChangeRevision("rev-1", "dwg-1")],
}));
expect(exposures[0].affectedPieces.map((piece) => piece.id)).toEqual([
  childA.id, childB.id, legacyLeaf.id,
]);
expect(exposures[0].verification).toBe("verified");
expect(exposures[0].affectedPieces).not.toContainEqual(container);
```

Add cases for initial/non-current revisions excluded; set/sheet duplicate deduped; mark/sequence hints ignored; no link returns `link_required`; optional impacts unavailable returns `partial`; a core availability failure throws `PieceIntelligenceCoreUnavailableError`.

- [ ] **Step 2: Write failing priority and metric tests**

```ts
expect(derivePieceAttention(snapshot, exposures, "2026-08-09").map((row) => row.leadingReason)).toEqual([
  "Revision exposure after erection",
  "Revision exposure after delivery",
  "Revision exposure after shipment",
  "Revision exposure during fabrication",
  "Field need is due within 10 days",
  "Critical or high impact remains open",
  "Planned piece has unresolved revision exposure",
  "Explicit drawing relationship required",
]);
expect(summary.metrics.affectedPieces).toBe(6);
expect(summary.metrics.blockedOrHeldPieces).toBe(2);
expect(summary.metrics.fieldNeededWithExposure).toBe(1);
```

Add tie cases for date, work package, `B2` before `B10`, and lot; assert missing `scheduled_start_date` adds no urgency.

- [ ] **Step 3: Run tests and confirm missing derivation failures**

Run: `npx vitest run src/lib/pieceControl/pieceIntelligence.test.ts`  
Expected: FAIL because exports do not exist.

- [ ] **Step 4: Implement immutable typed derivations**

```ts
export type VerificationState = "verified" | "partial" | "link_required";
export type SourceAvailability<T> =
  | { status: "available"; rows: readonly T[] }
  | { status: "unavailable"; rows: readonly []; reason: string };

export function deriveRevisionExposure(
  snapshot: PieceIntelligenceSnapshot,
): readonly RevisionExposure[];

export function derivePieceAttention(
  snapshot: PieceIntelligenceSnapshot,
  exposures: readonly RevisionExposure[],
  today: string,
): readonly PieceAttentionRisk[];

export function derivePieceIntelligenceSummary(
  snapshot: PieceIntelligenceSnapshot,
  today: string,
): PieceIntelligenceSummary;
```

Use `selectActionableLeafPieces` before matching. Build explicit sets for drawing-set and drawing links. Count piece quantities for metrics but keep lot rows for inspectors/tables. Group lifecycle exposure as planned/released, in fabrication/fabricated, shipped, delivered, erected. Determine change revisions from `supersedes_revision_id` or `version_number > 1`, and require `is_current === true` with no `archived_at`.

- [ ] **Step 5: Run pure tests**

Run: `npx vitest run src/lib/pieceControl/pieceIntelligence.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pieceControl/pieceIntelligence.ts src/lib/pieceControl/pieceIntelligence.test.ts
git commit -m "feat: derive exact piece revision exposure"
```

---

### Task 3: Piece Digital Thread derivation

**Files:**
- Create: `src/lib/pieceControl/pieceDigitalThread.ts`
- Create: `src/lib/pieceControl/pieceDigitalThread.test.ts`

**Interfaces:**
- Consumes `PieceIntelligenceSnapshot`, `RevisionExposure`, and existing `isGoverningDrawingReleaseReady` evidence.
- Produces `PieceDigitalThreadModel` and `derivePieceDigitalThread(snapshot, exposures, pieceId)`.

- [ ] **Step 1: Write failing five-section and honesty tests**

```ts
const thread = derivePieceDigitalThread(snapshot, exposures, "piece-1");
expect(thread?.sections.map((section) => section.key)).toEqual([
  "identity", "model_drawing", "commercial_constraints", "production_logistics", "history",
]);
expect(thread?.commercial.changeOrder.signal).toBe(true);
expect(thread?.commercial.changeOrder.linkLabel).toBe("Not linked");
expect(thread?.history.map((event) => event.id)).toEqual(["event-new", "impact-event", "event-old"]);
expect(thread?.modelDrawing.approval.releaseReady).toBe(false);
```

Add cases for set-only links expanding to sheets, legacy fallback, missing RFI/impact/event sources labeled `Unavailable`, unresolved dispositions, release evidence, station, shipped/delivered/erected references, and unknown field-needed date.

- [ ] **Step 2: Run tests and confirm missing-module failure**

Run: `npx vitest run src/lib/pieceControl/pieceDigitalThread.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the digital-thread model**

```ts
export interface PieceDigitalThreadModel {
  pieceId: string;
  title: string;
  sections: readonly { key: DigitalThreadSectionKey; label: string }[];
  identity: PieceIdentityThread;
  modelDrawing: PieceModelDrawingThread;
  commercial: PieceCommercialThread;
  productionLogistics: PieceProductionLogisticsThread;
  history: readonly PieceThreadEvent[];
  warnings: readonly string[];
}
export function derivePieceDigitalThread(
  snapshot: PieceIntelligenceSnapshot,
  exposures: readonly RevisionExposure[],
  pieceId: string | null | undefined,
): PieceDigitalThreadModel | null;
```

Approval readiness must delegate to `isGoverningDrawingReleaseReady`. Merge canonical `piece_events` and drawing-impact activity into a stable newest-first sequence. Do not parse a CO number or value out of free text.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/pieceControl/pieceDigitalThread.test.ts src/lib/pieceControl/__tests__/drawingReleaseReady.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pieceControl/pieceDigitalThread.ts src/lib/pieceControl/pieceDigitalThread.test.ts
git commit -m "feat: derive piece digital threads"
```

---

### Task 4: Project-scoped intelligence repository and cache invalidation

**Files:**
- Create: `src/lib/pieceControl/pieceIntelligenceRepository.ts`
- Create: `src/lib/pieceControl/pieceIntelligenceRepository.test.ts`
- Modify: `src/lib/pieceControl/queryKeys.ts`
- Modify: `src/lib/pieceControl/__tests__/productionHardening.test.ts`

**Interfaces:**
- Produces `fetchPieceIntelligenceSnapshot(projectId): Promise<PieceIntelligenceSnapshot>`.
- Adds `pieceControlKeys.intelligence(projectId)` and `pieceControlKeys.digitalThread(projectId, pieceId)`.
- Core sources: pieces, `piece_drawing_sets`, `piece_drawings`, drawings, drawing sets, revisions, work packages.
- Optional sources: impacts, drawing links/RFIs, submittals/responses/reviews/signoffs/dispositions, releases/station completions, piece events.

- [ ] **Step 1: Write failing repository tests with a fluent Supabase mock**

Assert every query receives `.eq("project_id", projectId)`, core sources page beyond 1,000 rows, inactive links/rows are removed defensively, core error rejects, and each optional error produces `{ status: "unavailable", rows: [], reason }` without hiding exact core exposure.

```ts
await expect(fetchPieceIntelligenceSnapshot("project-1")).rejects.toThrow("[drawing_revisions]");
const snapshot = await fetchPieceIntelligenceSnapshot("project-1");
expect(snapshot.impacts.status).toBe("unavailable");
expect(snapshot.pieces.status).toBe("available");
```

- [ ] **Step 2: Run repository tests and confirm failures**

Run: `npx vitest run src/lib/pieceControl/pieceIntelligenceRepository.test.ts src/lib/pieceControl/__tests__/productionHardening.test.ts`  
Expected: FAIL on missing repository and keys.

- [ ] **Step 3: Implement explicit, paged, availability-aware queries**

Use the existing `supabase as any` convention because generated types do not include current Piece Control tables. Query explicit projections, filter by project, and normalize errors with tagged table names. RFI inclusion must come only through active `drawing_links` whose `linked_record_type === "rfi"`; metadata piece-mark hints remain non-authoritative.

- [ ] **Step 4: Extend centralized invalidation**

```ts
intelligence: (projectId: string) => ["piece-intelligence", projectId] as const,
digitalThread: (projectId: string, pieceId?: string) =>
  pieceId
    ? (["piece-digital-thread", projectId, pieceId] as const)
    : (["piece-digital-thread", projectId] as const),
```

Push both key prefixes for `all`, `register`, `relationships`, `production`, and `logistics` scopes. Preserve all existing invalidations.

- [ ] **Step 5: Run repository and invalidation tests**

Run: `npx vitest run src/lib/pieceControl/pieceIntelligenceRepository.test.ts src/lib/pieceControl/__tests__/productionHardening.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pieceControl/pieceIntelligenceRepository.ts src/lib/pieceControl/pieceIntelligenceRepository.test.ts src/lib/pieceControl/queryKeys.ts src/lib/pieceControl/__tests__/productionHardening.test.ts
git commit -m "feat: load piece intelligence snapshots"
```

---

### Task 5: Presentational Overview, Revision Impact, and Digital Thread components

**Files:**
- Modify: `src/pages/pieceRegister/PieceRegisterOverview.tsx`
- Create: `src/pages/pieceRegister/PieceRevisionImpactView.tsx`
- Create: `src/pages/pieceRegister/PieceDigitalThread.tsx`
- Create: `src/pages/pieceRegister/__tests__/PieceIntelligenceViews.test.tsx`
- Modify: `src/styles/piece-control-command.css`
- Modify: `src/pages/pieceRegister/__tests__/pieceRegisterTheme.test.js`

**Interfaces:**
- Overview consumes `PieceIntelligenceSummary | null`, query state, readiness/shipments, and callbacks for revision, piece, release, relationship, register, import, and logistics navigation.
- Revision view consumes exposures, selected revision/piece IDs, availability/error states, RBAC booleans, and callbacks. It performs no writes.
- Digital Thread consumes `PieceDigitalThreadModel | null`, availability state, permission booleans, and callbacks. It performs no writes.

- [ ] **Step 1: Write failing component tests**

Cover: unchanged zero-piece workflow; populated Overview heading **Changes & Risks**, one **Review revision impact** primary action, four metrics, impact/attention panels before readiness/shipments; revision selection shows exact pieces; digital thread has five ordered sections and **Not linked**; unavailable labels; disabled unauthorized hold/impact actions; retry state.

- [ ] **Step 2: Run component tests and confirm failures**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceIntelligenceViews.test.tsx src/pages/pieceRegister/__tests__/pieceRegisterTheme.test.js`  
Expected: FAIL because the views/styles do not exist.

- [ ] **Step 3: Implement semantic, table-first views**

Use native `button`, `input`, `select`, headings, tables, `aria-current`/`aria-pressed`, and visible text verification labels. Preserve the entire current `displayRowCount === 0` branch behavior. Provide callbacks named:

```ts
onSelectRevision(revisionId: string): void;
onInspectPiece(pieceId: string): void;
onOpenRelationships(): void;
onOpenRelease(workPackageId: string): void;
onApplyHold(pieceId: string, reason: string): void;
onClearHold(pieceId: string): void;
onCreateImpact(revisionId: string, input: DrawingImpactInput): void;
onResolveImpact(impactId: string): void;
```

- [ ] **Step 4: Add command-token/responsive CSS**

Add prefixed `.piece-intelligence-*` rules using only `var(--cmd-*)`. At `max-width: 1100px`, stack decision panels and preserve table scrolling. At `max-width: 680px`, use two metric columns and a full-width ordered inspector. Retain `prefers-reduced-motion` behavior.

- [ ] **Step 5: Run component/theme tests**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceIntelligenceViews.test.tsx src/pages/pieceRegister/__tests__/pieceRegisterTheme.test.js`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/pieceRegister/PieceRegisterOverview.tsx src/pages/pieceRegister/PieceRevisionImpactView.tsx src/pages/pieceRegister/PieceDigitalThread.tsx src/pages/pieceRegister/__tests__/PieceIntelligenceViews.test.tsx src/styles/piece-control-command.css src/pages/pieceRegister/__tests__/pieceRegisterTheme.test.js
git commit -m "feat: add Piece Register intelligence views"
```

---

### Task 6: Piece Register orchestration, protected actions, and deep links

**Files:**
- Modify: `src/pages/PieceRegister.tsx`
- Modify: `src/pages/pieceRegister/PieceRegisterRegisterView.tsx`
- Modify: `src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`
- Modify: `src/pages/pieceRegister/__tests__/extractedViews.test.tsx`
- Modify: `src/__tests__/pieceRegisterWiring.test.ts`

**Interfaces:**
- Uses `useLocation`/`useNavigate`; URL `piece` focus remains separate from bulk `selectedPieceIds`.
- Queries `pieceControlKeys.intelligence(projectId)` only when Piece Control is enabled and active pieces exist.
- Page owns `setPieceHold`, DrawingImpact create/resolve, invalidation, and owning-module navigation.

- [ ] **Step 1: Extend the Router-aware page test harness and add failing route tests**

Wrap page renders in `MemoryRouter` and accept initial entries. Assert direct `?view=impact&revision=rev-1`, tab clicks update the URL while preserving `projectId`, stale revision/piece IDs clear only their selection, `?view=register&piece=piece-1` opens the thread without checking a bulk checkbox, and tab order matches the design.

- [ ] **Step 2: Add failing action tests**

Assert a hold cannot submit without a trimmed reason, permitted hold calls `setPieceHold(projectId, [pieceId], true, reason)`, clear calls the same helper with `false`, DrawingImpact create includes project/revision and existing defaults, resolve writes `status: "resolved"` plus `resolved_at`, errors show only error language, and success invalidates intelligence/digital-thread/canonical keys.

- [ ] **Step 3: Run page tests and confirm failures**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/pages/pieceRegister/__tests__/extractedViews.test.tsx src/__tests__/pieceRegisterWiring.test.ts`  
Expected: FAIL on URL state, new views, inspect control, and action wiring.

- [ ] **Step 4: Implement URL/query/view orchestration**

Use `parsePieceRegisterUrl(location.search)` as the render truth and `updatePieceRegisterUrl` with `navigate({ search }, { replace: false })` for user navigation. On project change clear selection state and replace invalid identifiers after snapshot resolution. Keep `selectedPieceIds` exclusively for bulk work. Add an accessible **Inspect digital thread** button in each register mark cell calling `onInspectPiece(piece.id)`.

- [ ] **Step 5: Implement protected mutations and owning-module links**

```ts
await setPieceHold(projectId, [pieceId], true, reason.trim());
await entities.DrawingImpact.create(withProjectId({
  drawing_revision_id: revisionId,
  impact_type: input.impactType,
  status: "open",
  priority: input.priority,
  title: input.title.trim(),
  assigned_to: input.assignedTo || null,
  due_date: input.dueDate || null,
}, projectId) as never);
```

Resolve through `entities.DrawingImpact.update`. Navigate relationship repair to `view=relationships`; release to `/WorkPackages?id=<wp>&pieceControl=1`; drawing/RFI/commercial complex edits to their current owning routes. Do not render inline canonical release logic.

- [ ] **Step 6: Run page and focused domain tests**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/pages/pieceRegister/__tests__/extractedViews.test.tsx src/__tests__/pieceRegisterWiring.test.ts src/lib/pieceControl/pieceIntelligence.test.ts src/lib/pieceControl/pieceDigitalThread.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PieceRegister.tsx src/pages/pieceRegister/PieceRegisterRegisterView.tsx src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/pages/pieceRegister/__tests__/extractedViews.test.tsx src/__tests__/pieceRegisterWiring.test.ts
git commit -m "feat: wire Piece Register intelligence workflow"
```

---

### Task 7: Shared dashboard summary, browser acceptance, and full gates

**Files:**
- Modify: `src/components/pieceControl/PieceControlDashboardPanel.tsx`
- Modify: `src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx`
- Modify: `src/pages/dashboardCC/DashboardControlCenter.tsx`
- Modify: `src/pages/Dashboard.jsx`
- Create: `e2e/piece-intelligence.spec.ts`

**Interfaces:**
- Dashboard panel consumes the same `derivePieceIntelligenceSummary` result as Overview.
- `onOpen(intent)` accepts `{ view, focus?, revisionId?, pieceId? }`; the dashboard serializer emits `view`, `focus`, `revision`, and `piece` options.

- [ ] **Step 1: Write failing dashboard deep-link tests**

```ts
fireEvent.click(await screen.findByRole("button", { name: /held pieces/i }));
expect(onOpen).toHaveBeenCalledWith({ view: "overview", focus: "held" });
fireEvent.click(screen.getByRole("button", { name: /revision exposure/i }));
expect(onOpen).toHaveBeenCalledWith({ view: "impact", focus: "revision" });
```

Assert the panel's exception metrics equal `derivePieceIntelligenceSummary` for the same fixture and the off/loading/error/empty behavior remains intact.

- [ ] **Step 2: Run dashboard tests and confirm failures**

Run: `npx vitest run src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx`  
Expected: FAIL because focused intents/shared intelligence are not wired.

- [ ] **Step 3: Implement shared dashboard derivation and route serialization**

Keep the panel callback-only and router-free. Extend `onNavigateDash` option serialization with `view`, `focus`, `revisionId -> revision`, and `pieceId -> piece`, all through `encodeURIComponent`. Preserve current option keys.

- [ ] **Step 4: Add Playwright acceptance with existing auth guards**

The spec must skip with a clear reason unless a seeded authenticated project exposes an exact current change revision. Read-only flow: visit `/PieceRegister?projectId=<id>&view=impact`, select a revision, select an exact piece, assert five digital-thread sections. Mutation flow runs only behind the existing disposable staging fixture guard and applies then clears a hold. Add desktop, tablet, and mobile screenshots plus light/dark assertions without committing generated images.

- [ ] **Step 5: Run focused tests and credential-free Playwright parse**

Run: `npx vitest run src/lib/pieceControl/pieceIntelligence.test.ts src/lib/pieceControl/pieceDigitalThread.test.ts src/lib/pieceControl/pieceIntelligenceRepository.test.ts src/pages/pieceRegister/__tests__/PieceIntelligenceViews.test.tsx src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx`  
Expected: PASS.  
Run: `npx playwright test e2e/piece-intelligence.spec.ts --list`  
Expected: spec parses and tests are listed.

- [ ] **Step 6: Run React best-practices review on all changed TSX files and fix concrete findings**

Review query duplication, memo dependencies, rerender-heavy derived work, stable callbacks, list keys, accessibility, and avoid effects that duplicate URL-derived state. Re-run the focused component tests after any correction.

- [ ] **Step 7: Run all repository gates**

```bash
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm run check:no-new-js
npm test
npm run build
```

Expected: every command exits 0. If browser credentials/fixture are available, run `npx playwright test e2e/piece-intelligence.spec.ts`; otherwise record authenticated browser acceptance as unexecuted, not passed.

- [ ] **Step 8: Commit**

```bash
git add src/components/pieceControl/PieceControlDashboardPanel.tsx src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx src/pages/dashboardCC/DashboardControlCenter.tsx src/pages/Dashboard.jsx e2e/piece-intelligence.spec.ts
git commit -m "feat: deep-link Piece Control dashboard risks"
```
