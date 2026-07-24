# Dashboard Piece Register and Assistant Removal Design

## Goal

Restore the dashboard's canonical Piece Register reporting to the current light Command UI and retire the Project Management Assistant from every active application path.

## Scope

### Dashboard

- Keep the canonical piece-control query, realtime invalidation, rollups, shadow comparison, work-package reporting, and unknown-weight safeguards unchanged.
- Render the piece reporting inside `DashboardControlCenter` so it inherits the same `data-skin="command"` light surface as the rest of the project dashboard.
- Replace the legacy standalone slate/teal Tailwind card with Command UI panel, KPI, row, pill, and table classes.
- Add a `View all` action that navigates to `/PieceRegister`.
- Preserve the off-mode behavior: projects with Piece Control disabled render no piece-reporting panel.

### Assistant retirement

Remove the active assistant feature rather than hiding it:

- Delete the launcher, drawer, message/provenance components, chat hook, and their tests.
- Delete the `schedule-assistant` Supabase Edge Function implementation.
- Delete the PMA-backed Decision Log route and page.
- Remove PMA entity clients, project-scope registrations, export-table registrations, LLM routing, telemetry comments, route/navigation entries, and gateway tests.
- Remove stale current documentation and runbook references.
- Keep archived migrations and the generated database schema snapshot intact; they are historical records and may represent retained production data. No destructive database migration is part of this repository cleanup.

## Architecture

`Dashboard.jsx` owns navigation and data-fetch composition. It passes the canonical piece-reporting node into a new optional `pieceRegister` slot on `DashboardControlCenter`. The control center renders that slot immediately after the dashboard KPI strip and before module launchers, keeping all project dashboard content inside one Command skin.

`CanonicalPieceDashboard.tsx` remains responsible for fetching and deriving canonical piece facts. Its presentation changes to Command UI primitives/classes only; repository and rollup contracts do not change.

Assistant retirement removes leaf components first, then all imports, route/config registrations, backend routing, and active documentation. A repository-guard test prevents the deleted feature paths and active identifiers from being reintroduced.

## Error and empty states

- Loading and query failures use Command panel styling and remain visible inside the dashboard skin.
- Empty station backlog and empty ship-date lists retain explicit messages.
- Unknown weights remain excluded from tonnage percentages and continue to show a warning.
- Removing the assistant introduces no replacement control or dead placeholder.

## Testing

- Component test: canonical piece reporting renders Command UI structure, preserves calculated metrics, and invokes the Piece Register navigation callback.
- Repository guard: deleted frontend/backend paths do not exist and active runtime/config files contain no assistant identifiers.
- Existing route-registry, gateway, dashboard derive, typecheck, lint, Vitest, and production-build gates remain authoritative.

## Non-goals

- No canonical piece-control data-model or rollup changes.
- No redesign of the Piece Register route itself.
- No destructive deletion of retained PMA database rows or rewriting of archived migrations.
- No changes to shared Command UI components or `src/styles/command.css`.
