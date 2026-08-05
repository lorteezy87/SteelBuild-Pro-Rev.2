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
4. **Test-mode E2E** (before going live): see **"Test-mode E2E (safe toggle)"** below.
   As of 2026-06-21 it flips `billing_config` (incl. `livemode=false`) instead of the
   env secrets, so the live `STRIPE_SECRET_KEY` is never touched.
5. **Going live** is the steady state (`billing_config.livemode=true`, live `price_…`
   + live `whsec_…`). After a test run, just restore the live `billing_config` row.

## Test-mode E2E (safe toggle — `billing_config.livemode`)

`stripe-billing` chooses its Stripe key from `billing_config.livemode` (added 2026-06-21):
`true` (default + steady state) → `STRIPE_SECRET_KEY` (live, **unchanged behavior**);
`false` → `STRIPE_SK_TEST`. So a test run is a `billing_config` flip — the live secret
key is **never overwritten** (Stripe won't re-reveal a live secret key, so overwriting
it would be unrecoverable without rolling it).

**Owner (Stripe dashboard, Test mode):**
1. Confirm the `STRIPE_SK_TEST` edge secret holds your current test secret key
   (`sk_test_…`): `npx supabase secrets set STRIPE_SK_TEST=sk_test_… --project-ref kjrwqagyeswwoxpjkcko`.
2. Create a **test-mode** recurring Price for Pro (and Business if testing it). Copy the `price_…` id(s).
3. Add a **test-mode** Webhook → `https://kjrwqagyeswwoxpjkcko.supabase.co/functions/v1/stripe-billing/webhook`,
   events `checkout.session.completed` + `customer.subscription.updated` + `.deleted`. Copy the `whsec_…`.
4. Hand the engineer: the test `price_…` id(s) + the test `whsec_…`.

**Engineer (Supabase):** capture the live `billing_config` row first (for restore), then
`update public.billing_config set livemode=false, stripe_price_pro=<test>,
stripe_price_business=<test>, stripe_webhook_secret=<test whsec> where scope='default';`
The deployed function then uses `STRIPE_SK_TEST` automatically — no secret swap.

**Owner (app):** on a **free** org (sign up a throwaway one — the founder org is
`enterprise`), Billing → upgrade to Pro → pay with `4242 4242 4242 4242` (any future
expiry/CVC) → redirected to `/Billing?status=success`.

**Engineer (verify):** `select plan, subscription_status, stripe_customer_id,
stripe_subscription_id from organizations where id=<test org>` → expect `pro` / `active`
/ ids set; confirm a `billing_events` row. Optionally test the portal + a cancel (→ `free`).

**Engineer (revert to live):** restore the captured live row (`livemode=true`, live
`price_…`, live `whsec_…`); confirm a bad-sig webhook → 400 against the live secret. Owner
may then delete the test webhook + test org.

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
- **livemode-aware key selection** (2026-06-21, `index.ts`): the Stripe client key is
  chosen by `billing_config.livemode` (live → `STRIPE_SECRET_KEY`, `false` → `STRIPE_SK_TEST`),
  so a test-mode E2E flips `billing_config` with no risk to the live key. Deployed + verified
  (bad-sig webhook → 400; CORS locked). Live (`livemode=true`) path byte-identical.

## Notes

- Plan **enforcement** (project/member limits) is already live (`fea77911`); this
  checklist is only about the *payment* path.
- Same `FunctionsHttpError` swallow pattern exists at several `llm-proxy` call sites
  (aiSuggest / importRfiLog / importShippingTicket / revisionSnapshotDiff) — mostly
  with offline fallbacks, so lower priority, but worth a shared `readEdgeFunctionError`
  helper rather than per-site copies.
