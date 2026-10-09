# Atomic billing events and production backup boundary

Current hosted state (October 9, 13:09 UTC): the exact migration below is applied
and stamped in staging and production, with matching payload and function hashes.
Installed staging acceptance passed all 20 checks and left no synthetic fixture
rows. See `PRODUCTION_RELEASE_2026-10-08.md`. The matching Edge handler is not yet
deployed; payment readiness remains incomplete for the reasons below.

This ports only the committed billing/backup changes from `1fc3078f1af7ef79524654d3640ab7015da465f2`. The `stripe-billing` entrypoint and mapping module, migration, backup script/workflow and original focused tests preserve that source. Account deletion is a separately reviewed release. No uncommitted security-worktree files are included.

## Result and deployment order

The billing handler reads a consistent workspace binding/revision before asking Stripe for current subscription state. A service-role-only RPC locks that workspace, rejects stale observations, and commits the entitlement, revision and unique receipt together. Failed updates and failed receipts remain retryable. Old receipts remain authoritative. Only configured prices and active/trialing/past-due statuses grant paid access; metadata cannot substitute for an unknown price.

Apply and verify `20261008071019_atomic_stripe_billing_events.sql` **before** deploying the matching handler. Its SHA-256 is `3dfc1339eb999c33b5bad396d439958c8a6e6820071a612e33e686db9d5bbe44`. The migration is classified as required, so an absent production stamp blocks frontend publishing. Use only the reviewed manual file-first apply/stamp procedure. There is no non-atomic handler fallback if the RPC is missing. Existing enrolled-MFA and verified caller checks are preserved. The function retains internal authentication with gateway JWT verification disabled for Stripe webhooks.

The storage backup workflow admits scheduled/manual runs from `main` only. The script independently refuses other GitHub contexts before validating or using credentials. Environment branch restrictions remain necessary: these source checks do not prevent a different untrusted workflow from requesting broadly scoped credentials.

## Verification

- 65 focused handler, mapping, MFA and actual backup process tests passed; the 22-check embedded SQL suite passed.
- On October 9, the exact candidate ran inside a rollback transaction on staging `ndyfjffsulfbwpmwdmic`: **20 checks passed** against installed billing guards and RLS. They covered atomic application, replay, stale observation, failed period parsing, cancellation, private-table denial, owner/foreign-owner receipt visibility and denial of direct owner/anonymous entitlement writes or RPC execution.
- After rollback, a separate query found zero synthetic Auth users, workspaces, receipts or ledger stamps. The candidate table and RPC were absent. No hosted SQL changes or provider charges were committed.
- `verify-postgres.mjs` exercises independent PostgreSQL sessions in a dedicated empty loopback database: eight simultaneous duplicate deliveries, competing activation/cancellation, failed receipts, binding replacement, cross-workspace receipt collision and deletion lock ordering. Its required commercial CI job supplies a disposable PostgreSQL 17 service. Check the exact PR-head run for the result; adding the runner alone does not establish a pass.
- The existing SDK/API contract is intentionally retained for this narrow security port. A provider API-version upgrade needs separate endpoint-schema and event acceptance.

## Monetization blockers still open

**This is not complete payment readiness.** `node supabase/tests/stripe-billing/diagnose-checkout.mjs` reproduces two unresolved behaviors using the actual entrypoint with synthetic boundaries:

1. Two requests from an already-paid workspace create two new subscription Checkout Sessions, without an idempotency key or an existing-subscription gate.
2. Concurrent requests without a bound customer create two customers and two sessions even when both workspace customer-binding writes return errors.

The new webhook does not prevent those provider effects. It can adopt a strictly newer subscription after checkout; it does not cancel/refund the prior paid subscription. Existing paid workspaces need a controlled portal/update path and new checkout needs a durable, retryable single-operation/customer boundary before monetization can be called ready. Ambiguous same-second subscription order requires reconciliation rather than guessing. Historical receipts written after failed old updates require deliberate reconciliation, not receipt deletion.

Real test-mode Stripe signatures/delivery, retried provider events against the deployed function, live product/tax configuration and an actual offsite restore remain separate acceptance work. No real charges, configuration swaps, backup execution or restore were performed by this slice.
