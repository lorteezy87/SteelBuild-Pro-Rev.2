# Product state — Aug 2026 cleanup train

Snapshot of **main** after the PR hygiene pass (see also README “Product surfaces”).

## Landed on main

- Drawing Register flat table + set filter/grouping
- 3D load fixes, 1/16″ measure, graphics polish, unbounded zoom
- 3D Fab color refresh after Production/Logistics/release (+ Relationships gap closed)
- Module scope-cut gates (`moduleGating` / `useModuleAccess`) — gated modules OFF by default
- Detailing CC event glue: targetSetId create, revision attach modal, StatusSuggestStrip
- SOV page-shell LoadingSkeleton + error/retry
- Opaque dark menus (`--sbd-bg-panel*`, `.sbp-opaque-popout`)
- Enterprise Tier 1 **code**: PM floor migration, signup clickwrap, Stripe Tax hooks,
  `supabase:drift`, vercel main auto-deploy off
- Capacitor iOS / account delete, security matrix docs (earlier supersedes)

## Not fully closed from PRs alone

- Owner Tier 1: PITR, backup secrets, apply PM-floor migration, Stripe Tax dashboard,
  counsel, branch protection, dead edge-fn delete with `DRY_RUN=0`
- Package Board may still be on an open supersede PR until CI green + merge

## Key paths

- `src/config/moduleGating.js`, `src/hooks/useModuleAccess.js`
- `src/lib/submittalLinkGlue.ts`, `src/pages/submittals/StatusSuggestStrip.tsx`
- `src/lib/pieceControl/queryKeys.ts` → `invalidatePieceControlQueries` (3D keys)
- `src/hooks/useCanonicalReportingRealtime.ts` → `invalidateCanonicalPieceCaches`
- `src/styles/steelbuild-dark.css`, `base.css` `.sbp-opaque-popout`
- `docs/runbooks/tier1-enterprise-status.md`
