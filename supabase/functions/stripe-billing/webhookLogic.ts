// Pure, runtime-agnostic Stripe-webhook -> organization mapping for stripe-billing.
//
// Pure entitlement decisions shared by checkout and subscription events. The
// entrypoint also has actual-handler regressions; atomic database behavior is
// exercised by supabase/tests/stripe-billing. Provider delivery remains a staging
// acceptance check, not something the offline fixtures claim to prove.

export interface BillingConfig {
  pricePro: string;
  priceBusiness: string;
  webhookSecret: string;
  /**
   * Whether to use the LIVE Stripe key (STRIPE_SECRET_KEY) vs the TEST key
   * (STRIPE_SK_TEST). Read off billing_config.livemode in index.ts's stripeClient();
   * the pure webhook→org mapping in this module ignores it. Optional so the unit-test
   * literals stay valid. The entrypoint requires an explicit boolean before
   * selecting any provider key; this pure mapping module does not select modes.
   */
  livemode?: boolean;
}

// Minimal shapes we read off Stripe objects (avoids a Stripe type dependency here).
interface PriceRef { id?: string }
interface SubItem { price?: PriceRef }
export interface SubLike {
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
  if (!priceId || cfg.pricePro === cfg.priceBusiness) return null;
  if (priceId === cfg.pricePro) return "pro";
  if (priceId === cfg.priceBusiness) return "business";
  return null;
}

function epochToIso(sec: number | null | undefined): string | null {
  return sec && Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : null;
}

// Preserve the existing past_due grace policy. Everything else, including new
// or missing provider statuses, has no paid entitlement until explicitly reviewed.
export const PAID_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];

/**
 * checkout.session.completed -> { orgId, update }. `sub` is the subscription the
 * caller already retrieved from Stripe (or null). Returns null when no org id is
 * resolvable or no current subscription was retrieved. Metadata is a routing
 * hint only: it can never override an authoritative price or terminal status.
 */
export function checkoutOrgUpdate(
  session: CheckoutSessionLike,
  sub: SubLike | null,
  cfg: BillingConfig,
): { orgId: string; update: OrgUpdate } | null {
  const orgId = session.metadata?.org_id || session.client_reference_id;
  if (!orgId || !sub) return null;
  const update: OrgUpdate = {
    ...subscriptionOrgUpdate(sub, cfg, { deleted: false }),
    stripe_subscription_id: sub.id ?? session.subscription ?? null,
    stripe_customer_id: session.customer ?? undefined,
  };
  return { orgId, update };
}

/**
 * customer.subscription.updated / .deleted -> the org update payload. The caller
 * resolves the org id (subscription metadata, else a customer lookup) and applies
 * the update. Only configured prices in the explicit grace/status policy grant
 * paid access. Unknown prices never fall back to metadata or an existing plan.
 */
export function subscriptionOrgUpdate(
  sub: SubLike,
  cfg: BillingConfig,
  opts: { deleted: boolean },
): OrgUpdate {
  const { deleted } = opts;
  const status = deleted ? "canceled" : sub.status ?? "unknown";
  const items = sub.items?.data ?? [];
  const plan = items.length === 1 ? priceToPlan(items[0]?.price?.id, cfg) : null;
  return {
    plan: PAID_SUBSCRIPTION_STATUSES.includes(status) ? plan ?? "free" : "free",
    subscription_status: status,
    stripe_subscription_id: sub.id,
    current_period_end: epochToIso(sub.current_period_end),
  };
}
