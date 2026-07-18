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

## Batch 42 staging-candidate preparation

Batch 42 records a staging execution plan without deploying. The preparation
base is `a86c18ffcf00359b7a798b9be5822c18199565c7`; the final documentation
commit SHA must be captured with `git rev-parse HEAD` and used as the immutable
promotion identity. The application version is `2.1.1`, and CI must provide the
exact commit SHA as `VITE_APP_VERSION` for the staging build.

The accepted Batch 41 Storage disposition is narrow: the available evidence
does not show an active leak in the current single-tenant application, so the
finding may proceed as a staging verification item. It is not resolved. Legacy
flat-object policy and reference verification remains a hard gate before
organization #2 and is paired with the legal-review gate.

The staging plan, migration manifest, Edge Function manifest, redacted
environment matrix, smoke matrix, and rollback decisions are in:

- [`docs/PHASE_0_STAGING_PLAN.md`](PHASE_0_STAGING_PLAN.md)
- [`docs/runbooks/staging-setup.md`](runbooks/staging-setup.md)
- [`docs/runbooks/staging-smoke-test.md`](runbooks/staging-smoke-test.md)
- [`docs/runbooks/rollback.md`](runbooks/rollback.md)

Repository gates passed at the preparation base: npm ci in an isolated
directory, lint, all five typecheck gates, 251 Vitest files with 2,968 tests,
production build, bundle report, and npm audit with zero vulnerabilities. The
local runtime was Node `v24.14.0`/npm `11.11.1` on Windows; CI uses Node 20.
Authenticated staging smoke, migration application, Edge Function deployment,
Storage verification, backup/restore, and production approval remain
unchecked external gates. No deployment, merge, migration application,
production data mutation, or remote configuration change occurred.

## Batch 43A staging prerequisite audit

The read-only audit was run from candidate `270b993ef35ec79517c635114321f4bdc8420760`
on `agent/handoff-cleanup`. PR #77 remains open and Draft. The approved Vercel
project and Supabase ref were verified exactly; no production project, alias,
credential, database, function, or data mutation was used.

The candidate frontend is present in a READY deployment in the isolated staging
Vercel project and its staging URL returns HTTP 200. This is evidence of an
existing staging frontend deployment, not a new deployment initiated by Batch
43A. The deployed entry asset did not independently prove the embedded
`VITE_SUPABASE_URL`, so Vercel environment verification remains open.

Supabase staging is healthy and currently ends at migration
`20260703191034_hard_erasure_rpcs`. The six approved Phase 0 feature-flag
migrations are pending. The `feature_flags` schema exists, but its catalog is
empty in staging. Pre-migration postconditions must verify all nine typed
catalog keys, descriptions, safe defaults, and preservation of any existing
`enabled` or `user_overrides` values.

The source-level Edge Function manifest is complete, but staging currently
reports only `account-delete` active. The source-level function dependencies
include the `hard_delete_organization` RPC for account deletion and table/RLS
access for the health, export, scheduling, email, AI, and billing paths. Required
secret names are known from source, but secret presence and values were not
verified. No function was invoked or deployed.

Staging Storage contains private `app-files` and `email-attachments` buckets
with authenticated object policies. Source uploads use organization-scoped
paths. Policy predicates, cross-tenant denial, signed URLs, and file behavior
remain staging tests, not verified claims.

The backup gate failed closed: the repository runbooks describe daily backups,
PITR, and restore procedures, but no current staging backup identifier or
verified restorable dump/restore point was available. No migration, function
deployment, test fixture, upload, or destructive operation is permitted until
that owner-controlled evidence is recorded.

### Branch protection recommendation

The production branch should require a PR, one approval, the blocking
`Lint + Typecheck + Test + Build` check, stale-approval dismissal, resolved
conversations, force-push prevention, deletion prevention, and administrator
inclusion. The advisory dependency audit should not be represented as a blocking
check until its policy is explicitly changed. The prior read-only GitHub API
check returned HTTP 403 because the repository plan does not expose branch
protection; no setting was changed.

**Disposition:** OWNER ACTION REQUIRED / BLOCKED. Rerun Batch 43 only after
backup identity/restorability, Vercel staging environment, Edge Function secret
names, fixture isolation, and smoke prerequisites are independently evidenced.

## Batch 43B verified staging evidence

A follow-up read-only audit verified that the public staging bundle is not a
usable candidate build: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
both inlined as empty strings, and the application validator rejects missing
configuration. The staging Supabase project identity remains correct, but the
frontend cannot be treated as connected to it until Vercel environment values
are set and a separately approved redeploy is completed.

