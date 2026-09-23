# Reviewed backend releases

The manual `Deploy reviewed Supabase function` workflow deploys one of
`llm-proxy`, `project-export`, or `stripe-billing`. It cannot deploy every
function, modify the shared database, copy production secrets to staging, or
publish another application's `sheets-api`. All other functions still require
their own source/contract review before joining this release path.

The CI job named `Release Edge Function typecheck` checks **every** repository
`supabase/functions/*/index.ts` entrypoint, including maintenance and staging
functions. This broader build check does not expand the deployment allowlist.

## One-time owner setup

Create GitHub environments `staging-backend` and `production-backend`. Restrict
production to `main`, add the appropriate deployment reviewer, and store a
deployment credential as `SUPABASE_BACKEND_ACCESS_TOKEN` in each environment.
Use the narrowest available credential scope. These secrets are intentionally
distinct from the existing repository-wide inventory token. No credential has
been fabricated or copied by this PR, and the workflow stops if one is missing.

This is not yet a complete fix for CI-2: the existing repository-wide Supabase
and Cloudflare credentials remain accessible to branch workflows until the
owner migrates/rotates them and supplies separate preview credentials. Merely
adding an `environment:` line would not remove that access. The CI jobs now
name their environments; the owner steps are in `owner-checklist.md` §7.

## Release sequence

1. Obtain approval for the named functions and exact database changes. Review
   current deployed source before replacing it: this project is shared with
   another application. Download and preserve the prior source and JWT modes.
2. Verify the candidate with the normal CI job, secret scan, Edge typecheck and
   the transactional SQL boundary tests on staging. For production, the normal
   Supabase drift check must also pass. Never suppress a pending migration.
3. Apply a reviewed migration with its exact SQL and matching ledger payload
   in one transaction, following `CLAUDE.md`; do not run `db push` or repair.
   The launch-security migration was approved, applied and stamped in production
   and staging on 2026-09-21. Its committed SQL MD5 is
   `cdf1be475b4c306ac1fa12c336f9d769`; do not reapply it.
4. Run the manual workflow for the selected function with `target=staging` on
   the release commit. It requires passing CI checks for that exact SHA.
5. Verify staging with real authentication and synthetic fixtures. In
   particular, export must retain the shared v2 shape and exclude mailbox
   credentials; the gateway must deny foreign projects before provider spend;
   billing must use test credentials and reject unsigned webhooks. Deployment
   success alone is not evidence that external provider credentials work.
6. From `main`, run the workflow with `target=production`. It requires passing
   CI and a successful staging workflow for the same function and exact SHA.
   If a merge changed the SHA, repeat staging on that merge commit. The
   production environment reviewer confirms the staging evidence before release.
7. Record deployment version, source SHA, JWT setting and smoke results. Check
   production using non-destructive requests and the actual browser workflow.

The JWT modes match the verified live contracts: `project-export` verifies at
the gateway; `llm-proxy` authenticates its bearer token internally;
`stripe-billing` verifies webhook signatures and authenticates non-webhook
actions internally. Do not enable gateway JWT verification for Stripe webhooks.

The workflow downloads the previous function into an isolated runner directory
and uploads it with the deployment inventory before publishing. Failure to
download or retain an existing source stops deployment. A missing production
function also stops deployment; staging permits a first installation.

## Rollback and limits

The initial #461 release used the owner's explicitly approved manual rollout:
the prepared SQL package passed a staging rollback rehearsal, the production
ledger hash and 18 restrictive policies were verified, and named CLI deploys
published `llm-proxy` v43, `project-export` v30 and `stripe-billing` v30.
All 21 downloaded source files matched the reviewed commit after line-ending
normalization, and each JWT mode matched the original contract. The separate
GitHub backend workflow remains inactive until its environment credentials and
review rules are configured; this manual release does not prove that workflow.
Production rejected unauthenticated gateway/export/billing requests with 401,
unsupported billing methods with 405 and unsigned webhooks with 400. Billing
remains in test mode. No payment or paid AI request was made during verification.

Redeploy the captured previous source with its original JWT mode after explicit
approval. A frontend rollback does not revert functions or database migrations.
Prefer a reviewed forward fix over removing tenant-access or ownership guards.

The gateway quota remains an aggregate of recorded usage, not an atomic
reservation for concurrent provider calls. Atomic spend reservations, all
remaining Edge entrypoints, server-side MFA policy, complete migration replay,
PITR and restore rehearsals are separate audit findings still open.
