# Phase 0 Release-Candidate Checklist

Repository: `lorteezy87/SteelBuild-Pro-Rev.2`
Branch: `agent/handoff-cleanup`
PR: #77, open and Draft
Batch 40: engineering closure and release-candidate gate

Checked items reflect local evidence only. External, staging, and production
steps remain unchecked until an authorized owner completes them.

## Repository gates

- [x] Branch and starting HEAD reconciled; no history rewrite or force-push.
- [x] Unrelated tracked and untracked worktree changes preserved.
- [x] PR-wide diff classified; no committed secrets, credentials, local state,
  build output, reports, coverage, archives, or large binary additions found.
- [x] Lockfile was used for isolated `npm ci`; no dependency metadata changed.
- [x] `npm audit --omit=dev` reports 0 vulnerabilities.
- [x] No committed `.only`; two fixture-gated Playwright skips are intentional.
- [x] Date-only helper tests pass under UTC and America/Phoenix.
- [x] Feature-flag, route, function-dispatch, and email dead-path guards pass.
- [x] Production build and bundle report complete with existing large-chunk
  warnings recorded.

## CI gates

- [ ] Latest PR #77 CI check is green for lint, all type gates, Vitest, and build.
- [ ] PR #77 has the required review and branch-protection status enforcement.
- [ ] CI runs with the supported Node 20 runtime and committed lockfile.
- [ ] `agent/handoff-cleanup` remains covered through the pull-request trigger;
  direct push-trigger coverage is not assumed.

## Staging configuration

- [ ] Staging Vercel project and staging Supabase project are confirmed separate
  from production.
- [ ] Required browser-public environment values pass validation in staging.
- [ ] No secret is placed in a `VITE_*` variable.
- [ ] Sentry, CSP, service worker, manifest, build fingerprint, and source-map
  behavior are verified in staging.
- [ ] Vercel Git auto-deployment remains disabled where the gated workflow
  requires it.

## Staging database verification

- [ ] Feature-flag catalog migration is reviewed and applied to staging only.
- [ ] Existing global enablement and per-user overrides are preserved.
- [ ] Generated Supabase types and RPC contracts are checked against staging.
- [ ] RLS tenant boundaries and permission floors are verified with owner/admin/
  PM/field/viewer accounts.
- [ ] Fabrication release blocked and allowed paths are verified server-side.
- [ ] No claim is made that staging or production migrations were applied by
  Batch 40.

## Staging smoke tests

- [ ] Authentication and recovery/session handoff.
- [ ] Project selection and project-scoped deep links.
- [ ] Dashboard and canonical control-center navigation.
- [ ] Drawings upload, package visibility, sheet metadata, and viewer access.
- [ ] Submittal creation, review round, audited transition, and release gate.
- [ ] RFI creation and blocker behavior.
- [ ] Fabrication release blocked by an open RFI.
- [ ] Fabrication release allowed for a clean package or approved override.
- [ ] Schedule and Work Packages.
- [ ] Deliveries and Change Orders.
- [ ] Expenses, Budget Control, Pay Applications, and Billing.
- [ ] Field workflow and Field Hub.
- [ ] Organization/team permissions, invitations, seat limits, and Danger Zone.
- [ ] Read-only user restrictions and self-removal/last-owner protections.

## Security and permission checks

- [x] Source/configuration review found no browser service-role key or credible
  committed secret.
- [x] UI authorization authority is documented as `usePermissions()`; RLS/RPC is
  documented as the actual authorization boundary.
- [x] No penetration-test claim is made.
- [ ] Staging cross-tenant, signed-URL, storage, and destructive-action checks
  are completed with test accounts.
- [ ] Legacy flat Storage object remediation is completed or explicitly accepted
  before external organizations are onboarded.

## Backup and rollback preparation

- [ ] Staging backup/restore rehearsal completed.
- [ ] Production backup freshness and restore owner confirmed.
- [ ] Migration rollback or forward-fix plan reviewed.
- [ ] Vercel previous deployment and Edge Function rollback procedures tested.
- [ ] Destructive workflows have an owner-approved rollback/data-recovery plan.

## Production approval

- [ ] All P0/P1 issues are closed or explicitly accepted by the owner.
- [ ] Staging smoke evidence is attached to the PR or release record.
- [ ] Migration and Edge Function changes have explicit production approval.
- [ ] Production branch merge/push is approved.
- [ ] PR is intentionally marked ready only after approval; it is Draft during
  this handoff.

## Production deployment

- [ ] Approved merge/push to the intended production branch completed.
- [ ] Blocking CI passed for the exact production commit.
- [ ] Gated Vercel prebuilt deployment completed.
- [ ] Required production migrations applied by an authorized owner.
- [ ] Required Edge Functions deployed by an authorized owner.

## Post-deploy checks