The Supabase organization is Pro, so daily physical backups are available by
tier. The exact current backup/restore-point receipt and PITR status remain
owner-controlled evidence and were not available through the MCP. Staging
`billing_config` is empty, so Stripe test mode is also unverified. The public
bundle uses the built-in fallback Sentry DSN rather than a staging-specific DSN;
this is an observability-isolation follow-up, not a secret exposure.

No production endpoint, credential, webhook, project, migration, Edge Function,
fixture, upload, or redeploy was used. Static production host strings in shared
metadata/default-origin code are not treated as runtime environment proof.

**Disposition:** BLOCKED pending owner correction of Vercel staging browser
configuration, backup evidence, Sentry isolation, and Stripe test-mode setup.

## Batch 43B owner-provided backup evidence update

Owner-provided evidence verifies the separate SteelBuild-Pro Staging project:

- Supabase project: `SteelBuild-Pro Staging`
- Supabase ref: `abbeavtbifuddtrifvae`
- Evidence path: `/project/abbeavtbifuddtrifvae/database/backups/scheduled`
- Database backup identifier: physical backup dated `15 Jul 2026 05:54:28 UTC`
- Target: Supabase staging ref `abbeavtbifuddtrifvae`
- Restore control: available in the Supabase dashboard; no restore was initiated or destructively tested
- Earlier visible physical backups: 14 Jul, 13 Jul, and 12 Jul 2026
- Migration precedence: the verified backup predates the proposed six migrations
- Retention: the supplied evidence does not establish an exact retention period
- Database restore readiness: dashboard-supported, not restore-tested
- Storage rollback readiness: not established; Supabase database backups do not include Storage API objects, so restored database metadata would not restore deleted Storage objects
- The `main / PRODUCTION` badge is the primary-branch designation inside this separate staging project and does not change the staging ref

Vercel staging environment identity and required secret-name presence remain outstanding. Do not apply migrations or deploy Edge Functions until those checks are verified.

## Batch 43B owner-confirmed Vercel staging environment update

Owner confirmation verifies that the isolated Vercel project `steelbuild-pro-staging` (`prj_W0dhGzRfU3uQPkqxZLhnzwXTMQO8`) has the following browser configuration saved for both Production and Preview targets:

- `VITE_SUPABASE_URL` is configured for Supabase staging ref `abbeavtbifuddtrifvae`
- `VITE_SUPABASE_ANON_KEY` is configured with the publishable/anon key for staging ref `abbeavtbifuddtrifvae`

The key value was not exposed or committed. The existing deployment remains invalid for runtime verification because it was built before this correction and contains placeholder configuration.

The exact approved candidate remains `270b993ef35ec79517c635114321f4bdc8420760`. No redeployment was performed because the available Vercel connector cannot safely pin a new deployment to that exact commit, and no authenticated Vercel CLI or token is available locally. The current branch head must not be deployed as a substitute.

Edge Function custom secret-name presence remains unverified through available provider tools. Only `account-delete` is deployed in staging and it uses platform-injected Supabase defaults. No Edge Functions were deployed.

## Batch 43B candidate redeployment verification update

Owner-provided Vercel evidence and deployment metadata verify:

- Project: `steelbuild-pro-staging`
- Project ID: `prj_W0dhGzRfU3uQPkqxZLhnzwXTMQO8`
- Deployment: `dpl_2NanBCWNq9bUJBGKTgZmGR97hyQn`
- Candidate: `270b993ef35ec79517c635114321f4bdc8420760`
- Source branch: `agent/handoff-cleanup`
- Environment: Preview
- State: Ready
- Custom-domain assignment: skipped
- Production domain: not assigned

