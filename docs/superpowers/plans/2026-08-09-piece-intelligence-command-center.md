# Piece Intelligence Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend SteelBuild Pro's existing Piece Register and dashboard so a PM can review exact revision-to-piece exposure, prioritize downstream risk, inspect a piece's digital thread, and act through existing protected workflows.

**Architecture:** Add source-aware project snapshot reads and pure TypeScript derivation modules under `src/lib/pieceControl/`. Keep `PieceRegister.tsx` as query/mutation composition glue, render new focused Overview, Revision Impact, and Digital Thread components, and reuse existing hold, drawing-impact, production, logistics, and fabrication-release authorities.

**Tech Stack:** React 18, TypeScript 5.8, Vite 6, TanStack Query 5, Supabase/PostgREST + existing RPCs, Vitest 4, Testing Library, existing SteelBuild command UI/CSS tokens.

## Global Constraints

- Integrate only into the existing SteelBuild Pro SPA; do not create another app, route family, backend, Supabase project, or local-only store.
- Add no database migration in this slice.
- New source files must be `.ts`/`.tsx`; `npm run check:no-new-js` must pass.
- Exact impact counts come only from `piece_drawing_sets` or legacy `piece_drawings`; sequence and mark-pattern hints never count as verified impact.
- Filter all impact counts through `selectActionableLeafPieces`; containers, split parents, soft-deleted rows, and duplicates cannot inflate totals.
- Submittals remain approval authority; bare Approved/AAN is not release-ready unless the existing governing-drawing predicate says IFC/Released.
- Holds use `set_piece_hold`; releases use the existing canonical gate/RPC; no direct client writes to `pieces`.
- Command surfaces use `--cmd-*` tokens under `[data-skin="command"]`; do not force a light theme or add `.sbd-*` wrappers.
- Preserve the current empty-register import/reconciliation path and all existing Piece Register views.
- Preserve project RBAC, organization-scoped RLS, honest loading/error states, and the existing fab-release E2E path.
- Do not use `<form>` or Radix Dialog.

---

## File Structure

### Create

- `src/lib/pieceControl/pieceIntelligenceTypes.ts` — shared source availability and derived view-model types.
- `src/lib/pieceControl/revisionExposure.ts` — exact revision-to-piece matching and exposure grouping.
- `src/lib/pieceControl/pieceIntelligenceDerive.ts` — command metrics, attention priority, and digital-thread derivation.
- `src/lib/pieceControl/pieceIntelligenceRepository.ts` — project-scoped source snapshot with per-source availability.
- `src/lib/pieceControl/__tests__/revisionExposure.test.ts` — exact matching and verification tests.
- `src/lib/pieceControl/__tests__/pieceIntelligenceDerive.test.ts` — priority, summary, and digital-thread tests.
- `src/lib/pieceControl/__tests__/pieceIntelligenceRepository.test.ts` — core failure and optional-source degradation tests.
- `src/pages/pieceRegister/pieceRegisterLocation.ts` — supported view/focus query parsing and serialization.
- `src/pages/pieceRegister/__tests__/pieceRegisterLocation.test.ts` — URL-state tests.
- `src/pages/pieceRegister/PieceRevisionImpactView.tsx` — revision list, selected revision, and affected-piece table.
- `src/pages/pieceRegister/PieceDigitalThread.tsx` — identity-to-history piece inspector.
- `src/pages/pieceRegister/__tests__/PieceRevisionImpactView.test.tsx` — revision-view component tests.
- `src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx` — inspector component tests.

### Modify

- `src/pages/PieceRegister.tsx` — add query, URL state, mutations, invalidation, and view composition.
- `src/pages/pieceRegister/registerHelpers.ts` — register the `impact` view and label.
- `src/pages/pieceRegister/PieceRegisterOverview.tsx` — populated Changes & Risks layout; preserve empty state.
- `src/pages/pieceRegister/PieceRegisterRegisterView.tsx` — render Digital Thread for a single selected piece.
- `src/lib/pieceControl/relationshipsRepository.ts` — report availability for optional relationship/approval sources.
- `src/lib/pieceControl/readiness.ts` — expose revision dates, drawing RFI links, and work-package field dates needed by the read model.
- `src/lib/pieceControl/__tests__/relationshipsRepository.test.ts` — source-availability regression tests.
- `src/pages/pieceRegister/__tests__/PieceRegister.test.tsx` — shell/integration tests.
- `src/pages/pieceRegister/__tests__/overviewDerive.test.ts` — keep existing readiness/ship behavior covered.
- `src/components/pieceControl/PieceControlDashboardPanel.tsx` — shared exception summary and focus callback.
- `src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx` — dashboard focus tests.
- `src/pages/dashboardCC/DashboardControlCenter.tsx` — pass Piece Register focus to dashboard navigation.
- `src/pages/Dashboard.jsx` — serialize `view` and `focus` navigation options.
- `src/__tests__/pieceRegisterWiring.test.ts` — deep-link wiring assertions.
- `src/styles/piece-control-command.css` — approved command-center, impact table, and inspector layout.

---

### Task 1: Exact Revision Exposure Domain

**Files:**
- Create: `src/lib/pieceControl/pieceIntelligenceTypes.ts`
- Create: `src/lib/pieceControl/revisionExposure.ts`
- Create: `src/lib/pieceControl/__tests__/revisionExposure.test.ts`

**Interfaces:**
- Consumes: `PieceRegisterRow`, `ReadinessPieceDrawing`, `ReadinessPieceDrawingSet`, `ReadinessDrawing`, `DrawingRevisionEvidence`, `selectActionableLeafPieces`.
- Produces: `deriveRevisionExposure(snapshot: PieceIntelligenceSnapshot): RevisionExposureRow[]` and the shared types used by every later task.

- [ ] **Step 1: Write the failing exact-match tests**

