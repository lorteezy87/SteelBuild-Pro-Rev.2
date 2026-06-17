# Stripe production go-live checklist

> Status as of 2026-06-17 (verified against the live `kjrwqagyeswwoxpjkcko` project).
> The billing **code path is complete and correct**; what remains is live-account
> configuration (owner-only) + a decision on a duplicate integration. The flow has
> never run end-to-end yet (1 org, `enterprise`/internal, no Stripe customer;
> `billing_events` table exists with 0 rows — all expected pre-launch).

## How billing works (the path the app uses)

```
Billing.jsx → billingService.ts → supabase fn "stripe-billing"
   action:"checkout" → Stripe Checkout session → redirect → /Billing?status=success
   action:"portal"   → Stripe billing portal
   Stripe → POST stripe-billing/webhook (signed) → updates organizations.plan / *_status / current_period_end
```

- The Edge Function owns the Stripe secret + price IDs; the client only ever
  passes a plan **key** (`pro` / `business`). Source: `supabase/functions/stripe-billing/index.ts`.
- Plan catalog + entitlement limits: `src/lib/billing/plans.ts` (Pro $99 / Business $299;
  display prices only — must match what you create in Stripe).
- Webhook is signature-verified and idempotent (unique `stripe_event_id` in `billing_events`).

## ⚠️ Decision needed — two Stripe integrations are deployed

The live project has **four** Stripe functions, but the app only uses one:

| Function | Source in repo? | Used by app? | What it is |
|---|---|---|---|
| `stripe-billing` | ✅ yes | ✅ yes (billingService) | the custom checkout/portal/webhook this app relies on |
| `stripe-setup` / `stripe-worker` / `stripe-webhook` | ❌ no (deployed out-of-band) | ❌ no | the **Supabase Stripe Sync Engine** template (mirrors Stripe objects into a `stripe` schema). `stripe-webhook` is a 1.17 MB bundle. |

The sync-engine trio is an unused parallel path. Before launch, **either** remove it
(`supabase functions delete stripe-setup stripe-worker stripe-webhook`) **or**, if you
want Stripe data mirrored into Postgres, keep it but point only `stripe-billing/webhook`
at the app's webhook (the app reads `organizations`, not the `stripe` schema). Leaving
both wired to the same Stripe account doubles webhook delivery and is confusing.

## Go-live steps (owner — needs the live Stripe account)

1. **Stripe products/prices** — create a Pro and a Business recurring price (monthly).
   Match the display prices in `plans.ts` ($99 / $299) or update `plans.ts` to match.
2. **Set the 4 Edge Function secrets** on `stripe-billing`
   (Supabase → Edge Functions → stripe-billing → Secrets, or `supabase secrets set`):
   - `STRIPE_SECRET_KEY` (live `sk_live_…`, or `sk_test_…` for a test run first)
   - `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` (the `price_…` IDs from step 1)
   - `STRIPE_WEBHOOK_SECRET` (from step 3)
   *(SUPABASE_URL / SERVICE_ROLE / ANON are injected automatically.)*
3. **Webhook endpoint** — in Stripe → Developers → Webhooks, add
   `https://<project-ref>.supabase.co/functions/v1/stripe-billing/webhook`,
   subscribe to `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`; copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
   The function is deployed `verify_jwt = false` (it verifies the Stripe signature itself).
4. **Test-mode E2E** (before going live): with `sk_test_…` keys + a test price, from a
   non-enterprise org click Pro → complete Checkout with card `4242 4242 4242 4242` →
   confirm `organizations.plan` flips to `pro` and a row lands in `billing_events`.
   Then verify "Manage billing" opens the portal and a cancel flips the plan back.
5. **Flip to live keys** and repeat one real (or `$0` coupon) transaction.

## Already done in code (2026-06-17)

- **Error surfacing fix** (`billingService.ts`): `functions.invoke` wraps a non-2xx
  response in a `FunctionsHttpError` whose `.message` is generic, so the real reason
  ("Plan X isn't available", "You don't have permission…", "No billing account yet")
  was being swallowed in the Billing UI. Now reads `error.context` to show the actual
  cause. (+5 unit tests.)

## Notes

- Plan **enforcement** (project/member limits) is already live (`fea77911`); this
  checklist is only about the *payment* path.
- Same `FunctionsHttpError` swallow pattern exists at several `llm-proxy` call sites
  (aiSuggest / importRfiLog / importShippingTicket / revisionSnapshotDiff) — mostly
  with offline fallbacks, so lower priority, but worth a shared `readEdgeFunctionError`
  helper rather than per-site copies.