The deployment was rebuilt after the owner corrected `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the isolated staging Vercel project. The prior staging deployment remains configuration-invalid because it was built with placeholder Supabase values.

Build-log warning classification:

- Floating Node engine range (`>=20`) may auto-select a future major Node version; this is a configuration-hardening follow-up, not a deployment failure.
- `whatwg-encoding@3.1.1` is deprecated; this is a dependency follow-up and did not fail the build.
- Vite reports chunks over the 500 kB threshold, including `vendor-xlsx`, `IfcModelViewer`, and `web-ifc-api`; these are performance warnings, not runtime health evidence.
- The available Vercel build-log API exposes these warning categories but does not expose four discrete warning records; a fourth warning cannot be classified without the deployment dashboard record.

Deployment-check classification:

- Skipped custom-domain assignment is expected for an isolated Preview deployment.
- No production-domain assignment is expected and confirms no production-domain promotion was performed.

Runtime status remains incomplete. Direct unauthenticated requests to the protected preview returned Vercel fallback/login content rather than the application, so bundle target, placeholder absence, runtime request, manifest, service-worker, WASM, and lazy-route checks are not marked passed. A browser session with access to the protected preview is required.

The physical staging database backup identifier remains `15 Jul 2026 05:54:28 UTC`. Do not promote the preview, apply migrations, or deploy Edge Functions until browser runtime checks and required staging secret-name/function readiness checks are complete.

## Batch 43B Edge Function secret evidence update

Owner evidence confirms that staging has no custom Edge Function secrets. The exact per-function deployment order, minimum custom secret set, optional-secret behavior, smoke requests, rollback anchors, and missing-secret matrix are maintained in [PHASE_0_EDGE_FUNCTION_SECRET_MATRIX.md](PHASE_0_EDGE_FUNCTION_SECRET_MATRIX.md). Only `account-delete` is currently deployed; it must not be invoked. The Supabase dashboard technical-issue and outstanding-invoice notices remain external environment conditions. Batch 43B remains owner-blocked.

## Batch 43E current source and staging handoff

Source candidate `f453abbd` corrects the Edge Function origin boundary. When `ALLOWED_ORIGINS` is configured, the shared parser uses exact normalized origins only; it does not add production, localhost, arbitrary Vercel previews, or a production fallback for rejected origins. The owner-confirmed staging serialization is `https://steelbuild-pro-staging.vercel.app,https://steelbuild-pro-staging-h7gds390x-lorteezy87s-projects.vercel.app`. Active response helpers now receive `Request` so approved browser responses carry the approved origin. Health uses the shared parser with `GET, HEAD, OPTIONS`; schedule-assistant and llm-proxy no longer maintain duplicate CORS parsers.

The current read-only staging inventory reports 30 migration records and all 13 candidate migrations present. This supersedes earlier Batch 43B planning text that described six migrations as pending. No migration or schema change was performed in Batch 43E. The current staging function inventory reports health, project-export, and schedule-assistant active; account-delete is active at version 2 and remains frozen; disabled integrations remain outside the approved scope.

The account-delete v2 finding is **P1 / requires staging-provider evidence**: the current reported hash matches the previously recorded hash, but v1/v2 deployment actor, timestamps, and rollback revision are unavailable through the read-only evidence. No executable drift is proven, and the function was not invoked, redeployed, or modified. Project-export has reported deployed-source comment drift from the approved candidate; the next deploy must be from the exact clean source candidate and has not occurred.

The protected Vercel preview still blocks unauthenticated runtime inspection. Authenticated project-export smoke is blocked until a dedicated staging fixture and JWT exist. Schedule-assistant cannot receive a functional smoke claim without an LLM provider or a proven nonpersistent path. Existing Vercel Node/deprecation/chunk warnings remain documented follow-ups.

Batch 43E local evidence: focused CORS tests 1/1 file and 5/5 tests; lint and all five type gates passed; full Vitest passed with 252 files and 2,973 tests; production build passed with 4,282 transformed modules. The next action is a separately approved staging-only redeploy from `f453abbd`; no production deployment, merge, migration application, function deployment, or PR readiness change occurred.
## Batch 44A security and staging addendum

Batch 44A applied a narrowly scoped ACL remediation to the isolated staging database. The migration `20260715235514_restrict_security_definer_execution` removes anonymous execution from internal maintenance and trigger-only SECURITY DEFINER functions, preserves only the reviewed authenticated browser/RLS RPC grants, and restricts the LLM usage-window RPC to `service_role`. It does not alter function bodies, schema objects, RLS policies, data, or the frozen account-delete functions.

The exact source candidate `f453abbdc5d60a1f2013aa609fc4e0b75e8155de` was deployed only to Vercel staging project `prj_W0dhGzRfU3uQPkqxZLhnzwXTMQO8` as Preview deployment `dpl_F1RRvqYyb2RXKzV3fgqA8W4zuFwB`. The protected deployment was read through the authenticated Vercel CLI. Runtime assets target Supabase staging ref `abbeavtbifuddtrifvae`; placeholder and production refs were absent. No production domain, Supabase project, migration, function deployment, or merge was used.

Current staging evidence is partial. Anonymous health and unauthenticated export behavior pass. The deployed manifest, service worker, selected lazy routes, and WASM asset pass. Tenant isolation, Storage isolation, authenticated export, fabrication-release behavior, protected-browser console errors, and schedule-assistant functional behavior require owner-provisioned staging fixtures and an authenticated protected-browser session. Schedule-assistant was not invoked without an LLM provider secret. Account deletion remains frozen.

The Supabase security advisor still reports intentional authenticated SECURITY DEFINER RPC exposure and informational RLS-without-policy notices for billing tables. These are not silently treated as zero warnings. Scheduled-job ownership remains an external verification item because the available read-only SQL role could not inspect `cron.job`.