```ts
import { describe, expect, it } from "vitest";
import { deriveRevisionExposure } from "../revisionExposure";
import type { PieceIntelligenceSnapshot } from "../pieceIntelligenceTypes";

function snapshot(
  patch: Partial<PieceIntelligenceSnapshot> = {},
): PieceIntelligenceSnapshot {
  return {
    pieces: [
      { id: "p1", project_id: "prj", piece_mark: "B1", normalized_piece_mark: "B1", lot_code: "A", parent_piece_id: null, quantity: 1, profile: "W12x26", material_grade: "A992", weight_each_lbs: 500, weight_total_lbs: 500, work_package_id: "wp1", lifecycle_status: "in_fabrication", current_station: "fit", on_hold: false, is_container: false, is_deleted: false, source_system: "csv", external_ref: null, metadata: null, updated_at: "2026-08-09T12:00:00Z", deleted_at: null },
    ],
    pieceDrawingSets: [{ project_id: "prj", piece_id: "p1", drawing_set_id: "set1" }],
    pieceDrawings: [],
    drawings: [{ id: "d1", project_id: "prj", drawing_set_id: "set1", sheet_number: "E502", title: "Framing", is_deleted: false, deleted_at: null, is_superseded: false }],
    drawingSets: [{ id: "set1", set_name: "Building 2", is_deleted: false, deleted_at: null }],
    drawingRevisions: [{ id: "r4", drawing_id: "d1", is_current: true, archived_at: null, revision_code: "4" }],
    workPackages: [{ id: "wp1", project_id: "prj", wp_number: "WP-004", sequence_number: "4", scheduled_start_date: "2026-08-16" }],
    submittals: [], sheetResponses: [], drawingReviews: [], drawingSignoffs: [], commentDispositions: [],
    drawingImpacts: [], rfis: [], pieceEvents: [],
    availability: { relationships: "available", approvals: "available", impacts: "available", rfis: "available", events: "available" },
    ...patch,
  };
}

describe("deriveRevisionExposure", () => {
  it("counts exact drawing-set links and groups the downstream lifecycle", () => {
    const [row] = deriveRevisionExposure(snapshot());
    expect(row.revisionId).toBe("r4");
    expect(row.verification).toBe("verified");
    expect(row.affectedPieceIds).toEqual(["p1"]);
    expect(row.exposure.in_fabrication).toBe(1);
  });

  it("does not count a sequence-only match", () => {
    const [row] = deriveRevisionExposure(snapshot({ pieceDrawingSets: [] }));
    expect(row.verification).toBe("link_required");
    expect(row.affectedPieceIds).toEqual([]);
  });

  it("removes containers and split parents through the actionable-leaf selector", () => {
    const source = snapshot();
    source.pieces = [
      { ...source.pieces[0], id: "root", lot_code: "ALL", is_container: true },
      { ...source.pieces[0], id: "lot-a", parent_piece_id: "root" },
    ];
    source.pieceDrawingSets = source.pieces.map((piece) => ({ project_id: "prj", piece_id: piece.id, drawing_set_id: "set1" }));
    const [row] = deriveRevisionExposure(source);
    expect(row.affectedPieceIds).toEqual(["lot-a"]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm the missing-module failure**

Run: `npx vitest run src/lib/pieceControl/__tests__/revisionExposure.test.ts`

Expected: FAIL because `revisionExposure.ts` and `pieceIntelligenceTypes.ts` do not exist.

- [ ] **Step 3: Add the shared types and minimal exact-link derivation**

```ts
// pieceIntelligenceTypes.ts
export type SourceAvailability = "available" | "unavailable";
export type ImpactVerification = "verified" | "partial" | "link_required";
export type ExposureLifecycle = "not_started" | "released" | "in_fabrication" | "fabricated" | "shipped" | "delivered" | "erected";

export interface PieceIntelligenceWorkPackage extends ReadinessWorkPackage {
  scheduled_start_date?: string | null;
}

export interface PieceIntelligenceRevision extends DrawingRevisionEvidence {
  issued_at?: string | null;
  received_at?: string | null;
}

export interface PieceIntelligenceRfi {
  id: string;
  project_id: string;
  rfi_number?: string | null;
  status?: string | null;
  fab_hold?: boolean | null;
  work_package_id?: string | null;
}

export interface PieceIntelligenceEvent {
  id: string;
  project_id: string;
  piece_id: string;
  event_type: string;
  previous_state?: Record<string, unknown> | null;
  next_state?: Record<string, unknown> | null;
  reason?: string | null;
  created_at: string;
}

export interface RevisionExposureRow {
  revisionId: string;
  drawingId: string;
  drawingSetId: string | null;
  sheetNumber: string;
  revisionCode: string;
  affectedPieceIds: string[];
  affectedWorkPackageIds: string[];
  verification: ImpactVerification;
  exposure: Record<ExposureLifecycle, number>;
  heldCount: number;
  openImpactCount: number;
  openRfiCount: number;
}

export interface PieceIntelligenceSnapshot extends Omit<PieceRelationshipSnapshot, "workPackages" | "drawingRevisions"> {
  workPackages: PieceIntelligenceWorkPackage[];
  drawingRevisions: PieceIntelligenceRevision[];
  drawingImpacts: DrawingImpactRow[];
  rfis: PieceIntelligenceRfi[];
  pieceEvents: PieceIntelligenceEvent[];
  availability: {
    relationships: SourceAvailability;
    approvals: SourceAvailability;
    impacts: SourceAvailability;
    rfis: SourceAvailability;
    events: SourceAvailability;
  };
}
```

```ts
// revisionExposure.ts
export function deriveRevisionExposure(
  snapshot: PieceIntelligenceSnapshot,
): RevisionExposureRow[] {
  const actionable = selectActionableLeafPieces(snapshot.pieces);
  const pieceById = new Map(actionable.map((piece) => [piece.id, piece]));
  const setLinks = indexIds(snapshot.pieceDrawingSets, "drawing_set_id");
  const drawingLinks = indexIds(snapshot.pieceDrawings, "drawing_id");
  return snapshot.drawingRevisions
    .filter((revision) => revision.is_current && !revision.archived_at)
    .map((revision) => buildRevisionRow(revision, snapshot, pieceById, setLinks, drawingLinks))
    .sort(compareRevisionExposure);
}
```

Implement `buildRevisionRow` so set links and legacy sheet links are unioned,
deduplicated, and filtered through `pieceById`. Initialize every lifecycle key to
zero. Set verification to `link_required` when the exact union is empty and to
`partial` when an enrichment source needed by the row is unavailable.

- [ ] **Step 4: Run the exact-match tests**

Run: `npx vitest run src/lib/pieceControl/__tests__/revisionExposure.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain slice**

