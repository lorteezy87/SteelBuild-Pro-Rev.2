// stripe-billing — Stripe Checkout + customer portal + webhook for the org
// subscription model (multi-tenant SaaS).
//
// Deploy with verify_jwt = false: the webhook is called by Stripe (no JWT), and
// the checkout/portal actions verify the caller's JWT themselves. Price ids + the
// webhook signing secret are read from the service-role-only public.billing_config
// table (provisioned via the Stripe API), falling back to env (STRIPE_PRICE_PRO /
// STRIPE_PRICE_BUSINESS / STRIPE_WEBHOOK_SECRET). The client only passes a plan KEY.
//
// The Stripe client KEY is chosen by billing_config.livemode: live (the default and
// the current prod state) uses STRIPE_SECRET_KEY; livemode=false uses STRIPE_SK_TEST.
// This lets an owner run a test-mode checkout E2E by flipping billing_config alone
// (livemode + test price ids + test webhook secret) WITHOUT overwriting the live
// secret key — Stripe never re-reveals a live secret key, so overwriting it would be
// unrecoverable. The client is built per-invocation so the choice is always current.
//
// Required edge-function secrets:
//   STRIPE_SECRET_KEY (live), STRIPE_SK_TEST (test E2E)   (SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY injected)

import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { reportError } from "../_shared/reportError.ts";
import { mfaDenialForVerifiedUser } from "../_shared/mfa.ts";
import { type BillingConfig, type OrgUpdate, subscriptionOrgUpdate, PAID_SUBSCRIPTION_STATUSES } from "./webhookLogic.ts";
import { billingReadiness } from "./configGuard.ts";
import { CheckoutError, createDurableCheckout } from "./checkout.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// service-role client: bypasses RLS + the billing-tamper trigger (auth.role()='service_role').
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// Built per-invocation. livemode (the default + current prod) uses STRIPE_SECRET_KEY,
// so the live billing path is UNCHANGED. Only an explicit billing_config.livemode=false
// selects STRIPE_SK_TEST — a missing test key fails closed instead of using live billing.
function stripeClient(key: string): Stripe {
  return new Stripe(key, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
}

const json = (obj: unknown, status = 200, req?: Request) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });

// BillingConfig + the pure webhook->org mapping live in ./webhookLogic.ts (unit-tested).

// Config (price ids + webhook secret) lives in the service-role-only billing_config
// table so it can be provisioned via the Stripe API without writing env secrets at
// runtime. Env is the fallback.
async function loadConfig(): Promise<BillingConfig> {
  const { data, error } = await admin
    .from("billing_config")
    .select("stripe_price_pro, stripe_price_business, stripe_webhook_secret, livemode")
    .eq("scope", "default")
    .maybeSingle();
  if (error) throw new Error("Billing configuration lookup failed");
  const row = data as Record<string, unknown> | null;
  return {
    pricePro: (row?.stripe_price_pro as string) || Deno.env.get("STRIPE_PRICE_PRO") || "",
    priceBusiness: (row?.stripe_price_business as string) || Deno.env.get("STRIPE_PRICE_BUSINESS") || "",
    webhookSecret: (row?.stripe_webhook_secret as string) || Deno.env.get("STRIPE_WEBHOOK_SECRET") || "",
    // A genuinely absent row defaults to LIVE; database failures above abort.
    livemode: row?.livemode !== false,
  };
}

