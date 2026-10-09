# Atomic Stripe billing verification

From the repository root:

```sh
npm --prefix supabase/tests/stripe-billing ci --ignore-scripts
npm --prefix supabase/tests/stripe-billing test
```

The suite runs the actual candidate
[`20261008071019_atomic_stripe_billing_events.sql`](../../migrations/20261008071019_atomic_stripe_billing_events.sql)
inside an ephemeral PGlite database with synthetic records and the shipped
organization billing-column guard. It does not read environment credentials,
contact Stripe or Supabase, or write live data.

All **22 checks** must pass. They cover atomic organization/event application,
rollback when an organization update or receipt insert fails, detection of a
suppressed update, duplicate delivery and existing receipts, stale revision
rejection, customer/subscription binding changes, missing organizations,
obsolete-event handling, strictly newer checkout replacement, ambiguous order,
paid-status restrictions, unrelated events, service-role-only RPC permissions,
private-table isolation, RLS and explicit function search paths.

The companion actual-entrypoint and mapping tests run from the repository root:

```sh
npx vitest run supabase/functions/stripe-billing/__tests__ supabase/functions/_shared/mfaEntrypoints.test.ts
```

Those tests execute production handler bodies with synthetic provider/database
boundaries. They verify returned-error handling, retries, signature-rejection
control flow, current subscription retrieval, entitlement mapping and binding
decisions. They do not prove real Stripe signature cryptography or delivery.

PGlite checks the actual transaction rollback and compares two deliberately
stale observations. It is a reduced schema with a single database connection;
it does not prove overlapping PostgreSQL sessions, hosted lock timing,
PostgREST grants, full-schema trigger compatibility or provider delivery.
Staging acceptance must include independent concurrent connections, competing
checkout/cancellation deliveries, retried database failures and test-mode
Stripe delivery against the deployed function.

`verify-postgres.mjs` supplies six independent-session scenarios in the required
commercial PostgreSQL CI job. It refuses non-loopback hosts, URL options, other
database names and populated databases. `BILLING_POSTGRES_CREATE_DB=1` creates
the dedicated `steelbuild_billing_test` database and refuses an existing name;
the disposable CI service owns its lifetime. Use `npm run test:postgres` with
`BILLING_POSTGRES_TEST=1` and `BILLING_POSTGRES_URL` pointed only at that local
test database. These are synthetic concurrency checks, not hosted acceptance.

`staging-acceptance.sql` verifies installed policies/guards and service-role-only
execution under rollback. The October 9 rehearsal passed 20 checks and cleanup
counts were zero; the candidate remains unapplied. See the release audit.

`node supabase/tests/stripe-billing/diagnose-checkout.mjs` is an explicit open-gap
diagnostic, not a passing monetization gate. It confirms duplicate subscription
sessions for already-paid workspaces and duplicate customers/sessions after
failed binding writes. It uses synthetic boundaries and makes no charges.

**The exact reviewed migration must be applied and verified before deploying
the matching `stripe-billing` handler.** Follow the repository's manual migration
and ledger process; never use `db push`, `migration repair` or MCP
`apply_migration`. The handler deliberately fails retryably if the RPC is absent
instead of falling back to separate organization and receipt writes.

Existing receipts remain authoritative for backward compatibility. This change
does not automatically repair historical receipts written after a failed billing
update; reconcile any affected subscriptions deliberately without bulk-deleting
receipts. Distinct subscriptions created in the same second require review,
and the existing new-checkout upgrade flow can still create overlapping paid
subscriptions. Neither is resolved by guessing event order.