```bash
git add src/lib/pieceControl/pieceIntelligenceTypes.ts src/lib/pieceControl/revisionExposure.ts src/lib/pieceControl/__tests__/revisionExposure.test.ts
git commit -m "feat: derive exact piece revision exposure"
```

---

### Task 2: Source-Aware Piece Intelligence Repository

**Files:**
- Create: `src/lib/pieceControl/pieceIntelligenceRepository.ts`
- Create: `src/lib/pieceControl/__tests__/pieceIntelligenceRepository.test.ts`
- Modify: `src/lib/pieceControl/relationshipsRepository.ts`
- Modify: `src/lib/pieceControl/readiness.ts`
- Modify: `src/lib/pieceControl/__tests__/relationshipsRepository.test.ts`
- Modify: `src/lib/pieceControl/queryKeys.ts`

**Interfaces:**
- Consumes: `fetchPieceRelationshipSnapshot(projectId)`, `entities.DrawingImpact`, `entities.RFI`, and project-scoped Supabase reads of `piece_events`.
- Produces: `fetchPieceIntelligenceSnapshot(projectId: string): Promise<PieceIntelligenceSnapshot>` and `pieceControlKeys.intelligence(projectId)`.

- [ ] **Step 1: Write repository degradation tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPieceIntelligenceSnapshot } from "../pieceIntelligenceRepository";
import { fetchPieceRelationshipSnapshot } from "../relationshipsRepository";

vi.mock("../relationshipsRepository", () => ({ fetchPieceRelationshipSnapshot: vi.fn() }));

const entityMocks = vi.hoisted(() => ({
  impacts: vi.fn().mockResolvedValue([]),
  rfis: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingImpact: { filter: entityMocks.impacts },
    RFI: { filter: entityMocks.rfis },
  },
}));

const eventSource = vi.hoisted(() => ({ error: null as unknown }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.range = vi.fn(async () => ({ data: eventSource.error ? null : [], error: eventSource.error }));
      return chain;
    }),
  },
}));

const available = {
  pieceDrawings: "available",
  pieceDrawingSets: "available",
  drawings: "available",
  drawingSets: "available",
  revisions: "available",
  approvals: "available",
} as const;

const baseRelationshipSnapshot = {
  pieces: [], pieceDrawings: [], pieceDrawingSets: [], drawings: [],
  workPackages: [], drawingSets: [], submittals: [], sheetResponses: [],
  drawingRevisions: [], drawingReviews: [], drawingSignoffs: [],
  commentDispositions: [], sourceAvailability: available,
};

describe("fetchPieceIntelligenceSnapshot", () => {
  beforeEach(() => {
    eventSource.error = null;
    entityMocks.impacts.mockResolvedValue([]);
    entityMocks.rfis.mockResolvedValue([]);
  });

  it("fails closed when the relationship snapshot fails", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockRejectedValue(new Error("pieces unavailable"));
    await expect(fetchPieceIntelligenceSnapshot("prj")).rejects.toThrow("pieces unavailable");
  });

  it("keeps exact relationships and labels optional event failure unavailable", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue(baseRelationshipSnapshot);
    eventSource.error = { code: "42501", message: "denied" };
    const result = await fetchPieceIntelligenceSnapshot("prj");
    expect(result.pieces).toEqual(baseRelationshipSnapshot.pieces);
    expect(result.pieceEvents).toEqual([]);
    expect(result.availability.events).toBe("unavailable");
  });

  it("marks relationship evidence unavailable instead of reporting link required", async () => {
    vi.mocked(fetchPieceRelationshipSnapshot).mockResolvedValue({
      ...baseRelationshipSnapshot,
      sourceAvailability: { ...baseRelationshipSnapshot.sourceAvailability, pieceDrawingSets: "unavailable" },
    });
    const result = await fetchPieceIntelligenceSnapshot("prj");
    expect(result.availability.relationships).toBe("unavailable");
  });
});
```

- [ ] **Step 2: Run the repository tests and confirm failure**

Run: `npx vitest run src/lib/pieceControl/__tests__/pieceIntelligenceRepository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement core/optional read separation**

```ts
export async function fetchPieceIntelligenceSnapshot(
  projectId: string,
): Promise<PieceIntelligenceSnapshot> {
  const relationships = await fetchPieceRelationshipSnapshot(projectId);
  const [impacts, rfis, events] = await Promise.all([
    optionalSource(() => entities.DrawingImpact.filter({ project_id: projectId })),
    optionalSource(() => entities.RFI.filter({ project_id: projectId })),
    optionalSource(() => fetchPieceEvents(projectId)),
  ]);
  return {
    ...relationships,
    drawingImpacts: impacts.rows,
    rfis: rfis.rows,
    pieceEvents: events.rows,
    availability: {
      relationships: requiredRelationshipSourcesAvailable(relationships.sourceAvailability)
        ? "available"
        : "unavailable",
      approvals: relationships.sourceAvailability.approvals,
      impacts: impacts.availability,
      rfis: rfis.availability,
      events: events.availability,
    },
  };
}
```

Change `fetchOptionalProjectRows` in `relationshipsRepository.ts` to return both
rows and availability. Add `sourceAvailability` to `PieceRelationshipSnapshot`
with individual link/drawing sources and a rolled-up `approvals` value. Existing
Lots & Links consumers continue receiving empty arrays; Piece Intelligence gains
the distinction between an empty source and an unavailable source. Extend the
existing selects/types with `drawings.linked_rfi_ids`, revision
`issued_at/received_at`, and work-package `scheduled_start_date`.

