# Billing configuration and provider acceptance — 2026-10-09

## Verified scope

Read-only metadata was checked against production `kjrwqagyeswwoxpjkcko` and staging `ndyfjffsulfbwpmwdmic`. Source was reviewed at integration `a77a6d0381e0cafd1d0948ba9bc535c01e28b878`; current main at inspection was `00cc7a70f3bb6eb1d5864f5f3f7358d03bac0aeb`. Billing source in that integration matches the durable-checkout candidate. This audit does not establish that candidate is deployed.

No provider keys or signing-secret values were read. No provider configuration, database configuration, subscriptions, customers, payments, cancellations or refunds were changed. Only SQL metadata/aggregates, function inventory, and unauthenticated CORS preflight responses were inspected.

| Item | Observed state |
| --- | --- |
| Production `billing_config` | One `default` row; **`livemode=false`**. Existing comments/runbooks describing production as live are stale. |
| Production Pro mapping | `price_1UEly1MJTUhyBwSXWuqUWKaM`; provider amount, currency, active flag, interval, account and mode remain unverified. |
| Production Business mapping | `price_1UEls5MJTUhyBwSXRRDGnBdn`; same provider checks remain. |
| Production signing configuration | Nonblank signing-secret presence confirmed by a boolean SQL expression, without retrieving its value. Endpoint ID is `we_1TjCbX4cElv5z7QuG65tF7TA`; current URL, mode, subscriptions and delivery status are unverified. |
| Production application receipts/bindings | 0 `billing_events`; 0 organizations with a customer ID; 0 with a subscription ID. This is not a provider orphan/duplicate audit. |
| Staging `billing_config` | **No row**. Explicit test-mode configuration is required before provider acceptance. |
| Installed `stripe-billing` inventory | Production version31 and staging version32, both `verify_jwt=false`. This inventory is not a source-hash comparison or proof of the candidate's behavior. |
| Browser origin checks | OPTIONS returned200 and reflected the production www origin on production and the staging Worker origin on staging. Neither reflected `https://untrusted.invalid`. |
| Secret-name inventory | Not available through the connected metadata tools. Presence, contents and provider-account ownership of the keys below remain unverified. |

## Source correction

Previously a missing configuration row, null mode, and any value other than literal false selected live billing. The handler now requires a `default` row whose `livemode` is a literal boolean. Missing/invalid mode and failed configuration lookup return503 before constructing or accessing Stripe. Explicit false still selects `STRIPE_SK_TEST`; explicit true selects `STRIPE_SECRET_KEY`. A missing test key never falls back to the live key.

Price/signing environment fallbacks remain available only after mode validation. Existing explicit-mode webhook signature checks, event-mode checks and retry behavior remain. No checkout intent, migration, provider state or stored environment is changed or reset.

Actual-entrypoint tests first reproduced **27 failures**, with nine valid-mode/key/signature cases already passing. After the correction, **127 billing/MFA/CORS tests** and scoped ESLint passed. The tests replace provider boundaries; they do not prove real signature cryptography or provider delivery.

## Required configuration and remaining acceptance

