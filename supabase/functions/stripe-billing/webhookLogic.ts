// Pure, runtime-agnostic Stripe-webhook -> organization mapping for stripe-billing.
//
// Extracted from index.ts so the org-update computation can be unit-tested under
// Vitest (the Deno function itself can't be imported into the node test harness —
// it uses Deno.serve / Deno.env / esm.sh imports). index.ts keeps ALL side effects
// (the Stripe API calls + the service-role DB writes); this module only computes
// the org-update payloads. Keep it free of Deno globals and esm.sh imports so both
// the Deno function and the Vitest test can import it.
//
// NOTE: this covers the handler's org-mapping logic — the part most likely to
// regress. It does NOT cover Stripe signature verification or the actual DB write;
// those are proven by the owner-run test-mode webhook E2E (see docs/stripe-go-live.md).

export interface BillingConfig {
  pricePro: string;
  priceBusiness: string;
  webhookSecret: string;
}

// Minimal shapes we read off Stripe objects (avoids a Stripe type dependency here).
interface PriceRef { id?: string }
interface SubItem { price?: PriceRef }
interface SubLike {
  id?: string;
  status?: string;
  current_period_end?: number | null;
  items?: { data?: SubItem[] };
  metadata?: Record<string, string> | null;
  customer?: string | null;
}
interface CheckoutSessionLike {
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
  subscription?: string | null;
  customer?: string | null;
}

export interface OrgUpdate {
  plan?: string;
  subscription_status?: string;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string;
  current_period_end?: string | null;
}

export function priceToPlan(priceId: string | undefined, cfg: BillingConfig): string | null {
  if (!priceId) return null;
  if (priceId === cfg.pricePro) return "pro";
  if (priceId === cfg.priceBusiness) return "business";
  return null;
}

function epochToIso(sec: number | null | undefined): string | null {
  return sec ? new Date(sec * 1000).toISOString() : null;
}

/**
 * checkout.session.completed -> { orgId, update }. `sub` is the subscription the
 * caller already retrieved from Stripe (or null). Returns null when no org id is
 * resolvable (caller should no-op). Byte-for-byte the prior inline logic.
 */
export function checkoutOrgUpdate(
  session: CheckoutSessionLike,
  sub: SubLike | null,
  cfg: BillingConfig,
): { orgId: string; update: OrgUpdate } | null {
  const orgId = session.metadata?.org_id || session.client_reference_id;
  if (!orgId) return null;
  const plan = session.metadata?.plan || priceToPlan(sub?.items?.data?.[0]?.price?.id, cfg) || "pro";
  const update: OrgUpdate = {
    plan,
    subscription_status: sub?.status ?? "active",
    stripe_subscription_id: session.subscription ?? null,
    stripe_customer_id: session.customer ?? undefined,
    current_period_end: epochToIso(sub?.current_period_end),
  };
  return { orgId, update };
}

/**
 * customer.subscription.updated / .deleted -> the org update payload. The caller
 * resolves the org id (subscription metadata, else a customer lookup) and applies
 * the update. Byte-for-byte the prior inline logic (deleted -> free/canceled).
 */
export function subscriptionOrgUpdate(
  sub: SubLike,
  cfg: BillingConfig,
  opts: { deleted: boolean },
): OrgUpdate {
  const { deleted } = opts;
  return {
    plan: deleted ? "free" : (priceToPlan(sub.items?.data?.[0]?.price?.id, cfg) ?? sub.metadata?.plan ?? undefined),
    subscription_status: deleted ? "canceled" : sub.status,
    stripe_subscription_id: sub.id,
    current_period_end: epochToIso(sub.current_period_end),
  };
}
