# Folder ownership (Tasks 5 / 35 / 38)

Canonical layout for SteelBuild Pro source. Prefer these locations for new work; do not invent parallel roots.

## Canonical locations

| Concern | Location | Notes |
| --- | --- | --- |
| Route shells / page containers | `src/pages/` | One entry per route (or a small `pages/<feature>/` folder of shells + helpers). Registry: `src/config/routes.js`. |
| Feature / domain UI | `src/components/<domain>/` | Drawings, schedule, submittals, financials, etc. |
| Shared SteelBuild chrome | `src/components/design-system/` | Command bars, KPI tiles, BulkActionBar, Modal, etc. |
| Radix / shadcn primitives | `src/components/ui/` | Low-level primitives only — not feature UI. |
| Cross-cutting shared widgets | `src/components/shared/` | Truly multi-domain helpers (permissions hooks wrappers, etc.). |
| TanStack Query / CRUD hooks | `src/hooks/` | Data fetching and mutations wired to entities. |
| Deterministic domain engines | `src/services/` | Pure-ish engines (margin, schedule cascade, permissions, cacheRegistry). |
| Shared utilities / mapping | `src/lib/` | Non-UI helpers; domain subfolders OK (`lib/drawingHub/`, `lib/mutations/`). |
| Supabase client + API surface | `src/api/` | Barrel `supabaseClient` + `api/client/*` domain modules. |
| Shared types | colocated `types.ts` or `src/types/` when truly cross-cutting | Prefer feature-local types next to the feature. |
| Unit / component tests | `__tests__/` next to the module under test | e.g. `src/lib/mutations/__tests__/`. Playwright E2E lives under repo E2E conventions, not `src/`. |

## Role split (pages vs components vs design-system vs ui)

- **`src/pages/`** — route shells: load params, wire hooks, compose domain components. Keep them thin.
- **`src/components/<domain>/`** — feature UI owned by that domain.
- **`src/components/design-system/`** — shared SteelBuild chrome used across many pages.
- **`src/components/ui/`** — radix/shadcn primitives only; do not dump feature screens here.

## Prohibited patterns

- **No new root clutter** under `src/` (no one-off top-level folders for a single feature).
- **No duplicate page + component for the same feature** without an explicit reason (e.g. a documented legacy shim or test-only holdback).
- **No second copy of a FilterBar / BulkActionBar / grid** in `pages/` when design-system or domain already owns the canonical one — page-local bars are allowed only when the filter controls are truly page-specific and not a second global toolkit.
- **Do not grow `src/routes.js`** — it is an intentional back-compat shim; new routes go in `src/config/routes.js`.

## Correct placement examples

| Change | Put it here |
| --- | --- |
| New RFI list filter chips unique to RFIs | `src/pages/rfis/` (page-local) or `src/components/` only if reused |
| New shared BulkActionBar behavior | `src/components/design-system/BulkActionBar.jsx` |
| New schedule cascade rule | `src/services/scheduleCascade` (or sibling service) |
| New mutation helper used by many hooks | `src/lib/mutations/` |
| New Doc Control register view | `src/components/drawings/register/` (`*Panel` is canonical for DocControlPanel) |
| New vitest for a lib helper | `src/lib/<area>/__tests__/<name>.test.ts` |

See also `docs/action-plan/DUPLICATE_INVENTORY.md` for known legacy duplicates and which file wins.
