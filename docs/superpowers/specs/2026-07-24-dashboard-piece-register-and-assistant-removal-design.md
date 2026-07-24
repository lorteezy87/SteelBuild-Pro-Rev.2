# Dashboard Piece Register and Assistant Removal Design

## Goal

Restore the intended Piece Register command experience (page + dashboard) and retire the Project Management Assistant from every active application path.

## Root cause (Piece Register)

The unified command-deck Piece Register redesign landed on
`codex/redesign-piece-register` (`d44856b4`) but was never merged to `main`.
`main` continued to serve the older slate workspace page and the standalone
`CanonicalPieceDashboard` sibling widget. That is an unmerged-work gap, not a
revert.

## Scope

### Piece Register restoration

- Bring the unmerged command-deck implementation onto the active branch:
  `PieceRegister.tsx` + `piece-control-command.css` + Piece Control panels.
- Replace the obsolete dashboard sibling `CanonicalPieceDashboard` with
  `PieceControlDashboardPanel` embedded inside `DashboardControlCenter`.
- Wire dashboard navigation target `piece-register` → `/PieceRegister`.
- Preserve canonical queries, realtime invalidation, rollups, shadow comparison,
  work-package reporting, import/archive/relationship/fab/logistics contracts,
  and off-mode behavior.

### Assistant retirement

Remove the active assistant feature rather than hiding it:

- Delete the launcher, drawer, message/provenance components, chat hook, and their tests.
- Delete the `schedule-assistant` Supabase Edge Function implementation.
- Delete the PMA-backed Decision Log route and page.
- Remove PMA entity clients, project-scope registrations, export-table registrations, LLM routing, telemetry comments, route/navigation entries, and gateway tests.
- Remove stale current documentation and runbook references.
- Keep archived migrations and the generated database schema snapshot intact; they are historical records and may represent retained production data. No destructive database migration is part of this repository cleanup.

## Architecture

`Dashboard.jsx` owns navigation and data-fetch composition. It passes
`onNavigate("piece-register")` into `DashboardControlCenter`, which renders
`PieceControlDashboardPanel` immediately after the KPI strip.

`PieceRegister.tsx` is the project-scoped command workspace for register,
import, relationships, fabrication, logistics, and rollout.

Assistant retirement removes leaf components first, then all imports,
route/config registrations, backend routing, and active documentation.
Repository-guard tests prevent deleted feature paths and active identifiers
from being reintroduced, and prevent the obsolete `CanonicalPieceDashboard`
from returning.

## Error and empty states

- Loading and query failures use Command panel styling and remain visible inside the dashboard/register skin.
- Empty station backlog and empty ship-date lists retain explicit messages.
- Unknown weights remain excluded from tonnage percentages and continue to show a warning.
- Removing the assistant introduces no replacement control or dead placeholder.

## Testing

- Component tests: Piece Register command shell, dashboard panel metrics/navigation, filters/status controls.
- Repository guards: deleted frontend/backend paths do not exist; active runtime/config files contain no assistant identifiers; obsolete `CanonicalPieceDashboard` is absent and not imported.
- Existing route-registry, gateway, dashboard derive, typecheck, lint, Vitest, and production-build gates remain authoritative.

## Non-goals

- No canonical piece-control data-model or rollup changes.
- No destructive deletion of retained PMA database rows or rewriting of archived migrations.
- No changes to shared Command UI components or `src/styles/command.css` beyond Piece Control scoped styles.
