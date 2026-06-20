// stripe-billing — Stripe Checkout + customer portal + webhook for the org
// subscription model (multi-tenant SaaS).
//
// Deploy with verify_jwt = false: the webhook is called by Stripe (no JWT), and
// the checkout/portal actions verify the caller's JWT themselves. Price ids + the
// webhook signing secret are read from the service-role-only public.billing_config
// table (provisioned via the Stripe API), falling back to env (STRIPE_PRICE_PRO /
// STRIPE_PRICE_BUSINESS / STRIPE_WEBHOOK_SECRET). The client only passes a plan KEY.
//
// The Stripe client is built per-invocation (reads STRIPE_SECRET_KEY fresh), so a
// secret rotation (e.g. test -> live) takes effect without also redeploying.
//
// Required edge-function secrets:
//   STRIPE_SECRET_KEY   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY injected)

import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// service-role client: bypasses RLS + the billing-tamper trigger (auth.role()='service_role').
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// Built per-invocation so a STRIPE_SECRET_KEY rotation (test -> live) is picked up
// without a redeploy.
function stripeClient(): Stripe {
  return new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });

interface BillingConfig { pricePro: string; priceBusiness: string; webhookSecret: string; }

// Config (price ids + webhook secret) lives in the service-role-only billing_config
// table so it can be provisioned via the Stripe API without writing env secrets at
// runtime. Env is the fallback.
async function loadConfig(): Promise<BillingConfig> {
  let row: Record<string, string> | null = null;
  try {
    const { data } = await admin
      .from("billing_config")
      .select("stripe_price_pro, stripe_price_business, stripe_webhook_secret")
      .eq("scope", "default")
      .maybeSingle();
    row = data as Record<string, string> | null;
  } catch (_e) { /* fall back to env */ }
  return {
    pricePro: row?.stripe_price_pro || Deno.env.get("STRIPE_PRICE_PRO") || "",
    priceBusiness: row?.stripe_price_business || Deno.env.get("STRIPE_PRICE_BUSINESS") || "",
    webhookSecret: row?.stripe_webhook_secret || Deno.env.get("STRIPE_WEBHOOK_SECRET") || "",
  };
}

function priceToPlan(priceId: string | undefined, cfg: BillingConfig): string | null {
  if (!priceId) return null;
  if (priceId === cfg.pricePro) return "pro";
  if (priceId === cfg.priceBusiness) return "business";
  return null;
}

