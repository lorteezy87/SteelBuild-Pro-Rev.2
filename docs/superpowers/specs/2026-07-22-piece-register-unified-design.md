# Unified Piece Register Design

**Date:** 2026-07-22
**Status:** Visual direction approved; ready for implementation planning
**Selected direction:** Option 1, Integrated Command Deck

## Goal

Make Piece Control feel like a native SteelBuild Pro module across both places where it appears:

1. The project Dashboard summary.
2. The full Piece Register workspace.

The redesign must help project and fabrication teams quickly answer:

- How much piece scope is loaded?
- What is in fabrication, fabricated, ready to ship, delivered, or erected?
- What is blocked, held, unassigned, or missing weight?
- What requires action next?
- Where should the user go to import, organize, release, produce, ship, deliver, or erect pieces?

The visual integration must not change piece-control authority, lifecycle rules, data contracts, permission checks, or audit safeguards.

## Current-State Findings

### Dashboard

`src/pages/Dashboard.jsx` renders `CanonicalPieceDashboard` as a full sibling immediately above `DashboardControlCenter`. The component has its own gradient surface, KPI cards, charts, work-package table, shipping list, and shadow-comparison panel.

This produces two stacked application surfaces:

- A Piece Control reporting application.
- The normal SteelBuild Pro Dashboard.

When the project contains little or no piece data, the lifecycle, backlog, packages, shipping, and comparison sections still occupy substantial vertical space. The user must scroll through an empty report before reaching the actual Dashboard.

### Piece Register

`src/pages/PieceRegister.tsx` uses a separate full-page visual system:

- Dark standalone header.
- Decorative page background.
- Ad hoc KPI cards and tab styling.
- Individually styled register, import, relationship, production, logistics, and settings surfaces.

This page is functional but visually disconnected from the existing SteelBuild Pro command-center system.

### Language

Several labels expose implementation terminology rather than operational meaning:

- Canonical Piece Control.
- Canonical work packages.
- Shadow comparison.
- Legacy values.
- Piece and tonnage deltas.
- Active actionable leaf lots.

Internal code and database terms may remain unchanged, but the UI must use plain construction operations language.

## Scope

### Included

- Compact Piece Control summary embedded in the normal project Dashboard.
- Full Piece Register setup/off state.
- Piece Register header, KPI rail, section navigation, lifecycle summary, exception summary, filters, table, and selection/archive controls.
- Imports.
- Lots & Links.
- Production.
- Logistics.
- Settings and pilot/live readiness.
- Loading, error, empty, no-project, and permission-limited states.
- Desktop and responsive layouts.
- User-facing terminology.
- Focused regression tests and visual verification.

### Not Included

- Database schema changes.
- Changes to canonical piece data or lifecycle definitions.
- Changes to import reconciliation or approval logic.
- Changes to production, logistics, archival, or release RPC contracts.
- Changes to project-role or RLS authority.
- Automatic approvals, mode transitions, releases, or status changes.
- New application routes.
- A redesign of the global SteelBuild Pro shell.

## Design Direction

The approved design uses the existing SteelBuild Pro command-center language:

- White and light-neutral base surfaces.
- Navy/slate typography.
- Amber as the primary action and selection accent.
- Thin dividers and restrained borders.
- Minimal elevation.
- Compact, tabular operational data.
- Photo-backed `PageHero` only on the full Piece Register route.
- Existing Lucide icon language.

Hierarchy, spacing, alignment, typography, and row separation must do most of the visual work. Avoid cards inside cards, oversized rounded containers, decorative gradients, and tall empty panels.

## Information Architecture

### Dashboard Piece Control Panel

The Dashboard must render its normal `PageHero` first. Piece Control becomes one compact decision panel within `DashboardControlCenter`, not a separate page above it.

The panel contains:

1. Header:
   - Title: `Piece Control`.
   - Mode label.
   - Short authority explanation.
   - `Open Piece Register` action.
