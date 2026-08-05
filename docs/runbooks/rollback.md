# Staging and Production Rollback Runbook

This runbook is a decision guide, not authorization to deploy. Database and
Edge Function actions require an approved operator and the target environment
must be confirmed before any command is run.

## Rollback triggers

Stop promotion and begin rollback or forward-fix when any of these occur:

- Authentication, MFA, recovery, or project selection is unavailable.
- Cross-tenant or cross-project data is visible or writable.
- Drawing, Submittal, RFI, or fabrication-release state is corrupted.
- A critical mutation reports success before server confirmation or loses
  failed items.
- A blocked fabrication release succeeds without an authorized reason.
- A migration fails, leaves schema/cache mismatch, or disables required RLS.
- Edge Function errors, latency, quota, or provider failures exceed the
  agreed staging threshold.
- Primary routes, assets, WASM, health checks, or lazy chunks fail.
- Service-worker behavior serves an incompatible shell or asset set.
- The measured performance regression exceeds the approved staging budget.

## Frontend deployment

1. Stop promotion and preserve the failing SHA, CI run, Vercel deployment ID,
   browser evidence, and Sentry release.
2. In the target Vercel project, promote the last known-good deployment for
   that environment. Do not use a mutable branch name as the rollback record.
3. Verify `/`, manifest, deep-link fallback, health endpoint, login, and one
   read-only project route.
4. Confirm the service worker receives the current network-first shell. If a
   client remains stale, unregister the worker and clear the site cache only in
   the affected staging browser; do not clear customer data.

## Edge Functions

1. Stop invoking the affected function and enable its documented kill switch
   when available.
2. Redeploy the previous known-good function revision to the same staging
   project, or apply a forward fix if state has already changed.
3. Verify JWT mode, CORS origin, required secrets, RPC dependencies, and a
   non-destructive health request.
4. Preserve logs and request IDs without recording tokens or record contents.

## Database migrations

Do not assume a down-migration is safe. For feature-flag catalog seed changes,
preserve `enabled` and `user_overrides` and use a reviewed forward-fix if a
description or catalog issue is found. For destructive or irreversible changes,
restore a staging backup to an isolated target or use a tested forward-fix.

1. Stop application promotion.
2. Capture migration version, database error, lock state, and affected tables.
3. Determine whether the migration committed partially.
4. Consult the migration owner before applying any repair.
5. Verify RLS, RPCs, schema cache, and generated-type expectations afterward.

Production database rollback is not implied by this document and is not an
automatic action. Production requires an approved backup/restore or forward-
fix decision.

## Feature flags

- Disable a retained operational flag when its workflow is unsafe.
- Never use `command_ui` to roll back presentation; it is retired.
- Keep account/workspace deletion disabled unless a separate destructive test
  has an isolated fixture and explicit approval.
- Record global and per-user values before and after the change.

## Staged test data

Stop destructive tests, identify affected fixture IDs, and restore the staging
backup or remove only the test records using the approved owner procedure.
Never use a production service-role key or customer record for cleanup.

## Evidence and decision point

The rollback owner records: environment, candidate SHA, trigger, time, current
deployment, last known-good deployment, database state, function revisions,
flag changes, evidence links, and whether the result was rollback or forward-
fix. Production approval remains blocked until the incident is closed.
