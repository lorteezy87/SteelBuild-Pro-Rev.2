# Architecture Ownership

## Purpose

This repository previously had duplicate implementations split across parallel
module trees. Those duplicates have been removed. This document defines the
final ownership rules for the live application code so future work does not
recreate that drift.

## Source Of Truth

The live application lives under `src/`.

These root-level paths are the only app source locations that should contain
runtime code:

- `src/pages`
- `src/components`
- `src/lib`
- `src/api`
- `src/hooks`
- `src/services`
- `src/entities`
- `src/utils`
- `src/App.jsx`
- `src/Layout.jsx`
- `src/main.jsx`
- `src/pages.config.js`
- `src/globals.css`

All previously duplicated root-level module folders and duplicate
`src/<module>` implementation trees were removed after verification.

## Folder Ownership Rules

### `src/pages`

Owns route-level page entry files only.

A page may:

- compose module components
- coordinate page-local view state
- connect route params, project context, and top-level queries

A page should not become the canonical home for reusable module components.

### `src/components/<module>`

Owns canonical module implementation code.

This is the source of truth for:

- module UI components
- module modals and drawers
- module subviews
- module-specific helpers that are only used within that module

If a file belongs to a module and is reusable across more than one page in that
module, it belongs here.

### `src/components/shared`

Owns shared app-level UI composition only.

This is the source of truth for reusable app-facing UI that is not a primitive
and is not owned by a single module.

Examples:

- app shell controls
- shared headers, tables, progress indicators, badges
- cross-module selectors
- shared dialogs that remain UI-focused

Do not place workflow rules, security hooks, rate limiting, or audit logic
here.

### `src/components/ui`

Owns shared low-level UI primitives only.

Examples:

- buttons
- dialogs
- drawers
- inputs
- selects
- tabs

Business logic does not belong here.

If a component is a primitive building block, it belongs in `ui`.
If a component is reusable but app-specific, it belongs in `shared`.

Together, `src/components/ui` and `src/components/shared` are the only approved
shared UI locations. Do not introduce additional generic shared UI buckets
outside those two folders.

### `src/lib`

Owns shared app behavior and state integration.

Examples:

- auth/session behavior
- query client setup
- date shims
- app params
- fetch/transform/save orchestration helpers
- mutation feedback wrappers
- shared state utilities

Do not place module-specific workflow logic here unless it is truly shared
across modules.

### `src/api`

Owns backend/client integration concerns.

Examples:

- Base44 client setup
- API wrappers
- transport-level helpers

Entity workflow logic should not be spread randomly through pages when it can
be centralized here or in a module service.

### `src/hooks`

Owns reusable cross-module hooks.

If a hook is only used by one module, prefer keeping it inside that module's
component folder until it is shared.

Examples:

- security hooks
- rate-limit hooks
- destructive-audit hooks
- other reusable stateful behavior not tied to one module

### `src/services`

Owns reusable workflow logic, orchestration helpers, and business-rule services.

This is the correct home for:

- workflow validation
- rule engines
- cross-module business calculations
- service-style helpers that are not tied to rendering

Do not place React components here.

### `src/entities`

Owns entity-specific schemas, normalizers, adapters, and record-shape helpers
when those concerns are shared across modules.

Examples:

- entity normalizers
- field maps
- derived record helpers
- adapters between Base44 entity shapes and app-facing models

This folder can remain light until shared entity logic is extracted, but it is
the reserved home for that work.

### `src/utils`

Owns low-level reusable pure utilities.

Examples:

- formatting helpers
- phase derivation helpers
- sorting helpers

Avoid placing React stateful logic here.

## Prohibited Patterns

Do not reintroduce:

- duplicate module trees under both `src/<module>` and `src/components/<module>`
- duplicate runtime app files at the repository root
- page-local copies of reusable module components
- multiple source-of-truth copies of the same component
- workflow logic under `src/components/ui`
- security/audit/rate-limit hooks under generic component buckets
- stray shared components directly under `src/components`

## Implementation Notes

- `@/*` resolves to `src/*`
- `index.html` boots the app from `/src/main.jsx`
- build and deploy verification must pass after any structural cleanup
- standard save flows should prefer `src/lib/fetch-transform-save.js`
- standard mutation toasts should prefer `withMutationFeedback(...)`
- project access should prefer explicit `project_members` over legacy scattered team fields

## Next Cleanup Priorities

- continue breaking oversized page files into module hooks/services/view pieces
- reduce page-level business logic in `src/pages`
- improve lint and typecheck coverage so structure drift is caught earlier
- continue extracting entity rules into `src/entities` and workflow rules into
  `src/services`