2. Compact metrics:
   - Total pieces.
   - Known tons.
   - In fabrication.
   - Ready to ship.
   - Exceptions.
3. Lifecycle strip:
   - Not Started.
   - In Fabrication.
   - Fabricated.
   - Shipped.
   - Delivered.
   - Erected.
4. Needs attention:
   - Held pieces.
   - Unassigned pieces.
   - Missing weights.
   - Meaningful comparison differences while in Shadow review.

The compact panel must never render the work-package table, shipping list, comparison grid, or a tall empty chart on the Dashboard. Those details belong in the full Piece Register.

When the project has no piece rows, the panel collapses to a short empty state with an `Import pieces` or `Set up Piece Register` action where the user has permission.

When Piece Control is off, preserve the current behavior of not showing canonical reporting unless a short setup prompt is deliberately allowed for an authorized project admin.

### Full Piece Register

The page follows this order:

1. SteelBuild Pro `PageHero`.
2. KPI strip.
3. Lifecycle and Needs Attention row.
4. Section navigation.
5. Active workspace.

#### Page Hero

- Title: `Piece Register`.
- Project name.
- Concise subtitle: `Controlled piece, lot, production, and logistics record.`
- Mode/authority chip.
- Primary action: `Import pieces`.
- Optional secondary action when appropriate: `Export`.

#### KPI Strip

- Total Pieces.
- Known Tons.
- In Fabrication.
- Ready to Ship.
- Exceptions.

Metrics use the existing piece rows and tonnage rules. Unknown weight remains explicitly excluded from known tonnage and is surfaced as an exception.

#### Lifecycle and Needs Attention

The lifecycle panel uses one compact horizontal segmented strip rather than a vertical list of mostly empty rows.

The Needs Attention panel prioritizes:

- Unassigned pieces.
- Missing weights.
- Held pieces.
- Data or comparison discrepancies that need review.

Each exception provides a direct action that opens or filters the relevant Piece Register section. Empty exceptions collapse to a concise success message.

#### Section Navigation

Preserve the current functional sections:

- Overview.
- Register.
- Imports.
- Lots & Links.
- Production.
- Logistics.
- Settings.

Use one shared navigation pattern with a clear selected state, keyboard focus visibility, and horizontal overflow on narrower screens.

## Section Designs

### Overview

The Overview becomes a concise operational summary:

- Lifecycle strip.
- Needs Attention.
- Work-package status or readiness summary.
- Upcoming shipments.
- Clear next actions.

The current four-step educational workflow remains available only when the project has no piece data. It must not displace operating information after setup.

### Register

The table is the primary working surface.

Toolbar:

- Search.
- Work package.
- Profile.
- Grade.
- Lifecycle.
- Source.
- Hold state.
- Clear filters.
- Column controls if supported without introducing new persistence.

Table:

- Selection.
- Mark.
- Lot.
- Quantity.
- Work package.
- Profile.
- Grade.
- Length.
- Weight.
- Tons.
- Lifecycle.
- Current station.
- Hold state.
- Updated metadata where available.

The existing archive workflow remains permission-gated and requires a reason plus exact confirmation text. Bulk actions appear in a compact contextual bar only when rows are selected.

### Imports

Keep the current stage, review, approve, confirm, and apply flow.

Restyle it as:

- Compact import setup panel.
- Batch list.
- Selected batch summary.
- Decision-count pills.
- Reconciliation results table.

The UI must continue to state that imports are staged and do not write directly to the active register before approval and confirmation.

### Lots & Links

Preserve:

- Work-package assignment and unassignment.
- Piece-to-drawing linking and unlinking.
- Derived readiness.

Replace implementation-facing copy such as `pieces.work_package_id` with plain operational text. Keep readiness explicitly read-only and distinguish blockers from successful checks.

### Production

Preserve station-transition rules, selection behavior, confirmation, and immutable history.

