# Frontend Folder Ownership

This document defines where frontend code belongs and which layer owns each
responsibility. It is a structural rule set, not a list of individual code
owners.

Use these rules for new code and when moving an existing module. Preserve
business behavior and public exports during incremental migrations.

## Ownership map

| Path | Owns | Must not own |
| --- | --- | --- |
| `src/boot/` | Application bootstrap, provider composition, route gates, and top-level error/loading boundaries | Domain workflows or reusable feature UI |
| `src/config/` | Static application configuration and the canonical route registry | Runtime state or data access |
| `src/pages/` | Route-level screens and page orchestration | Generic UI primitives or duplicate domain engines |
| `src/components/<domain>/` | Reusable UI and interaction logic for one business domain, such as drawings, submittals, RFIs, scheduling, deliveries, or financials | Route registration or cross-domain business rules |
| `src/components/ui/` | Radix/shadcn compatibility primitives | SteelBuild domain behavior |
| `src/components/design-system/` | Product-wide visual primitives and stable UI contracts | Feature-specific status transitions, mutations, or permissions |
| `src/components/command/` | Shared command-surface controls, including canonical filter and KPI contracts | Domain-specific filter definitions or KPI calculations |
| `src/components/shared/` | Cross-domain application components that are not lower-level design primitives, such as guards and project-aware shells | Feature-specific workflows |
| `src/hooks/` | Reusable React hooks and TanStack Query orchestration | Presentational UI or server-authoritative permission rules |
| `src/services/` | Deterministic business rules, validation, workflow transitions, permissions, calculations, and audit helpers | React rendering or direct page composition |
| `src/api/` | Supabase, Storage, function, and integration client boundaries | Page-specific formatting or workflow decisions |
| `src/lib/` | Shared stateless utilities, domain mappings, contexts, and integration-independent helpers | Route-level UI or duplicate API clients |
| `src/styles/` | Global tokens and shared style foundations | Component-specific workflow logic |
| `src/types/` | Shared TypeScript contracts | Runtime implementation |
| `src/utils/` | Small, broadly reusable utilities that do not fit a domain-specific `lib` module | Stateful services or feature components |

Tests belong beside the module in `__tests__/` or in the established repository
test location for the layer. A compatibility export must have a focused test
that proves it resolves to the canonical implementation.

## Placement rules

1. A route registry entry points to a module in `src/pages/`. A page may compose
   domain components, hooks, services, and shared primitives, but it does not
   become the canonical home of reusable cross-route UI.
2. UI used by only one domain belongs in `src/components/<domain>/`. If the UI
   becomes genuinely cross-domain, move the stable visual contract to
   `design-system`, `command`, or `shared`; keep domain adapters in the domain.
3. Calculations and workflow decisions belong in `src/services/` or a
   domain-specific `src/lib/` module. Components may request and display a
   result, but must not create a second source of truth.
4. TanStack Query fetch, mutation, and invalidation behavior belongs in
   `src/hooks/`. Database authorization remains server-authoritative through
   RLS and RPCs; frontend folders never own access control.
5. Supabase and Storage calls enter through `src/api/` or an established hook.
   Do not add page-local clients.
6. Import through the `@/*` alias for cross-folder references. Relative imports
   are appropriate within a tightly scoped folder.
7. A matching filename does not prove two modules are duplicates. Compare the
   mounted consumers, props, state transitions, and domain meaning before
   consolidating. If contracts differ, use business-specific names rather than
   forcing them into one generic component.
8. Re-export shims are temporary compatibility boundaries. Record the canonical
   target, cover the shim with a focused test, migrate consumers, and delete the
   shim after the mounted workflow is verified.

## Canonical decisions from the 2026-07-23 audit

| Concern | Canonical location | Rule |
| --- | --- | --- |
| Generic bulk action strip | `src/components/design-system/BulkActionBar.jsx` | Domain-specific destructive and disabled states remain adapters until parity is tested. |
| Command filter surface | `src/components/command/FilterBar.tsx` | Feature filter definitions stay with the feature and compose the shared surface. |
| Command KPI surface | `src/components/command/KpiStrip.tsx` | Domain KPI calculations and interactive behavior stay with the feature. |
| Mounted drawing viewer toolbar | `src/pages/drawingViewer/ViewerToolbar.jsx` | Viewer compatibility paths must resolve to the mounted drawing viewer contract. |
| Generic empty state | `src/components/design-system/EmptyState.jsx` | Upload experiences and dynamic workflow copy remain domain-specific compositions. |

The similarly named KPI cards, scope item forms, section cards, and weekly
summaries found in the audit have materially different contracts or domain
meanings. They must remain domain-owned until a separately tested consolidation
preserves those contracts.

## Review checklist

Before adding or moving a module:

- Confirm the mounted route or consumer.
- Identify the layer that owns the business rule and the layer that owns the UI.
- Search for same-purpose modules, not filename matches alone.
- Preserve traceability for changes affecting approvals, cost, schedule,
  compliance, fabrication release, shipping, or erection readiness.
- Add focused tests before replacing an existing public import path.
- Update this document when a structural decision changes.
