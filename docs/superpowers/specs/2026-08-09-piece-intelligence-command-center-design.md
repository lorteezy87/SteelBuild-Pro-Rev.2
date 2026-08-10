# Piece Intelligence Command Center — SteelBuild Pro Integration Design

**Status:** Approved in conversation on 2026-08-09  
**Target:** Existing SteelBuild Pro Vite/React/Supabase application  
**Primary surface:** `PieceRegister`  
**Feature mode:** Existing project `piece_control_mode` (`off`, `shadow`, `pilot`, `live`)

## 1. Objective

Extend SteelBuild Pro's canonical Piece Register so a project manager can answer
the following question before shop or field work is exposed:

> Which planned, fabricated, shipped, delivered, or erected pieces are affected
> by the current drawing revision, and what decision is required next?

The feature shifts the Piece Register from a status inventory to an
exception-driven command surface. The piece mark remains the operational source
of truth connecting detailing, approvals, fabrication, logistics, and erection.

This is an integration into SteelBuild Pro. It is not a separate application,
route family, database, or competing workflow engine.

## 2. Scope

### In scope

1. Replace the populated Piece Register **Overview** with a **Changes & Risks**
   command center while preserving the existing empty-register onboarding path.
2. Add a **Revision Impact** tab inside the Piece Register.
3. Expand single-piece inspection into a **Piece Digital Thread** that exposes
   the governing drawing/revision, approval evidence, linked RFIs and change
   exposure when explicit relationships exist, fabrication state, shipment,
   delivery, erection, holds, and recorded activity.
4. Reuse the existing canonical fabrication-release gate and place readiness
   summaries/deep links in the new command center.
5. Upgrade the existing dashboard `PieceControlDashboardPanel` so its exception
   summary opens the relevant Piece Register view and focus.
6. Add deterministic derivation tests, component tests, route/deep-link tests,
   and browser verification for the primary workflow.

### Out of scope

- A new standalone app, backend, Supabase project, or local-only data store.
- BIM geometry interpretation, AI-generated drawings, scan-to-BIM, robotics
  control, or automatic machine programming.
- New lifecycle states that compete with canonical piece lifecycle or submittal
  approval authority.
- Guessing piece impacts from profile, mark prefixes, or sequence proximity.
- Database migrations. This slice uses existing tables, relationships, entity
  clients, and RPCs only.
- Replacing Production, Logistics, Imports, Lots & Links, Package Board, or the
  Detailing Control Center.

## 3. Existing authority to preserve

- `pieces` and canonical lots own piece identity and lifecycle.
- `piece_drawing_sets` is the preferred piece-to-drawing-package relationship;
  `piece_drawings` is a legacy per-sheet fallback.
- `drawing_revisions` and the existing detailing revision-impact engine own
  drawing revision evidence.
- `submittals`, rounds, sheet responses, reviews, and signoffs own approval
  evidence. A bare `Approved` or `Approved as Noted` value is not fabricated-
  ready unless the existing release predicate says IFC/Released.
- `set_piece_hold` owns piece holds.
- The canonical fabrication-release RPC and `CanonicalFabReleasePanel` own
  release checks and release/exception writes.
- Existing production and logistics repositories own station, shipment,
  delivery, and erection writes.
- Project RBAC and organization-scoped RLS remain authoritative.

No command-center component writes directly to `pieces`.

## 4. Information architecture

The existing Piece Register page remains the module shell. Its tabs become:

1. **Overview** — Changes & Risks command center.
2. **Revision Impact** — revision-to-piece exposure review.
3. **Register** — current dense piece register and bulk controls.
4. **Board** — current package board.
5. **Imports** — current staged import workflow.
6. **Lots & links** — current relationship manager.
7. **Production** — current shop station workflow.
8. **Logistics** — current shipping/delivery/erection workflow.
9. **Settings** — current mode/readiness controls.

The new views remain under the existing Piece Register route. URL search
parameters preserve navigation intent:

- `?view=overview`
- `?view=impact`
- `?view=register&piece=<piece-id>`
- `?view=impact&revision=<revision-id>`
- `?view=overview&focus=held|revision|release|field`

Invalid or inaccessible identifiers fail to the requested view's unselected
state; they never expose cross-project data.

## 5. Opening command center

When the register contains active pieces, Overview answers three questions in
priority order:

1. **What changed?** Current change revisions with exact linked-piece exposure.
2. **What is at risk?** Held, blocked, in-process, shipped, delivered, or erected
   pieces requiring human review.
3. **What must happen next?** Open/assign impact, place or clear a hold, repair a
   relationship, inspect the digital thread, or open the release gate.

The first viewport contains:

- Page heading and one primary action: **Review revision impact**.
- Four concise metrics:
  - pieces affected by current revisions;
  - pieces blocked or held;
  - next work-package release readiness;
  - field-needed pieces with unresolved exposure.