```ts
export type RelationshipSourceAvailabilityValue = "available" | "unavailable";

export interface RelationshipSourceAvailability {
  pieceDrawings: RelationshipSourceAvailabilityValue;
  pieceDrawingSets: RelationshipSourceAvailabilityValue;
  drawings: RelationshipSourceAvailabilityValue;
  drawingSets: RelationshipSourceAvailabilityValue;
  revisions: RelationshipSourceAvailabilityValue;
  approvals: RelationshipSourceAvailabilityValue;
}

export interface PieceRelationshipSnapshot {
  // existing row arrays stay unchanged
  sourceAvailability: RelationshipSourceAvailability;
}
```

Update every `PieceRelationshipSnapshot` fixture in the modified repository and
Piece Intelligence tests with all six values set to `"available"` unless that
test intentionally simulates a failed source.

`optionalSource` catches the enrichment error, logs a source-tagged warning, and
returns `{ rows: [], availability: "unavailable" }`. `fetchPieceEvents` selects
project-scoped active event history ordered newest-first in pages of 1,000. Add:

```ts
intelligence: (projectId: string) => ["piece-intelligence", projectId] as const,
```

to `pieceControlKeys`, and include that key in `invalidatePieceControlQueries`
for register, relationship, production, logistics, import, and all scopes.

- [ ] **Step 4: Run repository and relationship tests**

Run: `npx vitest run src/lib/pieceControl/__tests__/pieceIntelligenceRepository.test.ts src/lib/pieceControl/__tests__/relationshipsRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the repository slice**

```bash
git add src/lib/pieceControl/pieceIntelligenceRepository.ts src/lib/pieceControl/__tests__/pieceIntelligenceRepository.test.ts src/lib/pieceControl/relationshipsRepository.ts src/lib/pieceControl/readiness.ts src/lib/pieceControl/__tests__/relationshipsRepository.test.ts src/lib/pieceControl/queryKeys.ts
git commit -m "feat: load piece intelligence source snapshot"
```

---

### Task 3: Priority, Command Metrics, and Digital Thread Derivation

**Files:**
- Create: `src/lib/pieceControl/pieceIntelligenceDerive.ts`
- Create: `src/lib/pieceControl/__tests__/pieceIntelligenceDerive.test.ts`
- Modify: `src/lib/pieceControl/pieceIntelligenceTypes.ts`

**Interfaces:**
- Consumes: `RevisionExposureRow[]`, `PieceIntelligenceSnapshot`, work-package `scheduled_start_date`, and `new Date()` supplied as an explicit argument.
- Produces: `derivePieceIntelligence(snapshot, now): PieceIntelligenceModel` and `buildPieceDigitalThread(pieceId, snapshot): PieceDigitalThreadModel | null`.

- [ ] **Step 1: Write priority and honesty tests**

```ts
describe("derivePieceIntelligence", () => {
  it("orders erected before delivered, shipped, fabricated, and planned exposure", () => {
    const model = derivePieceIntelligence(prioritySnapshot, new Date("2026-08-09T12:00:00Z"));
    expect(model.attention.map((row) => row.pieceId)).toEqual([
      "erected", "delivered", "shipped", "fabricated", "planned",
    ]);
  });

  it("uses assigned work-package scheduled_start_date as field need", () => {
    const model = derivePieceIntelligence(fieldDateSnapshot, new Date("2026-08-09T12:00:00Z"));
    expect(model.attention[0].fieldNeededDate).toBe("2026-08-12");
    expect(model.attention[0].reason).toMatch(/field need/i);
  });

  it("does not infer urgency when scheduled_start_date is missing", () => {
    const model = derivePieceIntelligence(noDateSnapshot, new Date("2026-08-09T12:00:00Z"));
    expect(model.attention[0].fieldNeededDate).toBeNull();
  });
});

