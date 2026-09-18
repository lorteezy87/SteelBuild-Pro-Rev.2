# SteelBuild Pro UI Redesign Wave 4 — Commercial, Portfolio, Reports, Documents

**Goal:** Complete the approved system-first redesign across the commercial and management surfaces without changing financial calculations, permissions, routing, storage authority, or project-control business rules.

## Scope

1. Cost / Budget Control
2. Change Orders
3. Backcharges
4. Schedule of Values
5. Pay Applications
6. Portfolio
7. Reports Hub
8. Documents
9. Final system consistency / responsive / accessibility / CI validation

## Presentation contract

All migrated control centers use the same SteelBuild-Pro command grammar:

- `PageHeader` for project/module identity and primary actions.
- `OperationalSummary` for compact management metrics.
- `AttentionQueue` for actionable exceptions only.
- Dense registers remain primary working surfaces.
- Brand orange is used for identity and primary action, not semantic status.
- Unknown financial/document/control evidence remains explicitly unknown.
- Existing calculations and mutation authority remain untouched.

### Cost / Budget
Expose revised budget, actual, committed, EAC, variance, budget burn, stale COs and contingency. Attention prioritizes over-budget codes, unallocated approved COs, review flags and stale commercial exposure.

### Change Orders
Make the chain `Change Event / COR → Submitted → Approved → Billed` easier to scan using existing CO state. Surface aging, amount, linked evidence and commercial risk without inventing evidence completeness.

### Backcharges
Prioritize open exposure, aging, responsible party, amount, documentation state and recovery status from existing fields.

### SOV / Pay Apps
Treat SOV as billing authority and Pay Apps as monthly billing execution. Preserve existing financial math. Surface unallocated/unsupported lines, pending approvals and reconciliation issues already represented by current derivations.

### Portfolio / Reports
Portfolio becomes a management rollup across projects; Reports becomes a catalog/workspace. Replace decorative hero/KPI chrome with the same compact management grammar.

### Documents
Preserve DMS/folder/search/upload behavior. Surface review queues, recent uploads, folder context and document status in a consistent SteelBuild command layout.

## Verification

- Focused control-center tests for changed surfaces.
- `npm run lint`
- `npm run check:no-new-js`
- `npm run typecheck`
- `npm run typecheck:js`
- strict-null and noImplicitAny ratchets
- full Vitest suite
- Chromium shell recovery
- database helper checks
- production build
- final PR remains draft until all checks are green.
