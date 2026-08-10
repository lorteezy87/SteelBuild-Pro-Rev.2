# Piece Intelligence Command Center — SteelBuild Pro Integration Design

**Status:** Approved by the supplied implementation brief on 2026-08-09  
**Target:** Existing SteelBuild Pro Vite/React/Supabase application  
**Primary surface:** `PieceRegister`  
**Feature mode:** Existing project `piece_control_mode` (`off`, `shadow`, `pilot`, `live`)

## Objective

Turn the canonical Piece Register into an exception-driven command surface that answers: which planned, fabricated, shipped, delivered, or erected pieces are affected by a current drawing revision, and what decision is required next? The piece mark and canonical lots remain the source of truth across detailing, approvals, fabrication, logistics, and erection.

This is an integration into SteelBuild Pro, not a separate application, route family, database, or workflow engine.

## Scope and authority

The slice adds a populated Changes & Risks Overview, a Revision Impact tab, a Piece Digital Thread inspector, release-readiness links, and focused dashboard deep links. It preserves the existing empty-register onboarding, Register, Board, Imports, Lots & links, Production, Logistics, Settings, and canonical fabrication-release behavior.

No migration or new lifecycle state is permitted. Existing authorities remain unchanged:

- `pieces` and canonical lots own identity and lifecycle.
- `piece_drawing_sets` is the preferred explicit relationship; active `piece_drawings` is the per-sheet fallback.
- `drawing_revisions` and the existing detailing revision-impact rules own revision evidence.
- submittal rounds, sheet responses, reviews, signoffs, and the canonical release predicate own approval authority; bare Approved or Approved as Noted is not fabrication-ready.
- `set_piece_hold` owns hold writes.
- the canonical release RPC and `CanonicalFabReleasePanel` own fabrication release decisions and exception writes.
- production and logistics repositories own station, shipment, delivery, and erection writes.
- project RBAC and organization-scoped RLS remain authoritative.

Command-center code never writes directly to `pieces` and never invents change-order numbers, costs, piece impacts, or readiness.

## Information architecture and URL state

The Piece Register tab order becomes Overview, Revision Impact, Register, Board, Imports, Lots & links, Production, Logistics, and Settings. Search parameters preserve navigation intent:

- `?view=overview`
- `?view=impact`
- `?view=register&piece=<piece-id>`
- `?view=impact&revision=<revision-id>`
- `?view=overview&focus=held|revision|release|field`

Unknown views fall back to Overview. Invalid, stale, inaccessible, or cross-project identifiers are cleared to the requested view's unselected state with neutral copy. Search-parameter parsing is pure and tested.

## Changes & Risks Overview

For a populated register, the first viewport presents one primary action, **Review revision impact**, and four metrics:

1. pieces affected by current change revisions;
2. pieces blocked or held;
3. next work-package release readiness;
4. field-needed pieces with unresolved exposure.

Below the metrics, **Revision impact requiring action** is ordered by downstream exposure and field need, followed by **Pieces needing attention** using the deterministic priority rules. Existing work-package readiness and upcoming-shipment summaries remain below that decision area. A zero-piece register renders the current import/reconcile onboarding unchanged.

## Exact revision impact

Each Revision Impact row represents a current change revision and exposes sheet/set identity, revision code and date, exact linked-piece count, work packages and sequences, lifecycle exposure counts, holds, linked open RFIs, open drawing-impact actions, assignee, explicit commercial signal, and verification state.

Matching is deterministic:

1. resolve revision to drawing and drawing set;
2. include actionable leaf pieces linked by active `piece_drawing_sets` rows to that set;
3. include actionable leaf pieces linked by active legacy `piece_drawings` rows to that drawing;
4. remove containers, split parents, deleted rows, and duplicate lots with the canonical actionable-leaf selector.

Sequence and mark-pattern similarity may only be shown as relationship-repair guidance. It never contributes to affected counts or release authority.

Verification is `verified` when every reported piece has an explicit set/sheet relationship, `partial` when exact matches exist but an optional source is unavailable, and `link_required` when the revision is valid but has no exact piece relationship. Missing sources render Unverified, Unavailable, or Not linked—not zero, safe, or ready.

## Piece Digital Thread

Selecting a piece opens a focused, read-oriented inspector with five ordered sections:

