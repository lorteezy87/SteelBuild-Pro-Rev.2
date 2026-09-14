# Agent Memory Index

Living notes for SteelBuild Pro agent sessions. Prefer short, actionable
recipes over narratives.

## Index

- [strict-null cluster fixes](strict-null-cluster-fixes.md) — behavior-preserving recipes for the strictNullChecks ratchet (EnrichedX type, .jsx boundary casts, optional-chaining handler guards)
- [PR supersede hygiene](pr-supersede-hygiene.md) — how we close dirty mega-PRs: tree-diff, cherry-pick unique delta, all four typecheck ratchets, superseding PR
- [product-state-2026-08](product-state-2026-08.md) — what landed on main in the Aug 2026 PR cleanup train

## Always check before coding

1. `git pull origin main` + read `AGENT_CLAIMS.md`
2. CI gates that commonly fail re-lands: `lint`, `typecheck`, `typecheck:strict`, `typecheck:noimplicitany` (all blocking)
3. `storage-backup.yml` on push is expected red without secrets — ignore for feature PRs
4. Prefer **supersede on clean main** over rebasing mega-train branches
5. Product terms for the user (preview); never ports/container paths in user chat

## Ratchet quick fixes

| Gate | Typical failure | Fix pattern |
|---|---|---|
| strictNullChecks | DB row / domain type null↔optional | `as Submittal` bridge or widen `? \| null` on board types |
| noImplicitAny | fixture `null`/`[]` without type | annotate fixture `const x: Snapshot = {…}` |
| noImplicitAny | `(o) =>` callbacks | `(o: boolean) =>` |
| lint | `visibleGroups` only in parent | define in each component (e.g. DashboardReferenceSidebar) |
| tests | expected `color-mix` after opaque theme | update regression to solid `--sbd-bg-panel` |

## Deploy

- Production: CI-gated only (`vercel.json` `main: false`)
- Edge functions: separate Supabase deploy
- Owner-only: PITR, branch protection, Stripe Tax dashboard, apply migrations