- **Revision impact requiring action**, ordered by downstream exposure and
  field need.
- **Pieces needing attention**, ordered by a deterministic priority score.
- Existing work-package readiness and upcoming shipment summaries below the
  first decision area, not removed.

If no active pieces exist, the current controlled import/reconcile onboarding
remains unchanged.

## 6. Revision Impact view

Each row represents a current change revision and shows:

- drawing set, sheet, and revision code;
- issued/received date when known;
- exact affected piece count;
- affected work packages and sequences;
- downstream exposure counts by lifecycle;
- hold count;
- linked open RFI count and fabrication-hold signal;
- open drawing-impact record count and responsible person when assigned;
- commercial signal from a `drawing_impacts` record whose type is
  `change_order`; an actual CO number or dollar value appears only when the
  source row already contains an explicit CO identifier;
- a verification state: `verified`, `partial`, or `link_required`.

Selecting a revision reveals its affected pieces in a dense table. Selecting a
piece opens the Piece Digital Thread. Available actions depend on role and
existing authority:

- open or update a `drawing_impacts` action;
- assign an owner and due date;
- resolve the impact action;
- place or clear a canonical piece hold;
- open Lots & Links to repair missing relationships;
- open the existing fabrication-release surface for the affected work package.

The command center does not automatically release, hold, or change a piece
lifecycle because a drawing revision appears.

## 7. Exact impact matching and fail-closed rules

Revision-to-piece matching is deterministic:

1. Resolve revision → drawing → drawing set.
2. Match pieces through active `piece_drawing_sets` rows for that set.
3. Include active legacy `piece_drawings` matches for the specific drawing.
4. Remove containers, split parents, deleted rows, and duplicate lots using the
   existing actionable-leaf selector.

Sequence-based or mark-pattern matching is displayed only as a relationship
repair hint. It never contributes to the verified affected-piece count and
never authorizes fabrication release.

Verification states:

- **Verified:** every reported affected piece has an explicit drawing-set or
  drawing relationship.
- **Partial:** exact linked pieces exist, but one or more relevant project
  records cannot be evaluated.
- **Link required:** the revision is valid but has no exact piece relationship.

Missing data is shown as **Unverified** or **Not linked**, never zero, safe, or
release-ready.

## 8. Piece Digital Thread

The digital thread is a focused inspector, not a second editable register. It
has five ordered sections:

1. **Identity** — piece mark, lot, quantity, profile, grade, work package,
   sequence, and source system.
2. **Model & drawing** — linked drawing sets/sheets, current revision, approval
   evidence, unresolved comment dispositions, and link quality.
3. **Commercial & constraints** — linked RFIs, fabrication holds, and
   `change_order` drawing-impact signals. The current baseline schema does not
   give `drawing_impacts` a change-order foreign key, so the inspector labels
   the CO record **Not linked** instead of inventing a CO number or cost.
4. **Production & logistics** — release, current shop station, fabrication
   completion, load/shipment, delivery, erection, and field need date when
   present.
5. **History** — canonical piece events plus available drawing-impact activity,
   newest first.

The inspector reuses existing display components where they represent the same
authority. It links to the owning module for complex edits.

## 9. Component and module boundaries

### Page composition

- `PieceRegister.tsx` remains orchestration glue: route state, queries,
  mutations, invalidation, and active-view composition.
- `PieceRegisterOverview.tsx` becomes the populated command-center layout while
  retaining the current empty state.
- New `PieceRevisionImpactView.tsx` owns revision selection and affected-piece
  presentation.
- New `PieceDigitalThread.tsx` owns the single-piece inspector.

### Pure domain layer

New focused TypeScript modules under `src/lib/pieceControl/` derive:

- revision exposure;
- command-center metrics;
- attention priority;
- digital-thread view models;
- URL focus parsing where it is not page-specific.

Derivers accept typed source arrays and return immutable presentation models.
They perform no I/O and no React work.

### Repository layer

The relationship snapshot repository is extended or composed by a focused
piece-intelligence repository. Core piece and explicit relationship queries
fail closed. Optional enrichment queries retain per-source availability so the
UI can distinguish `none` from `unavailable`.

The dashboard panel consumes the same pure summary derivation as the Piece
Register. It does not implement a second scoring algorithm.

## 10. Data flow

```text
Supabase project-scoped rows
  ├─ pieces / piece_drawing_sets / piece_drawings
  ├─ drawings / drawing_sets / drawing_revisions
  ├─ submittals / sheet responses / reviews / signoffs
  ├─ drawing_impacts / RFIs / explicit change relationships
  └─ releases / stations / shipments / deliveries / erection events
                     ↓
        piece-intelligence repository snapshot
                     ↓
       pure exact-link derivation and priority rules
                     ↓
     Overview / Revision Impact / Digital Thread / Dashboard
                     ↓
 existing protected mutations → query invalidation → re-derive
```