- [ ] Health endpoint reports database connectivity.
- [ ] Authentication, project selection, and read-only navigation work.
- [ ] Critical writes report server-confirmed success and invalidate caches.
- [ ] Fabrication release blocked/allowed checks remain correct.
- [ ] Sentry and deployment logs show no new critical errors.
- [ ] Playwright smoke result reviewed; mutation-aware tests ran only against a
  dedicated test organization.

## Rollback triggers

- Any failed blocking CI gate or unreproducible production build.
- Authentication, tenant isolation, RLS/RPC, or permission-floor regression.
- False success, data loss, or status corruption in Submittals, Drawings, RFIs,
  fabrication release, cost, billing, schedule, or field workflows.
- A credible exposed secret or cross-tenant storage/query path.
- Missing required migration/function deployment or failed health check.
- Material bundle/runtime failure that prevents a supported primary workflow.

## Issue totals at Batch 40 closure

- P0 Release blocker: 0 confirmed locally.
- P1 Required before production: staging database/Edge Function/smoke/approval,
  branch-protection, and conditional legacy-Storage work remain open.
- P2 Recommended stabilization: Playwright gating, bundle, CSP, date/type/
  dependency hygiene remain open.
- P3 Post-release improvement: historical documentation and static-analysis
  false-positive cleanup remain open.

## Batch 41 finding register

- [ ] **B41-P1-001 - legacy flat Storage isolation:** staging-only copy,
  reference backfill, verification, and policy cutover; no browser or
  production action permitted in Batch 41.
- [ ] **B41-P1-002 - staging database/migration alignment:** apply and verify
  the six committed feature-flag seed migrations in staging only, then compare
  RPCs and generated types.
- [ ] **B41-P1-003 - Edge Function deployment/configuration:** verify the eight
  relied-upon functions, environment variables, quotas, and kill switches in
  staging.
- [ ] **B41-P1-004 - critical smoke coverage:** provision a dedicated staging
  test organization and run authentication, project selection, Drawings,
  Submittals, RFIs, fabrication blocked/clean/override, and role restrictions.
- [ ] **B41-P1-005 - branch protection:** owner must resolve the repository-plan
  limitation or explicitly accept the missing required-check enforcement.
- [ ] **B41-P1-006 - backup/rollback readiness:** owner must verify backups,
  restore rehearsal, Vercel rollback, and Edge Function rollback procedures.

Batch 41 found no reproducible local P0 defect and made no source or remote
configuration change. Documentation does not mark any of these findings
resolved; statuses are `requires staging` or `blocked` as recorded in the
engineering handoff.

## Batch 42 staging-candidate checklist

### Repository-controlled gates

- [x] Branch is `agent/handoff-cleanup`; PR #77 remains open and Draft.
- [x] Exact source SHA, application version, CI build timestamp rule, and
  expected staging projects are defined in `docs/PHASE_0_STAGING_PLAN.md`.
- [x] `npm ci`, lint, TypeScript, JavaScript, strict, noImplicitAny, full
  Vitest, production build, bundle report, and production dependency audit have
  passed at the preparation base.
- [x] No credentials or secret values are included in the staging documents.
- [x] `command_ui` is documented as retired and is not a staging presentation
  switch.
- [x] Legacy flat Storage isolation is accepted for the current single-tenant
  candidate only; it remains a hard gate before organization #2 and legal
  review.

### Staging configuration and database

- [ ] Separate Vercel staging project and Git auto-deploy-off setting verified.
- [ ] Separate Supabase staging project, database, Auth users, Storage, RLS,
  and project-scoped test fixtures verified.
- [ ] Staging environment matrix populated through secret stores without
  printing values.
- [ ] Six PR #77 feature-flag migrations verified against staging migration
  history and applied in version order.
- [ ] Feature-flag before/after values confirm enabled and user overrides were
  not cleared.
- [ ] Generated types, RPCs, RLS, and schema cache verified against staging.
- [ ] Legacy Storage objects, references, and policy behavior verified for the
  current single-tenant candidate.

### Edge Functions and flags

- [ ] Eight Edge Functions plus `_shared` deployed or confirmed at the
  candidate-compatible revisions in staging.
- [ ] JWT mode, CORS, secrets, quotas, kill switches, and RPC dependencies
  verified per the Edge Function manifest.
- [ ] Retained operational flags remain disabled unless their dedicated smoke
  case is approved; `account_deletion` remains disabled.

### Smoke, backup, and rollback

- [ ] Dedicated staging users and isolated fixtures provisioned.
- [ ] `docs/runbooks/staging-smoke-test.md` executed with evidence for ST-01
  through ST-25, including blocked/clean/authorized fabrication release.
- [ ] Accessibility smoke completed for login, navigation, critical forms,
  tables, dialogs, and focus restoration.
- [ ] Staging backup and restore rehearsal completed with measured RTO/RPO.
- [ ] Frontend, Edge Function, database forward-fix, flag, service-worker,
  and staged-data rollback decisions recorded.

### Production approval

- [ ] Product, security, operations, and legal owners approve the staging
  evidence.
