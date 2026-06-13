// stripe-billing — Stripe Checkout + customer portal + webhook for the org
// subscription model (multi-tenant SaaS).
//
// Deploy with verify_jwt = false: the webhook is called by Stripe (no JWT), and
// the checkout/portal actions verify the caller's JWT themselves. The function
// owns the Stripe secret + price ids; the client only passes a plan KEY.
//
// Required edge-function secrets:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected)

import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const PRICE: Record<string, string> = {
  pro: Deno.env.get("STRIPE_PRICE_PRO") ?? "",
  business: Deno.env.get("STRIPE_PRICE_BUSINESS") ?? "",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
// service-role client: bypasses RLS + the billing-tamper trigger (auth.role()='service_role').
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

function priceToPlan(priceId: string | undefined): string | null {
  if (!priceId) return null;
  if (priceId === PRICE.pro) return "pro";
  if (priceId === PRICE.business) return "business";
  return null;
}

// deno-lint-ignore no-explicit-any
async function handleEvent(event: any) {
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const orgId = s.metadata?.org_id || s.client_reference_id;
    if (!orgId) return;
    const sub = s.subscription ? await stripe.subscriptions.retrieve(s.subscription) : null;
    const plan = s.metadata?.plan || priceToPlan(sub?.items?.data?.[0]?.price?.id) || "pro";
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
      plan: deleted ? "free" : (priceToPlan(sub.items?.data?.[0]?.price?.id) ?? sub.metadata?.plan ?? undefined),
      subscription_status: deleted ? "canceled" : sub.status,
      stripe_subscription_id: sub.id,
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    }).eq("id", orgId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // ── Stripe webhook (signature-verified; no JWT) ──
  if (url.pathname.endsWith("/webhook")) {
    const sig = req.headers.get("stripe-signature");
    const raw = await req.text();
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig ?? "", WEBHOOK_SECRET);
    } catch (e) {
      return new Response(`Webhook signature verification failed: ${(e as Error).message}`, { status: 400 });
    }
    // Idempotency: a unique stripe_event_id means we've already handled it.
    const { error: dupErr } = await admin.from("billing_events").insert({ stripe_event_id: event.id, type: event.type });
    if (dupErr) {
      if (String(dupErr.message).toLowerCase().includes("duplicate")) return new Response("ok (already processed)", { status: 200 });
      console.error("billing_events insert error", dupErr);
    }
    try {
      await handleEvent(event);
    } catch (e) {
      console.error("webhook handler error", e);
      return new Response("handler error", { status: 500 }); // let Stripe retry
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

  const origin = req.headers.get("origin") ?? "https://steelbuild-pro.com";

  if (action === "checkout") {
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