interface BillingSnapshot {
  org_id: string;
  revision: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

function referenceId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

async function eventWasProcessed(eventId: string): Promise<boolean> {
  const { data, error } = await admin.from("billing_events").select("stripe_event_id").eq("stripe_event_id", eventId).maybeSingle();
  if (error) throw new Error("Billing event lookup failed");
  return data?.stripe_event_id === eventId;
}

async function commitEvent(event: Stripe.Event, snapshot: BillingSnapshot | null, subscriptionId: string | null,
  customerId: string | null, created: number | null, previousCreated: number | null, update: OrgUpdate | null): Promise<void> {
  // The RPC validates the snapshot under a row lock and commits the organization
  // and processed marker together. Never fall back to independent writes if the
  // migration is unavailable; a retryable failure is safer than a false receipt.
  const { data, error } = await admin.rpc("apply_stripe_billing_event", {
    p_event_id: event.id, p_event_type: event.type, p_org_id: snapshot?.org_id ?? null,
    p_expected_revision: snapshot?.revision ?? null,
    p_expected_customer: snapshot?.stripe_customer_id ?? null,
    p_expected_subscription: snapshot?.stripe_subscription_id ?? null,
    p_subscription_id: subscriptionId, p_customer_id: customerId,
    p_subscription_created: created, p_previous_subscription_created: previousCreated, p_update: update,
  });
  if (error) {
    // Only this exact durably committed event can turn a unique violation into
    // success. Other constraints can also raise 23505; message text is not proof.
    if (error.code === "23505" && await eventWasProcessed(event.id)) return;
    throw new Error("Atomic billing event application failed");
  }
  if (!["applied", "ignored", "duplicate"].includes(data)) throw new Error("Billing commit was not confirmed");
}

async function handleEvent(stripe: Stripe, event: Stripe.Event, cfg: BillingConfig): Promise<void> {
  const isCheckout = event.type === "checkout.session.completed";
  if (!isCheckout && event.type !== "customer.subscription.updated" && event.type !== "customer.subscription.deleted") {
    await commitEvent(event, null, null, null, null, null, null);
    return;
  }
  const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription;
  const customerId = referenceId(object.customer);
  const subscriptionId = isCheckout ? referenceId((object as Stripe.Checkout.Session).subscription) : object.id;
  let orgId = object.metadata?.org_id || (isCheckout ? (object as Stripe.Checkout.Session).client_reference_id : null);
  if (!orgId && customerId) {
    const { data, error } = await admin.from("organizations").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    if (error) throw new Error("Billing customer lookup failed");
    orgId = data?.id;
  }
  if (!orgId) {
    // A signed event for a genuinely unrelated Stripe customer is a deliberate
    // no-op. A failed lookup above is not evidence of an unrelated customer.
    await commitEvent(event, null, subscriptionId, customerId, null, null, null);
    return;
  }
  if (!customerId || !subscriptionId) throw new Error("Billing event is missing a subscription or customer");
  const { data: snapshot, error } = await admin.rpc("get_stripe_billing_snapshot", { p_org_id: orgId });
  if (error || !snapshot || snapshot.org_id !== orgId || typeof snapshot.revision !== "string" || !/^\d+$/.test(snapshot.revision)) throw new Error("Billing workspace snapshot unavailable");
  if (snapshot.stripe_customer_id && snapshot.stripe_customer_id !== customerId) throw new Error("Billing customer binding mismatch");

  // Snapshot MUST precede every provider read. If another worker applies a newer
  // observation while this worker waits on Stripe, the revision fence rejects
  // this entire transaction and a provider retry retrieves current state again.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.id !== subscriptionId || referenceId(sub.customer) !== customerId || (sub.metadata?.org_id && sub.metadata.org_id !== orgId)) {
    throw new Error("Billing subscription binding mismatch");
  }
  let previousCreated: number | null = null;
  if (snapshot.stripe_subscription_id && snapshot.stripe_subscription_id !== subscriptionId) {
    if (!isCheckout) {
      await commitEvent(event, snapshot, subscriptionId, customerId, sub.created, null, null);
      return;
    }
    const previous = await stripe.subscriptions.retrieve(snapshot.stripe_subscription_id);
    if (previous.id !== snapshot.stripe_subscription_id || referenceId(previous.customer) !== customerId
      || (previous.metadata?.org_id && previous.metadata.org_id !== orgId)) throw new Error("Current billing binding could not be verified");
    if (!Number.isSafeInteger(previous.created) || !Number.isSafeInteger(sub.created) || sub.created === previous.created) {
      throw new Error("Ambiguous billing subscription order requires reconciliation");
    }
    previousCreated = previous.created;
    if (sub.created < previous.created) {
      await commitEvent(event, snapshot, subscriptionId, customerId, sub.created, previousCreated, null);
      return;
    }
  }
  const update = subscriptionOrgUpdate({ ...sub, customer: customerId }, cfg, { deleted: event.type === "customer.subscription.deleted" });
  update.stripe_customer_id = customerId;
  if (update.plan === "free" && PAID_SUBSCRIPTION_STATUSES.includes(sub.status)) {
    await reportError(new Error("Unknown or ambiguous billing price; paid entitlement withheld"), "stripe-billing", { eventType: event.type });
  }
  await commitEvent(event, snapshot, subscriptionId, customerId, sub.created, previousCreated, update);
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    // Every other browser-facing function wraps its handler so an unhandled error
    // returns the standard JSON error envelope WITH CORS headers. Without this,
    // an uncaught throw returned a CORS-less 500 that surfaced in the browser as
    // an opaque CORS failure rather than a readable error. NOTE: the webhook path
    // (Stripe, no browser) handles its own errors above and returns before this;
    // any escape here is an app-action or config failure where CORS matters.
    await reportError(e, "stripe-billing", { unhandled: true });
    return json({ error: "Billing request failed. Please try again." }, 500, req);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);
  const url = new URL(req.url);
  // Load config FIRST so the Stripe client uses the correct key (live vs test) —
  // billing_config is the single source of truth for the live/test environment.
  const cfg = await loadConfig();
  const readiness = billingReadiness({
    livemode: cfg.livemode !== false,
    liveKey: Deno.env.get("STRIPE_SECRET_KEY"),
    testKey: Deno.env.get("STRIPE_SK_TEST"),
    webhook: url.pathname.endsWith("/webhook"),
    webhookSecret: cfg.webhookSecret,
  });
  if (!readiness.ok) return json({ error: readiness.error }, 503, req);
  const stripe = stripeClient(readiness.key);

  // ── Stripe webhook (signature-verified; no JWT) ──
  if (url.pathname.endsWith("/webhook")) {
    const sig = req.headers.get("stripe-signature");
    const raw = await req.text();
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig ?? "", cfg.webhookSecret);
    } catch {
      return new Response("Webhook signature verification failed", { status: 400 });
    }
    try {
      if (event.livemode !== (cfg.livemode !== false)) throw new Error("Billing event mode mismatch");
      if (await eventWasProcessed(event.id)) return new Response("ok (already processed)", { status: 200 });
      await handleEvent(stripe, event, cfg);
    } catch (e) {
      await reportError(e, "stripe-billing", { path: "/webhook", eventType: event.type });
      return new Response("handler error", { status: 500 });
    }
    return new Response("ok", { status: 200 });
  }

  // ── App actions: checkout / portal (JWT-verified) ──
  let body: { action?: string; org_id?: string; plan?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400, req); }
  const { action, org_id, plan } = body;
  if (!org_id) return json({ error: "org_id is required" }, 400, req);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Not authenticated" }, 401, req);
  const mfaDenial = mfaDenialForVerifiedUser(user, authHeader, req);
  if (mfaDenial) return mfaDenial;

  // Only an owner/admin of the org may manage its billing.
  const { data: membership, error: membershipError } = await admin
    .from("organization_members").select("role").eq("org_id", org_id).eq("user_id", user.id).maybeSingle();
  if (membershipError) return json({ error: "Workspace billing access could not be verified" }, 503, req);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return json({ error: "You don't have permission to manage this workspace's billing" }, 403, req);
  }

  // Payment return URLs come from reviewed server configuration. Browser Origin
  // and request-body URLs never choose a checkout or portal redirect.
  const configuredBase = Deno.env.get("STEELBUILD_BASE_URL") || "https://www.steelbuild-pro.com";
  let origin: string;
  try {
    const parsed = new URL(configuredBase);
    if (parsed.origin !== configuredBase || !isAllowedOrigin(configuredBase)) throw new Error("Invalid billing redirect configuration");
    origin = parsed.origin;
  } catch { return json({ error: "Billing return URL is not configured correctly" }, 503, req); }

  if (action === "checkout") {
    const PRICE: Record<string, string> = { pro: cfg.pricePro, business: cfg.priceBusiness };
    const priceId = plan && Object.hasOwn(PRICE, plan) ? PRICE[plan] : "";
    if (!priceId) return json({ error: `Plan "${plan}" isn't available for checkout yet` }, 400, req);

    try {
      const url = await createDurableCheckout(admin, stripe, { orgId: org_id, actorId: user.id,
        plan: plan!, priceId, livemode: cfg.livemode !== false, returnBase: origin });
      return json({ url }, 200, req);
    } catch (error) {
      if (error instanceof CheckoutError) return json({ error: error.message, code: error.code, action: error.action }, error.status, req);
      throw error;
    }
  }

  if (action === "portal") {
    const { data: org, error: orgError } = await admin.from("organizations").select("stripe_customer_id").eq("id", org_id).single();
    if (orgError) return json({ error: "Billing account could not be verified" }, 503, req);
    if (!org?.stripe_customer_id) return json({ error: "No billing account yet — start a subscription first" }, 400, req);
    const portal = await stripe.billingPortal.sessions.create({ customer: org.stripe_customer_id, return_url: `${origin}/Billing` });
    const [currentMember, currentOrg] = await Promise.all([
      admin.from("organization_members").select("role").eq("org_id", org_id).eq("user_id", user.id).maybeSingle(),
      admin.from("organizations").select("stripe_customer_id").eq("id", org_id).maybeSingle(),
    ]);
    if (currentMember.error || currentOrg.error) return json({ error: "Billing access could not be rechecked" }, 503, req);
    if (!currentMember.data || !["owner", "admin"].includes(currentMember.data.role)
      || currentOrg.data?.stripe_customer_id !== org.stripe_customer_id) {
      return json({ error: "Workspace billing access changed. Refresh your workspace before continuing." }, 403, req);
    }
    return json({ url: portal.url }, 200, req);
  }

  return json({ error: "Unknown action" }, 400, req);
}