Use:

- Compact station/status summary.
- Candidate-piece table or grouped list.
- Clear disabled reasons.
- Focused transition action.
- Read-only event history.

No lifecycle override or reversal control is introduced.

### Logistics

Preserve shipment, delivery, and erection transition rules and required reference data.

Use:

- Three aligned operational sections for Ship, Deliver, and Erect.
- Candidate counts.
- Compact selection rows.
- Required reference fields.
- Explicit confirmation.
- Immutable history.

Empty candidates collapse to a short message rather than a large blank column.

### Settings and Rollout

Preserve readiness checks, mode transition rules, exact confirmation text, role requirements, CSV export, and mode audit history.

Use plain mode language:

| Internal mode | User-facing label | Authority explanation |
| --- | --- | --- |
| `off` | Not set up | Piece Control is not active for this project. |
| `shadow` | Shadow review | Existing production records remain authoritative while the register is compared. |
| `pilot` | Pilot workflow | The approved pilot workflow is active for this project scope. |
| `live` | Live workflow | Piece Control is authoritative for the enabled workflow. |

Readiness blockers remain prominent and must prevent invalid pilot/live transitions exactly as they do today.

## Component Strategy

Reuse the existing command-center components and tokens before adding new shared primitives:

- `PageHero`.
- `KpiStrip`.
- `DecisionPanel`.
- `FilterBar`.
- `DataTable` where its API supports the required interactions.
- `Pill`.
- `useCommandSkin`.
- `src/styles/command.css`.

Recommended focused components:

- `PieceControlDashboardPanel`: compact Dashboard integration using the current canonical dashboard query and realtime invalidation.
- `PieceControlModeBadge`: maps internal modes to user-facing labels and authority text.
- `PieceLifecycleStrip`: shared lifecycle presentation for Dashboard and Piece Register.
- `PieceAttentionPanel`: shared exception presentation with context-specific actions.
- `pieceRegisterSummary`: pure derivation for KPI, lifecycle, and exception models.

`PieceRegister.tsx` remains the state and mutation owner. The redesign should extract only presentational pieces that reduce duplication or make tests materially clearer. Do not introduce a broad state-management or component-framework rewrite.

The current `CanonicalPieceDashboard` name may be replaced by `PieceControlDashboardPanel` once its full-page reporting responsibility is removed. Internal query keys and canonical repository names do not need to change.

## Data Flow

### Dashboard

1. Project mode determines whether reporting is enabled.
2. Existing `fetchCanonicalDashboardSnapshot(project.id)` query loads canonical reporting data.
3. Existing rollup functions derive actionable leaf pieces, tonnage, lifecycle, packages, backlog, and comparison values.
4. A pure view-model function derives the compact metrics and exceptions.
5. `PieceControlDashboardPanel` renders the compact panel inside `DashboardControlCenter`.
6. Existing realtime invalidation remains active.

### Piece Register

1. Existing project context provides project and mode.
2. Existing queries load pieces, import batches, work packages, and active section data.
3. Pure derivation creates KPI, lifecycle, and exception models.
4. Filters continue to run through `filterPieceRegisterRows`.
5. Existing mutations retain their invalidation, confirmation, audit, and toast behavior.

No client-side visual permission check replaces server-authoritative RLS or RPC validation.

## Loading, Empty, and Error Behavior

### Loading

- Use compact skeletons matching the final panel dimensions.
- Do not render full-height blank containers.
- Preserve page navigation and header stability while active section content loads.

### Empty

- No pieces: explain the next safe step and link to Imports.
- No fabrication backlog: show one concise success/empty row.
- No upcoming shipments: show one concise message with an action to open Logistics or work-package planning.
- No exceptions: show a compact positive state.
- No linked drawings or candidates: explain why and what prerequisite is needed.

### Error

