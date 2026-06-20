# Stripe production go-live checklist

> Status as of 2026-06-20 (verified against the live `kjrwqagyeswwoxpjkcko` project).
> The billing **code path is complete and correct** and `billing_config` is populated
> (Pro + Business `price_…` IDs and a `whsec_…` signing secret are all present). What
> remains is an owner-run **test-mode end-to-end** — the flow has never processed a
> webhook (`billing_events` has 0 rows; the only org is `enterprise`/internal with no
> Stripe customer — all expected pre-launch). An automated **webhook-replay test** now
> guards the handler's org-mapping logic (see "Already done in code").

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

## ✅ Resolved — single Stripe integration

Earlier the project also had the **Supabase Stripe Sync Engine** template deployed
(`stripe-setup` / `stripe-worker` / `stripe-webhook`) as an unused parallel path.
Those are **gone** — only the 8 app functions are deployed now, and `stripe-billing`
(with its `/webhook` route) is the sole Stripe integration. A leftover `pg_cron` job
(`stripe-sync-worker`) that POSTed the deleted `stripe-worker` every minute (→ 404 noise
in the edge logs) was **unscheduled 2026-06-20** (`select cron.unschedule('stripe-sync-worker')`).
Do **not** re-deploy the sync trio (it would double webhook delivery).

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

## Already done in code

- **Error surfacing fix** (`billingService.ts`, 2026-06-17): `functions.invoke` wraps a
  non-2xx response in a `FunctionsHttpError` whose `.message` is generic, so the real
  reason ("Plan X isn't available", "You don't have permission…", "No billing account
  yet") was being swallowed in the Billing UI. Now reads `error.context` to show the
  actual cause. (+5 unit tests.)
- **Webhook-replay test** (2026-06-20, `supabase/functions/stripe-billing/__tests__/webhookReplay.test.ts`):
  the pure org-mapping logic was extracted to `webhookLogic.ts` (behavior-identical;
  `index.ts` keeps the Stripe calls + DB writes) and is unit-tested for
  `checkout.session.completed`, `customer.subscription.updated`, and `.deleted` —
  plan/status/period mapping, `metadata.plan` precedence, `client_reference_id`
  fallback, unknown-price fallback. Runs under `npm test`, gating CI against handler
  regressions. **Does NOT replace** the owner test-mode E2E (step 4) — that proves the
  real Stripe signature round-trip + DB write, which a unit test cannot.
- **Sync-engine trio removed + stale `stripe-sync-worker` pg_cron unscheduled** (2026-06-20).

## Notes

- Plan **enforcement** (project/member limits) is already live (`fea77911`); this
  checklist is only about the *payment* path.
- Same `FunctionsHttpError` swallow pattern exists at several `llm-proxy` call sites
  (aiSuggest / importRfiLog / importShippingTicket / revisionSnapshotDiff) — mostly
  with offline fallbacks, so lower priority, but worth a shared `readEdgeFunctionError`
  helper rather than per-site copies.
