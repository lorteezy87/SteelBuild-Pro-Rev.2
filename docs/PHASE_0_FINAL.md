# SteelBuild Pro Phase 0 Final Engineering and Release Record

Status: released through the gated production workflow
Canonical source: this file
Repository: `lorteezy87/SteelBuild-Pro-Rev.2`
Production branch: `main`
Phase 0 merge: `b0ea1376767ba51fcc003d70efec08d8fe9fef47`
PR: [#77](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/77)

This document replaces the duplicated Phase 0 baseline, handoff, release
checklist, staging plan, edge-function matrix, feature/dead-path inventory,
and subsystem authority notes. Product architecture documents and operational
runbooks remain separate because they are referenced outside the Phase 0
release record.

## 1. Final release status

- PR #77 was merged into `main` with merge commit
  `b0ea1376767ba51fcc003d70efec08d8fe9fef47`.
- The merge triggered the repository's gated production workflow. No direct
  `vercel --prod` command was run from a local checkout.
- Production Vercel deployment `dpl_BYz2UkH3AYdBjwJdJE4xKw2bzKtK` is `READY`,
  targets production, and records the exact merge SHA.
- The deployment owns the configured production aliases, including
  `https://steelbuild-pro.com` and `https://www.steelbuild-pro.com`.
- PR #78 remains merged. No PR was force-merged or rewritten during release.
- Disabled Edge Functions were not deployed or invoked. `account-delete`
  remains frozen.
- No credentials, tokens, private keys, passwords, or environment-variable
  values are committed in this release record.

## 2. Release evidence

### Recovery and rollback anchors

- Production database backup: latest physical backup shown in the Supabase
  dashboard at `17 Jul 2026 06:58:43 UTC`.
- Supabase explicitly states that database backups do not include Storage API
  objects. Database restore readiness must not be treated as Storage restore
  readiness.
- Previous production Vercel rollback anchor:
  `dpl_9W5vrETxtJYnFzbpyKqLzuhNciMX`, `READY`, production target.
- Current production deployment:
  `dpl_BYz2UkH3AYdBjwJdJE4xKw2bzKtK`.
- Vercel rollback is preferred for application rollback. Database changes use
  an approved forward-fix or reviewed restoration procedure; no automatic
  database rollback is implied.

### Production database changes

The following reviewed migrations were applied to production in order:

1. `20260715235514_restrict_security_definer_execution`
2. `20260716081258_drop_invalid_user_projects_updated_at_trigger`

The management API initially recorded execution under provider-generated
timestamps. The schema changes were verified first, then migration history was
repaired without changing schema objects so the canonical repository versions
are recorded. Final history contains exactly the repository versions above.

Post-migration assertions passed:

- Internal and trigger-only SECURITY DEFINER functions are not executable by
  `anon` or `authenticated`.
- `get_llm_usage_window(uuid,timestamptz)` is not executable by browser roles
  and is executable by `service_role`.
- Retained authenticated RPCs remain executable by `authenticated` only.
- `trg_user_projects_updated_at` is absent from `user_projects`.
- No hard-delete or account-delete function was changed.

### Production runtime checks

- `https://www.steelbuild-pro.com/` returned HTTP 200 and served the expected
  application shell.
- `https://www.steelbuild-pro.com/health.json` returned HTTP 200.
- The production Supabase health function returned HTTP 200 with database
  status `ok`.
- The deployment metadata matched the exact merge commit.
- The Content-Security-Policy header remains report-only. The existing theme
  bootstrap inline script is the known source of the report-only observation.
  No `unsafe-inline` exception was added.
- No production mutation E2E test was run. Production verification was
  read-only shell, health, deployment, migration, and permission verification.

## 3. Validation results

The exact rewritten candidate and the exact production merge were validated
through both the local clean worktree and GitHub Actions.

- `npm ci`: passed in the CI environment.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run typecheck:js`: passed.
- `npm run typecheck:strict`: passed with only documented grandfathered
  diagnostics ignored and zero enforced errors.
- `npm run typecheck:noimplicitany`: passed with only documented grandfathered
  diagnostics ignored and zero enforced errors.
- Full Vitest suite: 252 test files, 2,957 tests passed.
- Production build: passed, 4,282 modules transformed.
- Production dependency audit: passed at the configured high-severity gate.
- GitHub CI run: `29632189944`, including the gated production deploy.

The build retains existing large-chunk warnings, including the on-demand
`web-ifc` and document/PDF/chart vendor chunks. These warnings were not
silenced or treated as release blockers.

## 4. Phase 0 engineering changes

### Canonical presentation and retired paths

Phase 0 consolidated duplicate command/classic page shells while preserving
specialist workflows and compatibility routes. The canonicalized surfaces
include Budget Control, Reports, Resources, Portfolio, Risk, Billing, Settings,
Vendors, Pay Applications, Production Status, Organization Members, Field Hub,
Backcharge Defense, Expenses, Deliveries, Documents, Change Orders,
Work Packages, RFIs, Submittals, Drawings, and Detailing Control Center.

Retired implementations include Agent Memory, standalone Project Detail,
Financials, Cost Dashboard, AI Insights, Margin Risk, Resource Management,
unsupported Job Status PDF execution, the dormant workflow engine, the generic
save hook, and the unused deliveries CRUD hook. Compatibility redirects remain
where required for legacy links, including Project Detail, Financials,
CostDashboard, AIInsights, MarginRisk, and ResourceManagement.

The full Drawings editor, Drawing Viewer, specialist registers, Constraints,
Crew Scheduling, Executive View, and other focused workflows remain intentional
secondary workflows. The Detailing Control Center is a read model and
quick-action surface, not a competing workflow engine.

### Feature flags

- Supabase `feature_flags` is the only runtime authority.
- `src/config/featureFlags.ts` is the typed production key catalog and the SQL
  catalog migration seeds the same production keys.
- Browser localStorage, browser fallback state, and `?ff_*` query overrides are
  prohibited.
- `command_ui` is retired as a runtime presentation switch. Canonical pages do
  not branch between command and classic shells using that flag.
- Global enablement and per-user overrides are administrator-managed environment
  state. Personal email addresses and personal overrides are not committed.
- Remaining operational flags are limited to supported workflows and remain
  server-backed.

### Authorization and mutation authority

- `usePermissions()` is the sole client-side UI authorization resolver.
- It combines the global role from `user_profiles` with the active-project role
  from `get_my_project_role`.
- `useAppSecurity()` provides identity and write-shaping helpers only.
- UI checks are display behavior, not mutation authorization.
- RLS and domain RPCs are authoritative for actual access and writes.
- Domain transitions live with active commands or database RPCs; there is no
  universal workflow engine or universal save wrapper.
- Critical multi-write actions await required writes, report partial failure,
  preserve retryable items, and invalidate registered cache families after
  settlement.

### Domain ownership

- Submittals own formal approval workflow and review rounds.
- DrawingSet owns package identity and package metadata.
- Drawings own sheet-level document metadata.
- DrawingRevision owns revision history and current revision.
- RFIs own blocker status.
- Work Packages and Schedule own operational dates.
- Fabrication-release gates remain fail-closed and use the canonical blocker
  authority with authorized overrides and audit records.
- RLS/RPC and live domain repositories remain the final mutation boundary.

## 5. Route and specialist-workflow model

- Registered routes carry lifecycle metadata: `active` or `internal`.
- Static compatibility metadata identifies legacy redirects and their targets.
- CI route tests validate labels, lifecycle values, advertised paths, and
  redirect targets.
- Internal operational or privileged pages require explicit lifecycle metadata.
- Retired implementations are deleted and must not be registered as active
  pages.
- Legacy URLs redirect to the selected canonical surfaces without deleting
  compatibility behavior that preserves query parameters.

## 6. Staging and Edge Function record

Staging remains isolated from production:

- Supabase staging ref: `abbeavtbifuddtrifvae`.
- Vercel staging project: `steelbuild-pro-staging`.
- Staging Vercel project ID: `prj_W0dhGzRfU3uQPkqxZLhnzwXTMQO8`.
- The staging database backup used during rehearsal was a physical backup dated
  `15 Jul 2026 05:54:28 UTC`; Storage objects were not covered.
- Staging deployment candidates were limited to `health`, `project-export`,
  and `schedule-assistant`.
- `email-ingest`, `email-send`, `llm-proxy`, and `stripe-billing` remained
  undeployed and disabled.
- `account-delete` remained deployed only as the existing frozen function and
  was not invoked, redeployed, or modified.
- No production Edge Function deployment was part of the final release.

## 7. History and repository hygiene

The authorized credential-remediation rewrite was completed before release.
Only the explicitly authorized branch refs were rewritten; tags and unlisted
refs were not changed. The recovery mirror remains private and local until the
owner completes the documented cleanup decision.

The rewritten `agent/handoff-cleanup` candidate was:

`597c2771c0e38d88fae301076b5e8b3187f1b5bc`

The non-credential PR content remained byte-identical apart from authorized
historical credential scrubbing. Reachable-history scanning found no revoked
credential values or unexpected JWT-shaped values outside the known test
fixture path.

Unrelated modified and untracked files in local worktrees were preserved and
were not included in the Phase 0 release commit.

## 8. Remaining engineering debt

The following are not claims of completion and remain tracked follow-up work:

- Storage objects are not covered by Supabase database backups; establish and
  rehearse an offsite Storage backup before treating Storage recovery as ready.
- Do not run destructive production E2E tests. Use dedicated staging fixtures
  for authenticated tenant, Storage, and critical mutation smoke coverage.
- Keep `account-delete` frozen until provider deployment-history and rollback
  evidence is complete.
- Continue reducing large lazy-route/vendor chunks only with measured budgets.
- Keep CSP report-only remediation separate from this release; solve the
  application-owned inline bootstrap with a nonce or hash before enforcement.
- Update this canonical record after any release, migration, or rollback event.

## 9. Operational references retained

These are intentionally not duplicated into this release record:

- `docs/runbooks/backup-dr.md`
- `docs/runbooks/rollback.md`
- `docs/runbooks/staging-setup.md`
- `docs/runbooks/staging-smoke-test.md`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/owner-checklist.md`
- `ARCHITECTURE.md`
- `README.md`

Those documents describe repeatable operational procedures or product
architecture and remain valid references for future work.