- Keep errors within the affected panel.
- Show a plain description and retry action where safe.
- Do not hide the rest of the Piece Register because one secondary query fails.
- Continue using toast errors for failed mutations.

## Permissions and Safety

- Preserve `useProjectRole`, `roleAtLeast`, and current admin/owner requirements.
- Preserve exact typed confirmations for archive and mode transitions.
- Preserve import approval and apply confirmation as separate human-controlled steps.
- Preserve immutable production and logistics event history.
- Preserve database/RPC authority for all business-critical writes.
- Never auto-approve, auto-release, auto-transition, or auto-resolve piece exceptions.

## Responsive and Accessibility Requirements

- Desktop: optimized for the existing sidebar shell and wide operational tables.
- Tablet: KPI strip wraps predictably; lifecycle and attention panels stack.
- Narrow viewport: section navigation scrolls horizontally; table remains horizontally scrollable without clipping controls.
- Use semantic headings, navigation, buttons, labels, and tables.
- Preserve visible keyboard focus.
- Use `aria-current` for the active section.
- Do not communicate status through color alone.
- Maintain readable contrast for muted labels, pills, and disabled controls.
- All icon-only actions require accessible names.

## Validation

### Unit and Component Tests

- Summary derivation:
  - Counts and tonnage.
  - Unknown weights.
  - Held and unassigned pieces.
  - Lifecycle counts.
  - Mode label mapping.
- Dashboard panel:
  - Hidden/off behavior.
  - Loading, error, zero-data, and populated states.
  - Compact content only.
  - Navigation actions.
- Piece Register:
  - Active section navigation.
  - Filter behavior and natural ordering.
  - Needs Attention actions.
  - Archive gating and confirmation remain intact.
  - Mode authority language.
- Existing piece-control repository and lifecycle tests remain green.

### Repository Validation

- Focused Piece Register and Piece Control tests.
- `npm run lint`.
- `npm run typecheck`.
- `npm run typecheck:js`.
- Strict typecheck ratchets.
- Full `npm run test`.
- `npm run build`.

### Visual Validation

Compare the implementation against:

- The supplied current-state screenshot.
- The approved Integrated Command Deck visual.
- Existing Dashboard and command-center surfaces.

Validate:

- Dashboard starts with the normal Dashboard hero.
- Piece Control no longer pushes the Dashboard below a full reporting page.
- Empty data does not create tall blank regions.
- Piece Register matches the global shell and command-center rhythm.
- Desktop and responsive states do not clip tabs, filters, tables, or actions.

## Acceptance Criteria

The redesign is complete when:

1. The project Dashboard shows Piece Control as one compact native panel.
2. The full Piece Register uses the SteelBuild Pro command-center visual system.
3. All seven Piece Register sections share a consistent header, navigation, spacing, controls, and state treatment.
4. User-facing engineering/debug terminology is removed from the Piece Control UI.
5. Empty data produces compact, actionable states.
6. Existing import, relationship, production, logistics, archive, readiness, mode-transition, permission, and audit behavior is preserved.
7. Relevant automated validation passes.
8. The implemented desktop and responsive layouts have been visually inspected against the approved direction.

## Risks and Controls

- **Risk:** Visual refactoring accidentally changes critical write behavior.
  **Control:** Keep current mutation functions and RPC calls unchanged; refactor presentation around them.

- **Risk:** Shared command CSS changes affect unrelated modules.
  **Control:** Prefer existing classes and Piece Register-scoped additions. Avoid broad edits to shared selectors.

- **Risk:** The generic `DataTable` cannot support current selection/archive behavior.
  **Control:** Reuse its visual conventions without forcing the current register into an incompatible API.

- **Risk:** Dashboard and Piece Register metrics diverge.
  **Control:** Derive common lifecycle and exception presentation from shared pure helpers while keeping each surface's existing authoritative query.

- **Risk:** User-facing mode wording obscures authority.
  **Control:** Always pair the friendly label with a direct authority explanation.
