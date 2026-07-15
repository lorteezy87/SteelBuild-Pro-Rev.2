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