1. **Explicit staging isolation.** Before any provider action, establish a staging `billing_config` default row with literal false, prices from the intended Stripe test environment and its webhook signing configuration. Verify `STRIPE_SK_TEST` belongs to that same environment. Do not toggle production configuration to conduct staging acceptance. Named key presence alone does not prove provider mode.
2. **Price catalog.** The frontend displays Pro USD99/month and Business USD299/month. Retrieve each configured provider Price and verify distinct IDs, active recurring monthly prices, USD currency, amounts9900/29900, quantity semantics, provider account/mode, product tax code and price tax behavior. Source maps only the two configured price IDs; metadata cannot grant a different plan. There is no provider price-preflight tool in this repository.
3. **Webhook destination.** Verify the intended test environment endpoint is enabled at `https://ndyfjffsulfbwpmwdmic.supabase.co/functions/v1/stripe-billing/webhook`, using its matching signing secret and `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` events. Production needs a separately verified production endpoint before live billing. The handler intentionally verifies signatures internally with gateway JWT verification disabled.
4. **Return routing.** `STEELBUILD_BASE_URL` must be a canonical origin with no trailing slash/path/query/fragment and must be present in the effective `ALLOWED_ORIGINS`. Staging should use `https://steelbuild-pro-staging.n-lortz1987.workers.dev`; production should use `https://www.steelbuild-pro.com`. When unset, the return base defaults to production www. Browser origin cannot choose the payment return. OPTIONS proves CORS for tested origins, not the configured return base.
5. **Tax and portal settings.** Checkout always requests `automatic_tax.enabled=true`, tax-ID collection, a required billing address, and automatic customer address/name updates. Verify Stripe Tax settings/registrations and test-environment calculations with the responsible owner/adviser. Configure the customer portal's intended payment-method, cancellation and plan-change features; the handler uses the provider's default portal configuration. No portal configuration ID is pinned in source.
6. **Signed test-mode round trip.** On a disposable staging workspace, verify checkout/customer/session idempotency for repeated/concurrent requests, completion and decline/authentication paths, actual signed webhook delivery, a single durable receipt and correct entitlements. Verify existing subscribers are directed to Manage billing, portal return, lifecycle updates and retry/replay behavior. Verify tax amount separately on the provider invoice and preserve evidence. No provider end-to-end runner exists; the steps require a separately authorized test environment and controlled interaction.
7. **Historical reconciliation.** List provider customers, subscriptions and outstanding sessions by workspace metadata to identify orphaned or duplicate historical objects. Application row counts cannot establish their absence. Do not bulk-delete receipts or cancel subscriptions based on this audit.
8. **Live activation.** Only after accepted staging evidence, independently verify the live provider account/key, prices, webhook, tax and portal settings, then approve an explicit live configuration change. Current production `livemode=false` does not authorize or enable real charges.

The existing owner checklist says the webhook records tax to a liability path. The current handler writes plan, subscription/customer bindings, status and billing period, and records event receipt metadata; it does **not** book invoice tax to an application general ledger. Use provider tax/invoice reporting or implement a separately reviewed accounting integration before claiming this behavior.

## Exact existing validation tools

- Source boundary tests: `npx vitest run --maxWorkers=1 supabase/functions/stripe-billing/__tests__ supabase/functions/_shared/mfaEntrypoints.test.ts supabase/functions/_shared/__tests__/cors.test.ts`.
- Actual atomic-event and checkout SQL in disposable PGlite: `npm --prefix supabase/tests/stripe-billing test` (dependencies installed with `npm --prefix supabase/tests/stripe-billing ci --ignore-scripts`).
- Independent concurrent PostgreSQL sessions: `npm --prefix supabase/tests/stripe-billing run test:postgres`, with the documented `BILLING_POSTGRES_TEST`, loopback-only database URL and optional fresh-test-database flag in `supabase/tests/stripe-billing/README.md`; this is already in required commercial CI.
- Hosted rollback assertions: `supabase/tests/stripe-billing/staging-acceptance.sql` and `checkout-staging-acceptance.sql`, only after verifying their installed prerequisites and rollback boundaries against the exact reviewed candidate. They do not call Stripe.
- Read-only configured metadata: select `scope`, `livemode`, the two price IDs, signing-secret **presence boolean** and endpoint ID from `public.billing_config`; select aggregate application receipt/binding counts. Never select the signing-secret value into an audit.
- CORS: OPTIONS to the function URL with the intended Origin and an untrusted Origin, inspecting only response status/allow-origin. It does not authenticate a user, create a session or prove the payment return URL.
- Provider-owned evidence: Stripe Dashboard or authenticated read-only Price/webhook/portal/Tax metadata access. No connected Stripe tool or safe secret-name inventory was available during this audit.

Official references: [Price retrieval fields](https://docs.stripe.com/api/prices/retrieve), [Stripe test environments](https://docs.stripe.com/testing), [Checkout tax prerequisites](https://docs.stripe.com/tax/checkout), and [customer portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal). These describe provider capabilities; they do not establish this account's configuration.