describe("buildPieceDigitalThread", () => {
  it("labels an unlinked CO record instead of inventing a number or cost", () => {
    const thread = buildPieceDigitalThread("p1", commercialSignalSnapshot);
    expect(thread?.commercial.facts).toContainEqual({ label: "Change exposure", value: "Change impact recorded" });
    expect(thread?.commercial.facts).toContainEqual({ label: "Change order", value: "CO record not linked" });
    expect(thread?.commercial.facts.some((fact) => fact.label === "Cost exposure")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the derivation tests and confirm failure**

Run: `npx vitest run src/lib/pieceControl/__tests__/pieceIntelligenceDerive.test.ts`

Expected: FAIL because the derivation module is missing.

- [ ] **Step 3: Implement deterministic priority and view models**

```ts
export interface PieceAttentionRow {
  pieceId: string;
  markAndLot: string;
  workPackageLabel: string;
  lifecycle: ExposureLifecycle;
  lifecycleLabel: string;
  fieldNeededDate: string | null;
  fieldRisk: boolean;
  onHold: boolean;
  fabBlocked: boolean;
  reason: string;
}

export interface NextReleaseReadiness {
  workPackageId: string;
  label: string;
  isReady: boolean;
  blockerCount: number;
  pieceCount: number;
}

export interface PieceIntelligenceModel {
  revisions: RevisionExposureRow[];
  attention: PieceAttentionRow[];
  metrics: {
    affectedPieces: number;
    blockedPieces: number;
    fieldRiskPieces: number;
    linkRequiredRevisions: number;
    nextRelease: NextReleaseReadiness | null;
  };
}

export interface PieceThreadSection {
  availability: SourceAvailability;
  facts: Array<{ label: string; value: string }>;
}

export interface PieceDigitalThreadModel {
  pieceId: string;
  identity: PieceThreadSection & { markAndLot: string };
  modelAndDrawing: PieceThreadSection;
  commercial: PieceThreadSection;
  productionAndLogistics: PieceThreadSection;
  history: PieceThreadSection;
}

const LIFECYCLE_PRIORITY: Record<string, number> = {
  erected: 0,
  delivered: 1,
  shipped: 2,
  fabricated: 3,
  in_fabrication: 4,
  released: 5,
  not_started: 6,
};

export function derivePieceIntelligence(
  snapshot: PieceIntelligenceSnapshot,
  now: Date,
): PieceIntelligenceModel {
  const revisions = deriveRevisionExposure(snapshot);
  const attention = buildAttentionRows(revisions, snapshot, now).sort(
    compareAttentionRows,
  );
  return {
    revisions,
    attention,
    metrics: {
      affectedPieces: new Set(revisions.flatMap((row) => row.affectedPieceIds)).size,
      blockedPieces: attention.filter((row) => row.onHold || row.fabBlocked).length,
      fieldRiskPieces: attention.filter((row) => row.fieldRisk).length,
      linkRequiredRevisions: revisions.filter((row) => row.verification === "link_required").length,
      nextRelease: deriveNextReleaseReadiness(snapshot),
    },
  };
}
```

`compareAttentionRows` sorts by lifecycle priority, field date, hold/critical
impact, work-package label, natural piece mark, and lot. `buildPieceDigitalThread`
returns the five spec sections and preserves source availability per section.
`deriveNextReleaseReadiness` sorts assigned work packages by
`scheduled_start_date`, evaluates the first package through
`evaluateWorkPackageReadiness`, and returns `{ workPackageId, label, isReady,
blockerCount, pieceCount }`; it returns `null` when there is no assigned package.
Represent each Digital Thread section as `{ availability, facts }`, where
`facts` is `Array<{ label: string; value: string }>`; this lets the component
render identical accessible anatomy without inventing values.

- [ ] **Step 4: Run domain tests**

Run: `npx vitest run src/lib/pieceControl/__tests__/revisionExposure.test.ts src/lib/pieceControl/__tests__/pieceIntelligenceDerive.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the derivation slice**

```bash
git add src/lib/pieceControl/pieceIntelligenceTypes.ts src/lib/pieceControl/pieceIntelligenceDerive.ts src/lib/pieceControl/__tests__/pieceIntelligenceDerive.test.ts
git commit -m "feat: prioritize piece revision risk"
```

---

### Task 4: Piece Register URL State and Revision Impact Tab Wiring

**Files:**
- Create: `src/pages/pieceRegister/pieceRegisterLocation.ts`
- Create: `src/pages/pieceRegister/__tests__/pieceRegisterLocation.test.ts`
- Modify: `src/pages/pieceRegister/registerHelpers.ts`
- Modify: `src/pages/PieceRegister.tsx`
- Modify: `src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`

**Interfaces:**
- Consumes: React Router `useSearchParams`, `PIECE_REGISTER_VIEW_IDS`.
- Produces: `parsePieceRegisterLocation(params)` and `writePieceRegisterLocation(current, patch)` plus the `impact` view identifier.

- [ ] **Step 1: Write URL parsing tests**

```ts
it("accepts the impact view and supported focus", () => {
  const result = parsePieceRegisterLocation(new URLSearchParams("view=impact&focus=revision&revision=r4"));
  expect(result).toEqual({ view: "impact", focus: "revision", pieceId: null, revisionId: "r4" });
});

it("drops unsupported values without losing the valid view", () => {
  const result = parsePieceRegisterLocation(new URLSearchParams("view=register&focus=unsafe&piece=p1"));
  expect(result).toEqual({ view: "register", focus: null, pieceId: "p1", revisionId: null });
});
```

Add a shell test that starts at `/PieceRegister?view=impact&revision=r4` and
expects the Revision Impact navigation button to have `aria-current="page"`.

- [ ] **Step 2: Run location and shell tests and confirm failure**

Run: `npx vitest run src/pages/pieceRegister/__tests__/pieceRegisterLocation.test.ts src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`

Expected: FAIL because `impact` is not a registered view and URL state is not parsed.

- [ ] **Step 3: Implement typed URL state and bind active view to search params**

```ts
export const PIECE_INTELLIGENCE_FOCUS = ["held", "revision", "release", "field"] as const;
export type PieceIntelligenceFocus = (typeof PIECE_INTELLIGENCE_FOCUS)[number];

export function parsePieceRegisterLocation(params: URLSearchParams): PieceRegisterLocation {
  return {
    view: resolvePieceRegisterView(params.get("view")),
    focus: isFocus(params.get("focus")) ? params.get("focus") as PieceIntelligenceFocus : null,
    pieceId: cleanId(params.get("piece")),
    revisionId: cleanId(params.get("revision")),
  };
}
```

Insert `"impact"` after `"overview"`, label it `"Revision Impact"`, and use
`GitCompareArrows` in `REGISTER_VIEW_ICONS`. Replace the isolated `activeView`
state with a parsed search-param view and a setter that preserves supported
selection/focus values.

Update the test render helper so every shell test has real router state:

```tsx
function renderPieceRegister(initialEntry = "/PieceRegister") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}><PieceRegister /></QueryClientProvider>
    </MemoryRouter>,
  );
}
```

- [ ] **Step 4: Run location and shell tests**

Run: `npx vitest run src/pages/pieceRegister/__tests__/pieceRegisterLocation.test.ts src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit URL/tab wiring**

```bash
git add src/pages/pieceRegister/pieceRegisterLocation.ts src/pages/pieceRegister/__tests__/pieceRegisterLocation.test.ts src/pages/pieceRegister/registerHelpers.ts src/pages/PieceRegister.tsx src/pages/pieceRegister/__tests__/PieceRegister.test.tsx
git commit -m "feat: add revision impact register view"
```

---

### Task 5: Revision Impact and Piece Digital Thread Components

**Files:**
- Create: `src/pages/pieceRegister/PieceRevisionImpactView.tsx`
- Create: `src/pages/pieceRegister/PieceDigitalThread.tsx`
- Create: `src/pages/pieceRegister/__tests__/PieceRevisionImpactView.test.tsx`
- Create: `src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx`
- Modify: `src/pages/pieceRegister/PieceRegisterRegisterView.tsx`
- Modify: `src/pages/PieceRegister.tsx`

**Interfaces:**
- Consumes: `PieceIntelligenceModel`, `PieceDigitalThreadModel`, `RevisionExposureRow`, role booleans, selection callbacks.
- Produces: accessible presentational components; no direct I/O.

- [ ] **Step 1: Write component tests for selection and honest missing data**

```tsx
it("selects a revision and exposes its exact affected pieces", async () => {
  const onSelectRevision = vi.fn();
  render(<PieceRevisionImpactView model={modelWithR4} selectedRevisionId={null} onSelectRevision={onSelectRevision} onSelectPiece={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: /revision 4/i }));
  expect(onSelectRevision).toHaveBeenCalledWith("r4");
});

it("renders link required instead of zero affected pieces", () => {
  render(<PieceRevisionImpactView model={linkRequiredModel} selectedRevisionId="r4" onSelectRevision={vi.fn()} onSelectPiece={vi.fn()} />);
  expect(screen.getByText("Piece links required")).toBeInTheDocument();
  expect(screen.queryByText("0 affected pieces")).not.toBeInTheDocument();
});
```

```tsx
it("renders the five digital-thread sections and unlinked CO truth", () => {
  render(<PieceDigitalThread thread={thread} onClose={vi.fn()} />);
  for (const name of ["Identity", "Model & drawing", "Commercial & constraints", "Production & logistics", "History"]) {
    expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  }
  expect(screen.getByText("CO record not linked")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run component tests and confirm failure**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceRevisionImpactView.test.tsx src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx`

Expected: FAIL because both components are missing.

- [ ] **Step 3: Implement presentational components**

`PieceRevisionImpactView` renders a two-column desktop region: revision decision
list and selected exact-piece table. Use buttons with `aria-pressed`, text labels
for verification, and the existing `cmd-table` primitives. `PieceDigitalThread`
renders a `<aside aria-label="Piece digital thread">` with five ordered sections,
source-unavailable messages, and owning-module link callbacks supplied by the
page.

```tsx
export function PieceDigitalThread({ thread, onClose, onOpenRelationships, onOpenRelease }: PieceDigitalThreadProps) {
  if (!thread) return null;
  return (
    <aside className="piece-digital-thread" aria-label="Piece digital thread">
      <header className="piece-digital-thread__header">
        <h2>{thread.identity.markAndLot}</h2>
        <button type="button" className="cmd-btn cmd-btn--ghost" onClick={onClose}>Close</button>
      </header>
      <ThreadSection title="Identity" section={thread.identity} />
      <ThreadSection title="Model & drawing" section={thread.modelAndDrawing} />
      <ThreadSection title="Commercial & constraints" section={thread.commercial} />
      <ThreadSection title="Production & logistics" section={thread.productionAndLogistics} />
      <ThreadSection title="History" section={thread.history} />
    </aside>
  );
}
```

Use one helper for every section:

```tsx
function ThreadSection({ title, section }: { title: string; section: PieceThreadSection }) {
  return (
    <section className="piece-digital-thread__section">
      <h3>{title}</h3>
      {section.availability === "unavailable" ? (
        <p className="piece-operation-state is-error">This source is unavailable.</p>
      ) : (
        <dl>{section.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
      )}
    </section>
  );
}
```

In the Register view, replace the current single-piece `DecisionPanel` impact
block with `PieceDigitalThread`. In the Impact view, selecting a piece writes the
same `piece` URL parameter and opens the inspector.

- [ ] **Step 4: Run component and Piece Register tests**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceRevisionImpactView.test.tsx src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the view slice**

```bash
git add src/pages/pieceRegister/PieceRevisionImpactView.tsx src/pages/pieceRegister/PieceDigitalThread.tsx src/pages/pieceRegister/__tests__/PieceRevisionImpactView.test.tsx src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx src/pages/pieceRegister/PieceRegisterRegisterView.tsx src/pages/PieceRegister.tsx
git commit -m "feat: add piece revision review and digital thread"
```

---

### Task 6: Changes & Risks Overview

**Files:**
- Modify: `src/pages/pieceRegister/PieceRegisterOverview.tsx`
- Modify: `src/pages/PieceRegister.tsx`
- Modify: `src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`
- Modify: `src/pages/pieceRegister/__tests__/overviewDerive.test.ts`

**Interfaces:**
- Consumes: `PieceIntelligenceModel`, existing `OverviewWorkPackage[]`, existing upcoming shipments, navigation callbacks.
- Produces: populated Changes & Risks command center while preserving current empty state.

- [ ] **Step 1: Add failing populated-overview tests**

```tsx
it("leads a populated Overview with Changes & Risks", async () => {
  seedPopulatedPieceIntelligence();
  renderPieceRegister();
  expect(await screen.findByRole("heading", { name: "Changes & Risks" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review revision impact" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Revision impact requiring action" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Pieces needing attention" })).toBeInTheDocument();
});

it("preserves the controlled empty-register onboarding", async () => {
  vi.mocked(fetchPieceRegister).mockResolvedValue([]);
  renderPieceRegister();
  expect(await screen.findByText("Import the first pieces")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Changes & Risks" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the populated-overview tests and confirm failure**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`

Expected: FAIL because populated Overview still starts with `Piece Register workspace`.

- [ ] **Step 3: Implement the approved populated hierarchy**

Extend `PieceRegisterOverview` props with `intelligence`, `intelligenceState`,
`onReviewRevision`, `onSelectRevision`, `onSelectPiece`, and
`onOpenRelationships`. For populated data render:

```tsx
<section className="piece-register-overview piece-intelligence-overview">
  <header className="piece-intelligence-overview__head">
    <div><h2>Changes &amp; Risks</h2><p>{overviewSentence}</p></div>
    <button type="button" className="cmd-btn cmd-btn--primary" onClick={onReviewRevision}>Review revision impact</button>
  </header>
  <PieceIntelligenceMetrics metrics={intelligence.metrics} />
  <div className="piece-intelligence-overview__decisions">
    <DecisionPanel title="Revision impact requiring action">
      {intelligence.revisions.slice(0, 3).map((revision) => (
        <button key={revision.revisionId} type="button" className="cmd-row" onClick={() => onSelectRevision(revision.revisionId)}>
          <span><strong>{revision.sheetNumber} · Rev {revision.revisionCode}</strong><span className="cmd-row__meta">{revisionImpactLabel(revision)}</span></span>
          <span className="cmd-row__num">{revision.verification === "link_required" ? "Links required" : `${revision.affectedPieceIds.length} pieces`}</span>
        </button>
      ))}
    </DecisionPanel>
    <DecisionPanel title="Pieces needing attention">
      {intelligence.attention.slice(0, 4).map((piece) => (
        <button key={piece.pieceId} type="button" className="cmd-row" onClick={() => onSelectPiece(piece.pieceId)}>
          <span><strong>{piece.markAndLot}</strong><span className="cmd-row__meta">{piece.reason}</span></span>
          <span className="cmd-row__num">{piece.lifecycleLabel}</span>
        </button>
      ))}
    </DecisionPanel>
  </div>
</section>
```

Retain the current `piece-register-summary` readiness and upcoming-shipment JSX
byte-for-byte immediately after the new decisions grid inside the same section.

Loading blocks impact claims but does not hide already-loaded core register data.
An intelligence error renders one visible retry and no affected-piece totals.

Define the two local presentation helpers in `PieceRegisterOverview.tsx`:

```tsx
function revisionImpactLabel(revision: RevisionExposureRow): string {
  if (revision.verification === "link_required") return "Piece links required";
  const downstream = revision.exposure.in_fabrication + revision.exposure.fabricated +
    revision.exposure.shipped + revision.exposure.delivered + revision.exposure.erected;
  return `${downstream} downstream · ${revision.heldCount} held`;
}

function PieceIntelligenceMetrics({ metrics }: { metrics: PieceIntelligenceModel["metrics"] }) {
  const cells = [
    ["Revision affected", String(metrics.affectedPieces)],
    ["Blocked or held", String(metrics.blockedPieces)],
    ["Next release", metrics.nextRelease ? (metrics.nextRelease.isReady ? "Ready" : `${metrics.nextRelease.blockerCount} blockers`) : "No package"],
    ["Field risk", String(metrics.fieldRiskPieces)],
  ];
  return <div className="piece-intelligence-overview__metrics">{cells.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}
```

- [ ] **Step 4: Run overview tests**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/pages/pieceRegister/__tests__/overviewDerive.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the Overview slice**

```bash
git add src/pages/pieceRegister/PieceRegisterOverview.tsx src/pages/PieceRegister.tsx src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/pages/pieceRegister/__tests__/overviewDerive.test.ts
git commit -m "feat: lead piece register with changes and risks"
```

---

### Task 7: Protected Impact Actions and Query Invalidation

**Files:**
- Modify: `src/pages/PieceRegister.tsx`
- Modify: `src/pages/pieceRegister/PieceRevisionImpactView.tsx`
- Modify: `src/pages/pieceRegister/PieceDigitalThread.tsx`
- Modify: `src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`
- Test: existing `src/components/pieceControl/__tests__/CanonicalFabReleasePanel.test.tsx`

**Interfaces:**
- Consumes: `entities.DrawingImpact.create/update`, `withProjectId` from `@/lib/mutations/standardMutation`, `setPieceHold`, `pieceControlKeys`, existing role helpers.
- Produces: role-gated create/update/resolve impact and hold/clear callbacks; owning-module navigation for relationships/release.

- [ ] **Step 1: Add failing mutation and permission tests**

```tsx
it("places a selected affected piece on hold through set_piece_hold", async () => {
  seedRevisionWithPiece();
  renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");
  await userEvent.click(await screen.findByRole("button", { name: "Place hold" }));
  await userEvent.type(screen.getByLabelText("Hold reason"), "Revision 4 connection change");
  await userEvent.click(screen.getByRole("button", { name: "Confirm hold" }));
  expect(setPieceHold).toHaveBeenCalledWith("prj", "p1", true, "Revision 4 connection change");
});

it("does not expose mutation actions to a viewer", async () => {
  projectRole.current = "viewer";
  renderPieceRegister("/PieceRegister?view=impact&revision=r4&piece=p1");
  expect(await screen.findByLabelText("Piece digital thread")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Place hold" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the mutation tests and confirm failure**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx`

Expected: FAIL because the Digital Thread has no protected actions.

- [ ] **Step 3: Implement protected mutations and shared invalidation**

```ts
const holdMutation = useMutation({
  mutationFn: ({ pieceId, onHold, reason }: HoldRequest) =>
    setPieceHold(projectId!, [pieceId], onHold, reason),
  onSuccess: async (_, request) => {
    await invalidatePieceIntelligence();
    toast.success(request.onHold ? "Piece hold applied" : "Piece hold cleared");
  },
  onError: (error: Error) => toast.error(
    presentPieceControlError(error, "The piece hold could not be updated."),
  ),
});
```

Create/update drawing-impact actions with
`withProjectId(payload, projectId)` from `@/lib/mutations/standardMutation`, current revision ID,
the allowed impact/status/priority values, and no invented CO ID. On each success
invalidate intelligence, drawing impacts, relationships, register, canonical
reporting, release gate, and 3D lifecycle keys. Require a nonblank hold reason.
Render hold/clear only when `roleAtLeast(role, "field")`; render drawing-impact
create/update/resolve only when `roleAtLeast(role, "pm")`; retain DB/RPC enforcement.
Open release by selecting the work package in the existing Board/relationships
surface where `CanonicalFabReleasePanel` already owns the gate.

The impact editor uses native labeled controls for `impact_type`, `priority`,
`assigned_to`, `due_date`, `title`, and `notes`; Save calls
`entities.DrawingImpact.create`, Resolve calls `entities.DrawingImpact.update`
with `{ status: "resolved", resolved_at: new Date().toISOString() }`, and Cancel
clears component state without a write.

- [ ] **Step 4: Run mutation and release regression tests**

Run: `npx vitest run src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/components/pieceControl/__tests__/CanonicalFabReleasePanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the action slice**

```bash
git add src/pages/PieceRegister.tsx src/pages/pieceRegister/PieceRevisionImpactView.tsx src/pages/pieceRegister/PieceDigitalThread.tsx src/pages/pieceRegister/__tests__/PieceRegister.test.tsx
git commit -m "feat: act on piece revision exceptions"
```

---

### Task 8: Dashboard Deep Links, Styling, and Full Verification

**Files:**
- Modify: `src/components/pieceControl/PieceControlDashboardPanel.tsx`
- Modify: `src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx`
- Modify: `src/pages/dashboardCC/DashboardControlCenter.tsx`
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/__tests__/pieceRegisterWiring.test.ts`
- Modify: `src/styles/piece-control-command.css`
- Modify: `AGENT_CLAIMS.md` only when releasing the completed claim.

**Interfaces:**
- Consumes: `derivePieceIntelligence`, `fetchPieceIntelligenceSnapshot`, `PieceIntelligenceFocus`.
- Produces: dashboard focus callbacks, responsive/token-only CSS, and verified feature completion.

- [ ] **Step 1: Write failing dashboard focus tests**

```tsx
it("opens revision exposure with a focused Piece Register deep link", async () => {
  const onOpen = vi.fn();
  seedDashboardIntelligenceWithRevisionRisk();
  render(<PieceControlDashboardPanel project={project} onOpen={onOpen} />);
  await userEvent.click(await screen.findByRole("button", { name: /revision exposure/i }));
  expect(onOpen).toHaveBeenCalledWith({ view: "impact", focus: "revision" });
});
```

Add a wiring assertion that `Dashboard.jsx` serializes `view` and `focus` and
that `DashboardControlCenter` passes the focus object through `onNavigate`.

- [ ] **Step 2: Run dashboard tests and confirm failure**

Run: `npx vitest run src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx src/__tests__/pieceRegisterWiring.test.ts`

Expected: FAIL because `onOpen` currently accepts no destination object.

- [ ] **Step 3: Share summary derivation and add focus navigation**

Change the dashboard panel callback to:

```ts
onOpen: (location?: { view?: "overview" | "impact"; focus?: PieceIntelligenceFocus }) => void;
```

Use the source-aware intelligence query when Piece Control is enabled. Keep the
existing total/tons/shadow parity information, replace the generic exception
click with explicit `Revision exposure`, `Held pieces`, and `Field risk` rows,
and fall back to current canonical reporting when enrichment is unavailable.

In `Dashboard.jsx`, serialize only supported options:

```js
if (opts.view) params.push(`view=${encodeURIComponent(opts.view)}`);
if (opts.focus) params.push(`focus=${encodeURIComponent(opts.focus)}`);
```

- [ ] **Step 4: Implement the approved token-only responsive CSS**

Add classes under `[data-skin="command"]` for:

```css
.piece-intelligence-overview__metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:var(--space-lg); }
.piece-intelligence-overview__decisions { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(18rem,.75fr); gap:var(--space-xl); }
.piece-revision-impact { display:grid; grid-template-columns:minmax(18rem,.72fr) minmax(0,1.28fr); gap:var(--space-xl); }
.piece-digital-thread { border:1px solid var(--cmd-border); background:var(--cmd-surface); color:var(--cmd-text); }
```

Use existing spacing/radius/type tokens available in the file; do not add raw
surface/text/border colors. At the existing tablet breakpoint stack decision
and impact columns. At the mobile breakpoint use two metric columns and a
single-column full-width inspector. Preserve table horizontal scrolling and
visible focus styles.

- [ ] **Step 5: Run targeted tests and static gates**

Run:

```bash
npx vitest run src/lib/pieceControl/__tests__/revisionExposure.test.ts src/lib/pieceControl/__tests__/pieceIntelligenceDerive.test.ts src/lib/pieceControl/__tests__/pieceIntelligenceRepository.test.ts src/pages/pieceRegister/__tests__/pieceRegisterLocation.test.ts src/pages/pieceRegister/__tests__/PieceRevisionImpactView.test.tsx src/pages/pieceRegister/__tests__/PieceDigitalThread.test.tsx src/pages/pieceRegister/__tests__/PieceRegister.test.tsx src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx src/components/pieceControl/__tests__/CanonicalFabReleasePanel.test.tsx src/__tests__/pieceRegisterWiring.test.ts
npm run lint
npm run typecheck
npm run typecheck:strict
npm run typecheck:noimplicitany
npm run check:no-new-js
```

Expected: every command exits 0.

- [ ] **Step 6: Run full tests and production build**

Run:

```bash
npm test
npm run build
```

Expected: all Vitest files pass and Vite produces `dist/` without errors.

- [ ] **Step 7: Run browser acceptance and visual comparison**

Start `npm run dev -- --host 127.0.0.1`, then verify with the Browser/IAB tool:

1. Populated Overview leads with `Changes & Risks` and one `Review revision impact` primary action.
2. Revision selection shows only exact affected pieces and labels missing links `Piece links required`.
3. Single-piece selection opens all five Digital Thread sections.
4. Applying and clearing a permitted hold changes UI state after query invalidation.
5. Existing fabrication-release checks remain authoritative and fail closed.
6. Existing Imports, Lots & links, Production, Logistics, Board, and Settings views still open.
7. Desktop, tablet, and mobile layouts have no clipped controls or accidental wrapping.
8. Light and dark themes use command tokens with readable labels and visible focus.

Capture the implementation at the approved mockup's desktop dimensions and a
mobile viewport. Compare copy, hierarchy, metrics, two-panel balance, table
density, palette, typography, spacing, and responsive stacking. Fix every
agency-review mismatch before completion.

- [ ] **Step 8: Commit the verified integration**

```bash
git add src/components/pieceControl/PieceControlDashboardPanel.tsx src/components/pieceControl/__tests__/PieceControlDashboardPanel.test.tsx src/pages/dashboardCC/DashboardControlCenter.tsx src/pages/Dashboard.jsx src/__tests__/pieceRegisterWiring.test.ts src/styles/piece-control-command.css
git commit -m "feat: integrate piece intelligence command center"
```

- [ ] **Step 9: Release the coordination claim and push**

Remove only the `codex-piece-intelligence-command` row from `AGENT_CLAIMS.md`, then:

```bash
git add AGENT_CLAIMS.md
git commit -m "chore: release piece intelligence claim"
git push origin codex/piece-intelligence-command
```

Expected: the remote feature branch contains the plan, implementation commits,
green verification evidence, and no active claim owned by this session.