TanStack Query keys remain project-scoped. Mutations invalidate the canonical
piece register, reporting, relationship, release-gate, 3D lifecycle-color, and
piece-intelligence keys affected by the write.

## 11. Priority rules

Priority is deterministic and lexicographic, not an opaque AI score:

1. revision-exposed piece already erected;
2. delivered;
3. shipped/loaded;
4. fabricated or in fabrication;
5. field-needed date overdue or within ten days;
6. open fabrication hold or unresolved critical/high impact;
7. unreleased/planned exposure;
8. relationship verification required.

Within the same tier, earlier field-needed date sorts first, then work package,
piece mark, and lot using natural sorting. The UI explains the leading reason.
For this slice, the field-needed date is the piece's assigned work package
`scheduled_start_date`. When it is absent, the date is unknown and no urgency is
inferred from it.

## 12. Mutation and audit behavior

- Hold/clear uses `set_piece_hold`; reason is required when applying a hold.
- Fabrication release uses the existing gate and release RPC. Hard scope blocks
  remain non-overridable; exception release behavior is unchanged.
- Drawing-impact create/update uses the existing `DrawingImpact` entity client,
  project scoping helper, and current permission conventions.
- Complex drawing, RFI, change-order, production, and logistics edits deep-link
  to their owning modules.
- Every success toast describes the committed result. Errors never emit success
  language.
- No optimistic lifecycle transitions are introduced.

## 13. Loading, empty, partial, and error states

- Core piece or relationship failure blocks impact claims and presents a retry.
- Optional enrichment failure leaves exact piece exposure visible but marks the
  affected section **Unavailable** and the overall verification **Partial**.
- Empty revision impact states distinguish:
  - no current change revisions;
  - revisions exist but require piece links;
  - filters hide all results.
- Stale deep-link selection is cleared with a neutral explanation.
- Unauthorized mutations remain disabled in the UI and protected by DB RLS/RPC
  checks.

## 14. Visual and interaction system

- Reuse the shipped command UI and `piece-control-command.css` container model.
- Use `--cmd-*` variables under `[data-skin="command"]`; dark mode comes from the
  existing token remap.
- Preserve desktop density and the existing table-first register.
- At tablet widths, command panels stack while tables retain controlled
  horizontal scrolling.
- On narrow mobile widths, metrics become two columns, decision panels stack,
  and the digital thread becomes a full-width ordered inspector.
- All actions are native buttons/inputs with visible focus, accessible names,
  keyboard selection, and non-color status labels.
- Reduced-motion preferences are respected; no decorative motion is required.

## 15. Test strategy

### Pure unit tests

- exact drawing-set and legacy drawing matching;
- actionable-leaf and duplicate removal;
- no sequence/mark inference in verified counts;
- verification states for missing optional and core sources;
- downstream lifecycle exposure grouping;
- priority ordering and natural-sort tie breakers;
- metric derivation and empty states;
- URL view/focus parsing.

### Component tests

- existing empty-register onboarding is preserved;
- populated Overview renders changes, risks, readiness, and attention;
- Revision Impact selection exposes affected pieces;
- Piece Digital Thread labels missing relationships honestly;
- role-gated actions and mutation error states;
- dashboard exceptions deep-link to the requested Piece Register focus;
- light/dark token use and responsive class behavior.

### Existing gates

- targeted Vitest suites;
- `npm run lint`;
- `npm run typecheck`;
- `npm run typecheck:strict`;
- `npm run typecheck:noimplicitany`;
- `npm run check:no-new-js`;
- `npm test`;
- `npm run build`;
- existing fabrication-release Playwright path remains green when the local E2E
  environment is available.

### Browser acceptance workflow

1. Open a project with Piece Control enabled.
2. Confirm Overview leads with Changes & Risks.
3. Open a revision with exact linked pieces.
4. Inspect a piece already in a downstream lifecycle state.
5. Open its Digital Thread and confirm drawing, approval, constraint, production,
   logistics, and history sections.
6. Place a permitted hold, observe invalidation, then clear it.
7. Open the owning work package's existing release gate and confirm blockers are
   unchanged and fail closed.
8. Verify desktop, tablet, mobile, light, and dark presentation.

## 16. Acceptance criteria

The feature is complete when:

- it exists only inside SteelBuild Pro's current Piece Register and dashboard;
- a PM can move from a revision to an exact affected-piece list and then to one
  piece's digital thread;
- downstream exposure is visible before a human hold or release decision;
- missing relationships cannot appear as zero impact or fabrication-ready;
- existing protected mutations and lifecycle authority are reused;
- current Piece Register sub-workflows remain available;
- automated gates pass, and browser verification confirms the approved command-
  center hierarchy in both themes and responsive layouts.