- [ ] Organization #2 milestone remains blocked until the accepted Storage
  hardening and legal-review gates are closed.
- [ ] No production deployment, migration application, or production mutation
  is implied by this checklist.

## Batch 43A prerequisite status

- [x] Approved candidate and isolated Vercel/Supabase staging identities were
  verified read-only.
- [x] Staging migration history was compared; it ends at
  `20260703191034_hard_erasure_rpcs`.
- [ ] Current staging backup identifier, timestamp/restore point, checksum or
  verified custom-format dump, retention, and restore-read evidence recorded.
- [ ] Six approved feature-flag migrations applied and postconditions verified.
- [ ] All eight Edge Functions deployed/configured and secret names verified.
- [ ] Staging Vercel environment values independently verified to point at the
  staging Supabase ref.
- [ ] Dedicated Organization A/B identities and non-production workflow
  fixtures provisioned.
- [ ] Storage cross-tenant denial and signed-URL behavior tested.
- [ ] Staging smoke matrix executed.

### Recommended production branch protection (not applied)

- Require a pull request before merge with at least one approving review.
- Require the blocking `Lint + Typecheck + Test + Build` check to pass.
- Keep `Dependency audit (advisory)` informational until its severity and
  remediation policy are explicitly approved.
- Dismiss stale approvals, require conversation resolution, block force pushes,
  and block branch deletion.
- Include administrators in the protection rule; any emergency bypass must be a
  temporary, owner-approved, auditable change.

Batch 43A remains blocked by backup evidence, staging environment/secret
verification, Edge Function parity, fixture provisioning, and smoke execution.
No repository settings were changed.

## Batch 43B verified staging evidence

- [x] Supabase staging identity and Pro plan verified read-only.
- [ ] Owner-provided backup identifier, restore point, creation time, retention,
  and restore evidence recorded.
- [x] Vercel staging project identity and candidate deployment identity verified.
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` verified in the deployed
  build; current public bundle contains empty values.
- [ ] Staging-specific Sentry configuration verified; current bundle uses the
  built-in fallback DSN.
- [ ] Stripe test mode verified; staging `billing_config` is empty.
- [ ] Migrations, Edge Functions, fixtures, uploads, and smoke tests remain
  blocked and were not run.

Batch 43B is blocked until the owner corrects the staging Vercel environment,
provides recovery evidence, isolates staging observability, and verifies
Stripe test mode. No redeploy or remote configuration change was made.

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

## Batch 43E source correction gate

- [x] Shared CORS source correction committed at `f453abbd`; configured `ALLOWED_ORIGINS` is an exact allowlist and response paths receive the request origin.
- [x] CORS regression suite passed: 1 file, 5 tests.
- [x] Local blocking gates passed: lint, TypeScript, JavaScript/JSX, strict, noImplicitAny, full Vitest (252 files, 2,973 tests), and production build (4,282 transformed modules).
- [x] Read-only staging probes and migration/function inventory were reviewed without invoking `account-delete` or changing staging state.
- [ ] Rebuild/deploy `_shared`, `health`, `project-export`, and `schedule-assistant` from the exact source candidate after explicit staging approval.
- [ ] Verify protected preview runtime bundle, manifest, service worker, WASM, lazy routes, and console errors with an authorized browser session.
- [ ] Create a dedicated staging fixture and authenticated JWT for project-export smoke; do not use production data.
- [ ] Classify schedule-assistant functional smoke after confirming whether a nonpersistent path exists; no LLM secret is configured in this pass.
- [ ] Obtain provider deployment-history evidence for frozen `account-delete` version 2 before any future action.

Current disposition: **OWNER/STAGING ACTION REQUIRED**. Production remains untouched and PR #77 remains Draft.
## Batch 44A staging remediation gate

- [x] Exact detached source candidate used: `f453abbdc5d60a1f2013aa609fc4e0b75e8155de`.
- [x] Vercel link verified against the isolated staging project and organization IDs.
- [x] Preview deployment is READY with no production-domain assignment.
- [x] Staging Supabase ref verified as `abbeavtbifuddtrifvae`.
- [x] ACL-only Security DEFINER migration applied to staging as `20260715235514_restrict_security_definer_execution`.
- [x] No anonymous execution remains for internal or trigger-only Security DEFINER functions.
- [x] Health GET returned `200`; unauthenticated project export returned `401`.
- [x] Placeholder and production Supabase references are absent from inspected protected bundles.
- [x] Manifest, service worker, lazy-route probes, and `/wasm/web-ifc.wasm` passed read-only checks.
- [ ] Dedicated authenticated staging fixture exists for tenant and Storage isolation tests.
- [ ] Authenticated project-export and schedule workflow smoke is complete.
- [ ] Protected-browser console and route smoke is complete.
- [ ] Scheduled maintenance-job ownership is verified; the available SQL role could not inspect `cron.job`.

The release gate remains blocked until the unchecked staging evidence exists. No production action is authorized by this record.
