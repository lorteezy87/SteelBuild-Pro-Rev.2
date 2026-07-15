# Phase 0 Engineering Handoff

Date: 2026-07-14
Repository: `lorteezy87/SteelBuild-Pro-Rev.2`
Branch: `agent/handoff-cleanup`
Pull request: [#77](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/77), open and Draft
Batch 40 starting HEAD: `d4022899a0be19dee3a53f10d4f8ce2880fc76f6`
Base: `origin/main` at `11a28fced549840c0a44fc4b6d7182e834cdb363`

## 1. Executive summary

Phase 0 reconciles the route, presentation, permission, feature-flag, mutation,
dead-path, and source-of-truth boundaries needed for a reviewable release
candidate. Canonical control centers now own the primary page presentations,
while detailed registers and specialist workflows remain intentional secondary
surfaces. Batch 40 adds evidence and promotion gates; it does not add product
behavior or change production state.

Local source, test, lint, typecheck, build, dependency-audit, and date/timezone
evidence support a staging candidate. Production approval is not claimed until
the external staging database, Edge Function configuration, smoke, backup,
approval, and CI/branch-protection gates in the release checklist are complete.

## 2. What Phase 0 changed

- Retired the browser-controlled presentation-flag system and removed
  `command_ui` runtime consumers. Supabase `feature_flags` remains the only
  runtime flag authority.
- Consolidated canonical surfaces from Budget Control through Detailing Control
  Center while preserving supported specialist routes and compatibility redirects.
- Retired unreachable pages, unsupported PDF generation, dormant workflow/save/
  delivery abstractions, and user-visible dead ends where caller evidence was
  sufficient.
- Consolidated UI permission resolution in `usePermissions()` and kept
  `useAppSecurity()` identity/write-shaping only. RLS/RPC remains authoritative.
- Preserved fail-closed official numbering, fabrication-release gates, audited
  workflow writes, cache invalidation, and server-backed domain repositories.
- Removed committed customer export payloads and documented the export-data
  policy; prior Git history remains unchanged.

## 3. What Phase 0 deliberately did not change

- No production deployment, merge, migration application, Edge Function deploy,
  external Vercel/Supabase/GitHub/Sentry setting, or broad dependency upgrade.
- No database schema, RLS policy, RPC contract, generated remote schema, or
  production data was changed by Batch 40.
- No specialist register was deleted solely because it is not the primary hub.
- No broad date-only rewrite, penetration test, or automated vulnerability fix
  was performed.

## 4. Current architecture

The application is a Vite React 18 client with TanStack Query, Supabase Auth and
Postgres, RLS-scoped entity access, project/org context, and a route registry.
`src/boot/AppProviders.jsx` establishes shared providers; `AuthContext` owns
identity/session state; `src/boot/AppRoutes.jsx` mounts pages, project-scoped
routes, and compatibility redirects. `src/config/routes.js` is the route
inventory and lifecycle contract.

Primary pages compose a canonical control center. The page parent remains the
authority for domain queries, mutations, permissions, modal state, and cache
invalidation. Detailed registers, viewers, editors, drawing workflows, review
rounds, and specialized analytics remain routable where they are supported.

## 5. Source-of-truth boundaries

| Domain | Authority | Boundary rule |
| --- | --- | --- |
| Submittals | Submittal records and review rounds | Formal approval, review, BIC, due, and round workflow live here. |
| Drawing sets | DrawingSet | Package identity, package files, and package metadata live here. |
| Drawings | Drawing rows | Sheet-level document metadata lives here. |
| Revisions | DrawingRevision | Revision history and current-revision relationships live here. |
| RFIs | RFI records | Blocker status and RFI decision state live here. |
| Work Packages / Schedule | Their domain records | Operational dates remain with the active work-package or schedule command. |
| Fabrication release | Server gate/RPC/trigger plus audited client command | Release is fail-closed; UI readiness is not authorization. |
| Detailing Control Center | Read model and quick-action surface | It does not replace Submittal, DrawingSet, Drawing, Revision, or RFI workflow authority. |
| Feature flags | Supabase `feature_flags` plus typed catalog | No localStorage, URL override, or browser fallback authority. |
| Permissions | `usePermissions()` for UI resolution; RLS/RPC for access | Client checks are display behavior only. |

## 6. Authentication, tenancy, and permissions

`AuthContext` supplies the current identity. `useOrg()` supplies organization
membership context, and `usePermissions()` combines the global role from
`user_profiles` with the active-project role from `get_my_project_role`.
`useAppSecurity()` exposes only `user`, `stamp()`, and `assertProjectId()`.

UI gates are least-privilege display behavior while server roles load. Actual
reads, writes, destructive actions, workflow transitions, and tenant boundaries
are enforced by Supabase RLS, RPCs, triggers, and domain validation. New actions
must begin with a server rule; `canPerform()` is never mutation authorization.

## 7. Feature-flag inventory

See [`FEATURE_FLAG_AND_DEAD_PATH_INVENTORY.md`](FEATURE_FLAG_AND_DEAD_PATH_INVENTORY.md)
and [`FEATURE_FLAGS.md`](FEATURE_FLAGS.md). Eight operational flags remain in
the typed catalog, all with safe disabled defaults. `command_ui` is a historical
SQL row only and has no runtime consumer. Per-user overrides are administrator-
managed environment state and personal emails/overrides are not committed.

## 8. Route and specialist-workflow model

Registered pages have `active` or `internal` lifecycle metadata. Static entry
and compatibility metadata covers legacy aliases including `/Financials`,
`/CostDashboard`, `/ResourceManagement`, `/AIInsights`, and `/MarginRisk`.
Redirect targets are tested as mounted routes. `/ProjectDetail` keeps its
query-preserving redirect behavior.

The primary hub is not permission to delete a specialist workflow. The full
Drawings editor, Drawing Viewer, Drawing Submittal Hub, specialist registers,
`/Constraints`, `/ResourceScheduling`, `/ExecutiveView`, individual report
routes, and other detailed workflows remain intentional secondary surfaces.

## 9. Data access and cache invalidation conventions

Use the existing entity clients and typed repositories for domain boundaries.
Project and organization queries must retain their scope and query keys. Mutations
await the authoritative write, report partial failures truthfully, and invalidate
the relevant cache family through `src/services/cacheRegistry.ts` or the active
domain invalidation helper. Do not introduce a universal save wrapper or a
universal workflow engine; live domain commands/repositories plus RLS/RPC are the
supported mutation pattern.

## 10. Testing and CI commands

The local CI-parity sequence is the following documented command block; no
separate package script was added because the existing CI workflow is already
the source of truth and the worktree contains unrelated CI edits:

```bash
npm run lint
npm run typecheck
npm run typecheck:js
npm run typecheck:strict
npm run typecheck:noimplicitany
npm test -- --run
npm run build
```

Vitest uses placeholder Supabase configuration in its setup and does not contact
production. Playwright is opt-in under `e2e/`; the read-only smoke specs and the
mutation-aware fab-release gate require a dedicated non-production fixture.

## 11. Deployment architecture

Vercel Git deployment is disabled for production and staging. The GitHub Actions
workflow installs with Node 20 and `npm ci`, runs the blocking CI sequence, and
only the intended production-branch deploy job can publish the prebuilt Vercel
artifact after CI passes. Staging uses a separate Vercel/Supabase environment.
Playwright post-deploy smoke is opt-in and nonblocking in the current workflow.

The service worker uses network-first navigation and cache-first hashed/static
same-origin assets; it does not cache API or cross-origin responses. Build
fingerprinting is generated at build time rather than treated as permanent
release documentation. CSP is currently Report-Only. Sentry source maps are
hidden and uploaded only when the Sentry token is configured; upload failures
are reported without making the production build fail.

## 12. Migration and Edge Function status

The PR changes six source-controlled feature-flag seed migrations:

| Migration | Change | Status |
| --- | --- | --- |
| `20260703180000_seed_submittal_approved_to_scrub_flag.sql` | Remove personal override data; preserve existing rollout state | Committed; not applied by Batch 40 |
| `20260704000000_seed_submittal_revision_autobump_flag.sql` | Remove personal override data; preserve existing rollout state | Committed; not applied by Batch 40 |
| `20260704000010_seed_submittal_splitting_flag.sql` | Remove personal override data; preserve existing rollout state | Committed; not applied by Batch 40 |
| `20260704020010_seed_submittal_drawing_types_flag.sql` | Remove personal override data; preserve existing rollout state | Committed; not applied by Batch 40 |
| `20260704030000_seed_submittal_workday_dues_flag.sql` | Remove personal override data; preserve existing rollout state | Committed; not applied by Batch 40 |
| `20260712000000_seed_feature_flag_catalog.sql` | Seed the typed production catalog | Committed; not applied by Batch 40 |

The repository contains eight Edge Function directories plus `_shared`:

| Function | Frontend/external caller | Required configuration | Phase 0 status |
| --- | --- | --- | --- |
| `account-delete` | Settings Danger Zone | Supabase URL, service-role key | Existing dependency; staging verification required |
| `email-ingest` | Inbound email/webhook | Webhook secret, Graph/email settings | Existing dependency; staging verification required |
| `email-send` | Email send service | Resend/Graph settings | Existing dependency; staging verification required |
| `health` | Monitoring/healthcheck | Supabase configuration | Existing dependency; staging verification required |
| `llm-proxy` | AI helpers and function dispatcher | Provider keys, kill switch, quota settings | Existing dependency; staging verification required |
| `project-export` | Workspace export | Service-role key | Existing dependency; staging verification required |
| `schedule-assistant` | Schedule assistant | Provider keys and quota settings | Existing dependency; staging verification required |
| `stripe-billing` | Billing service and webhook | Stripe secrets and webhook secret | Existing dependency; staging verification required |

Deployment status and remote RPC/schema alignment were not asserted from local
source. The Supabase CLI is not installed locally, so migration history and
function deployment require staging-owner verification. No production operation
was attempted.

## 13. Known risks

- The current local runner is Node 24 while CI requires Node 20; exact runtime
  parity remains a staging/CI check.
- Large chunks remain, especially `web-ifc-api`, `IfcModelViewer`, and vendor
  spreadsheet/chart/PDF chunks. They are measured and not suppressed.
- Playwright is present but fixture-gated and nonblocking.
- CSP is Report-Only and requires an owner decision before enforcement.
- Legacy flat Storage objects have a documented intra-founding-org,
  cross-project read residual until copy/backfill/verify/cut remediation.
- Branch protection required checks are not verified in this environment.
- Static analysis reports many false positives in dynamic UI and Deno function
  paths; no unsafe removal was performed.

## 14. Release blockers

No P0 blocker was found in local evidence. P1 requirements before production are
staging database/migration verification, required Edge Function configuration and
deployment verification, staging smoke coverage, backup/rollback preparation,
branch-protection/CI enforcement, and owner approval. The legacy Storage
residual must be remediated or explicitly accepted before onboarding external
organizations.

## 15. Deferred work ordered by priority

1. Verify staging schema, feature-flag seed behavior, RPCs, Edge Functions,
   secrets, and test fixtures without touching production.
2. Execute the staging smoke matrix, including authorized and read-only roles,
   fabrication blocked/allowed cases, and billing/Danger Zone safeguards.
3. Decide branch-protection requirements, CSP enforcement, and the legacy
   Storage backfill/cutover.
4. Tighten Playwright assertions and make appropriate smoke checks blocking.
5. Reduce material bundle warnings and static-analysis false positives with
   independent evidence.
6. Continue incremental TypeScript conversion and date-only debt reduction.

## 16. Recommended engineer review order

1. Read this handoff and the release checklist.
2. Read the feature/dead-path inventory and route registry.
3. Review permissions, RLS/RPC boundaries, and fabrication-release tests.
4. Review Submittals, Drawings, DrawingSet, DrawingRevision, RFI, Work Package,
   and Schedule source-of-truth paths.
5. Review migration and Edge Function staging requirements.
6. Run the local CI-parity command and inspect the bundle report.
7. Execute staging smoke and obtain release approval before production.

## 17. Key files by subsystem

| Subsystem | Key files |
| --- | --- |
| Bootstrap/routing | `src/boot/AppProviders.jsx`, `src/boot/AppRoutes.jsx`, `src/config/routes.js` |
| Auth/permissions | `src/contexts/AuthContext.jsx`, `src/services/permissions.ts`, `src/components/shared/useAppSecurity.jsx` |
| Flags/dead paths | `src/config/featureFlags.ts`, `src/hooks/useFeatureFlag.ts`, `docs/FEATURE_FLAG_AND_DEAD_PATH_INVENTORY.md` |
| Domain clients | `src/api/client/entities.ts`, `src/api/client/functions.ts`, `src/services/cacheRegistry.ts` |
| Typed repositories | `src/lib/org/repository.ts`, `src/lib/backcharge/repository.ts`, `src/lib/payapp/repository.ts`, `src/lib/production/repository.ts` |
| Drawing/submittal authority | `src/pages/DrawingSubmittalHub.tsx`, `src/pages/Submittals.tsx`, `src/pages/Drawings.jsx`, `src/api/client/entities.ts` |
| Server boundary | `supabase/migrations/`, `supabase/functions/`, RLS/RPC definitions in the active schema baseline |
| Validation | `.github/workflows/ci.yml`, `vite.config.js`, `vitest.config.*`, `playwright.config.ts`, `e2e/` |

## 18. Exact branch, PR, and head

The Batch 40 audit started at `d4022899a0be19dee3a53f10d4f8ce2880fc76f6` on
`agent/handoff-cleanup`, PR #77, based on `origin/main` at
`11a28fced549840c0a44fc4b6d7182e834cdb363`. The final closure head is the SHA
printed by `git rev-parse HEAD` after the closure commit; it is reported in the
handoff delivery record and final task response.

## 19. Production deployment confirmation

No production deployment, merge, migration application, Edge Function deploy,
or production-data mutation occurred during Batch 40. PR #77 remains open and
Draft.

## Batch 41 remediation record

Batch 41 started from `6a19ba15e4a50386792275840f64a39ca93375e7` and rechecked
the P0/P1 register without changing remote state. No P0 release blocker is
reproducible locally. Existing local auth, project-scope, Submittal, RFI, and
fabrication-release tests passed their focused guards; the selected P1 findings
are external or owner-controlled:

| Finding | Severity | Reproduction and actual result | Expected behavior | Status |
| --- | --- | --- | --- | --- |
| B41-P1-001 legacy flat Storage isolation | P1 | Batch 40 remote evidence identifies 775 legacy flat objects; local source search cannot access remote Storage rows/policies | Cross-project legacy objects are unreadable outside the authorized scope | Requires staging and owner-run copy/backfill/verify/cut |
| B41-P1-002 database/migration alignment | P1 | `supabase --version` and `supabase migration list --local` are unavailable locally | Staging schema, catalog migration, RPCs, and generated types agree | Requires staging; six seed migrations remain unapplied |
| B41-P1-003 Edge Function deployment/configuration | P1 | Source inventory is available; local evidence cannot prove deployed revision or secrets | Required functions, secrets, quotas, and kill switches match staging | Requires staging |
| B41-P1-004 critical smoke coverage | P1 | `e2e/` contains fixture-gated read-only and fab-release specs; no staging credentials are configured | Critical workflows execute against a dedicated non-production fixture | Requires staging |
| B41-P1-005 branch protection | P1 | Read-only `gh api repos/.../branches/main/protection` returned HTTP 403 because the repository plan does not expose the feature | Required CI/review status is enforced before production merge | Blocked by repository plan; owner decision required |
| B41-P1-006 backup/rollback readiness | P1 | No local command can prove remote backup freshness or rollback rehearsal | Restore and rollback procedures are tested before production approval | Requires owner/staging evidence |

No migration, RLS policy, Edge Function, production configuration, or source
workflow was changed. The final Batch 41 commit SHA is reported in the delivery
record after commit; all external findings remain visibly open.