1. **Identity:** mark, lot, quantity, profile, grade, work package, sequence, source.
2. **Model & drawing:** linked sets/sheets, current revision, approval evidence, unresolved dispositions, link quality.
3. **Commercial & constraints:** explicitly linked RFIs, fabrication holds, and `change_order` drawing-impact signals. Because the baseline has no drawing-impact-to-change-order foreign key, the CO record is labeled **Not linked** unless an explicit identifier already exists in source data.
4. **Production & logistics:** release, station, fabrication completion, shipment/load, delivery, erection, and work-package `scheduled_start_date` as field-needed date.
5. **History:** canonical `piece_events` plus available drawing-impact activity, newest first.

The inspector reuses existing authority-owning presentation where appropriate and deep-links to owning modules for complex edits.

## Pure domain layer

Focused TypeScript modules under `src/lib/pieceControl/` define typed snapshot rows and derive immutable presentation models for revision exposure, overview metrics, lexicographic attention ordering, digital threads, and URL state. They contain no React or I/O. Both the Piece Register and dashboard consume the same summary derivation.

Priority is lexicographic:

1. exposed and erected;
2. delivered;
3. shipped/loaded;
4. fabricated or in fabrication;
5. work-package `scheduled_start_date` overdue or within ten days;
6. hold or unresolved critical/high impact;
7. unreleased/planned exposure;
8. relationship verification required.

Within a tier, sort by field-needed date, work package, piece mark, and lot using natural sorting. Unknown dates add no urgency. Each row explains its leading reason.

## Repository and availability model

A focused project-scoped repository composes existing piece/drawing/release/production/logistics sources. Core pieces, explicit relationships, drawings, and revisions fail closed. Optional submittal, impact, RFI, event, station, shipment, delivery, and erection enrichment is fetched independently and carries `available` or `unavailable` state so the UI distinguishes no rows from a failed source.

TanStack Query keys remain project-scoped. Successful protected writes invalidate piece register, relationships, piece intelligence, drawing impacts, release gate, reporting, production/logistics, and 3D lifecycle-color keys affected by the mutation.

## Mutations and permissions

- Hold and clear call `set_piece_hold`; applying a hold requires a reason.
- Release opens the existing canonical release surface; hard blockers and exception behavior are unchanged.
- Drawing-impact create/update uses `entities.DrawingImpact`, `withProjectId`, existing permission conventions, and drawing-impact query invalidation.
- Complex drawing, RFI, commercial, production, and logistics work deep-links to the owning module.
- Success toasts describe only committed results. Mutation errors never emit success language. No optimistic lifecycle transition is added.

## Loading and failure behavior

Core piece or relationship failure blocks impact claims and provides Retry. Optional-source failure preserves exact exposure, marks affected detail Unavailable, and sets verification Partial. Empty impact states distinguish no current change revisions, revisions requiring links, and filters hiding results. Unauthorized actions are disabled in UI and remain protected by RLS/RPC checks.

## Visual system and accessibility

Reuse `piece-control-command.css` and `--cmd-*` variables under `[data-skin="command"]`; dark mode comes from the existing token remap. Keep desktop table density. Panels stack at tablet widths while tables scroll horizontally. Mobile metrics use two columns and the digital thread becomes a full-width ordered inspector. Actions remain native controls with visible focus, accessible names, keyboard selection, non-color status labels, and reduced-motion support.

## Verification

Pure tests cover exact set/sheet matching, actionable-leaf deduplication, no heuristic counts, availability-based verification, lifecycle grouping, priority ordering and natural-sort ties, metrics, empty states, and URL parsing. Component tests cover preserved onboarding, populated Overview, revision selection, honest digital-thread labels, RBAC, mutation errors, and dashboard deep links. Route tests cover stale identifiers and view/focus behavior.

The full gates are targeted Vitest suites, `npm run lint`, `npm run typecheck`, `npm run typecheck:strict`, `npm run typecheck:noimplicitany`, `npm run check:no-new-js`, `npm test`, and `npm run build`. Browser acceptance verifies the revision-to-piece-to-thread workflow, permitted hold/clear invalidation, unchanged release blockers, desktop/tablet/mobile layouts, and both themes when an authenticated local environment is available.

## Acceptance criteria

- The feature exists only in the current Piece Register and dashboard.
- A PM can navigate from a current change revision to exact affected pieces and one piece's digital thread.
- Downstream exposure is visible before a human hold or release decision.
- Missing relationships never appear as zero impact or fabrication-ready.
- Existing mutations, lifecycle authority, and sub-workflows remain intact.
- Automated gates pass and rendered verification confirms the approved hierarchy in available themes and responsive layouts.