// deno-lint-ignore no-explicit-any
async function handleEvent(stripe: Stripe, event: any, cfg: BillingConfig) {
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const orgId = s.metadata?.org_id || s.client_reference_id;
    if (!orgId) return;
    const sub = s.subscription ? await stripe.subscriptions.retrieve(s.subscription) : null;
    const plan = s.metadata?.plan || priceToPlan(sub?.items?.data?.[0]?.price?.id, cfg) || "pro";
    await admin.from("organizations").update({
      plan,
      subscription_status: sub?.status ?? "active",
      stripe_subscription_id: s.subscription ?? null,
      stripe_customer_id: s.customer ?? undefined,
      current_period_end: sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    }).eq("id", orgId);
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    let orgId = sub.metadata?.org_id;
    if (!orgId) {
      const { data: org } = await admin.from("organizations").select("id").eq("stripe_customer_id", sub.customer).maybeSingle();
      orgId = org?.id;
    }
    if (!orgId) return;
    const deleted = event.type === "customer.subscription.deleted";
    await admin.from("organizations").update({
      plan: deleted ? "free" : (priceToPlan(sub.items?.data?.[0]?.price?.id, cfg) ?? sub.metadata?.plan ?? undefined),
      subscription_status: deleted ? "canceled" : sub.status,
      stripe_subscription_id: sub.id,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    }).eq("id", orgId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const url = new URL(req.url);
  const stripe = stripeClient();

  // ── Stripe webhook (signature-verified; no JWT) ──
  if (url.pathname.endsWith("/webhook")) {
    const sig = req.headers.get("stripe-signature");
    const raw = await req.text();
    const cfg = await loadConfig();
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig ?? "", cfg.webhookSecret);
    } catch (e) {
      return new Response(`Webhook signature verification failed: ${(e as Error).message}`, { status: 400 });
    }
    // Idempotency: short-circuit only if a PRIOR delivery FULLY processed this
    // event. The marker is written AFTER handleEvent succeeds (below), so a
    // transient handler failure no longer permanently drops the event — Stripe's
    // retry re-runs it instead of short-circuiting on a premature marker.
    const { data: seen } = await admin
      .from("billing_events")
      .select("stripe_event_id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (seen) return new Response("ok (already processed)", { status: 200 });

    // Best-effort org id for the audit row (object is a Checkout session or a
    // subscription). Typed cast keeps it deno-check-clean over the Stripe union.
    const obj = (event.data?.object ?? {}) as { metadata?: { org_id?: string }; client_reference_id?: string };
    const eventOrgId = obj.metadata?.org_id ?? obj.client_reference_id ?? null;

    try {
      await handleEvent(stripe, event, cfg);
    } catch (e) {
      console.error("webhook handler error", e);
      // NOT marked processed → Stripe's retry re-runs handleEvent. That's the fix.
      return new Response("handler error", { status: 500 });
    }

    // Mark processed ONLY after success. A concurrent double-delivery loses the
    // race on the UNIQUE stripe_event_id and is ignored (handleEvent is idempotent).
    const { error: markErr } = await admin
      .from("billing_events")
      .insert({ stripe_event_id: event.id, type: event.type, org_id: eventOrgId });
    if (markErr && !String(markErr.message).toLowerCase().includes("duplicate")) {
      console.error("billing_events mark error", markErr);
    }
    return new Response("ok", { status: 200 });
  }

  // ── App actions: checkout / portal (JWT-verified) ──
  let body: { action?: string; org_id?: string; plan?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }
  const { action, org_id, plan } = body;
  if (!org_id) return json({ error: "org_id is required" }, 400);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Not authenticated" }, 401);

  // Only an owner/admin of the org may manage its billing.
  const { data: membership } = await admin
    .from("organization_members").select("role").eq("org_id", org_id).eq("user_id", user.id).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return json({ error: "You don't have permission to manage this workspace's billing" }, 403);
  }

  // Validate the Origin before it's baked into Stripe redirect URLs (#12). An
  // unvalidated Origin would let an attacker point checkout success/cancel — and
  // the billing-portal return — at an arbitrary site (post-payment open redirect).
  // Any disallowed/missing origin falls back to the canonical production URL.
  const rawOrigin = req.headers.get("origin") ?? "";
  const origin = isAllowedOrigin(rawOrigin) ? rawOrigin : "https://steelbuild-pro.com";

  if (action === "checkout") {
    const cfg = await loadConfig();
    const PRICE: Record<string, string> = { pro: cfg.pricePro, business: cfg.priceBusiness };
    const priceId = plan ? PRICE[plan] : "";
    if (!priceId) return json({ error: `Plan "${plan}" isn't available for checkout yet` }, 400);

    const { data: org } = await admin.from("organizations").select("stripe_customer_id, name").eq("id", org_id).single();
    let customerId = org?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({ name: org?.name ?? undefined, email: user.email ?? undefined, metadata: { org_id } });
      customerId = customer.id;
      await admin.from("organizations").update({ stripe_customer_id: customerId }).eq("id", org_id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: org_id,
      metadata: { org_id, plan: plan ?? "" },
      subscription_data: { metadata: { org_id, plan: plan ?? "" } },
      allow_promotion_codes: true,
      success_url: `${origin}/Billing?status=success`,
      cancel_url: `${origin}/Billing?status=cancel`,
    });
    return json({ url: session.url });
  }

  if (action === "portal") {
    const { data: org } = await admin.from("organizations").select("stripe_customer_id").eq("id", org_id).single();
    if (!org?.stripe_customer_id) return json({ error: "No billing account yet — start a subscription first" }, 400);
    const portal = await stripe.billingPortal.sessions.create({ customer: org.stripe_customer_id, return_url: `${origin}/Billing` });
    return json({ url: portal.url });
  }

  return json({ error: "Unknown action" }, 400);
});
