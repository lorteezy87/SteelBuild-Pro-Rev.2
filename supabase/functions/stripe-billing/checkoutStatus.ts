/** Read-only confirmation. Only the signed webhook may install entitlements. */
export interface CheckoutStatusSession {
  mode: string | null;
  livemode: boolean;
  status: string | null;
  payment_status: string;
  customer: string | { id: string } | null;
  subscription: string | { id: string } | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
}
export interface CheckoutStatusOrg {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string;
  subscription_status: string | null;
}
export type CheckoutStatus = { state: 'confirmed'; plan: 'pro' | 'business' } | { state: 'pending' | 'expired' };
const referenceId = (value: string | { id: string } | null): string | null => typeof value === 'string' ? value : value?.id ?? null;

export function assessCheckoutStatus(session: CheckoutStatusSession, org: CheckoutStatusOrg, orgId: string, livemode: boolean): CheckoutStatus {
  if (session.mode !== 'subscription' || session.livemode !== livemode || session.metadata?.org_id !== orgId ||
      session.client_reference_id !== orgId || !org.stripe_customer_id || referenceId(session.customer) !== org.stripe_customer_id) {
    throw new Error('Checkout could not be verified for this workspace');
  }
  if (session.status === 'expired') return { state: 'expired' };
  const plan = session.metadata?.plan;
  const subscription = referenceId(session.subscription);
  if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status) ||
      !subscription || subscription !== org.stripe_subscription_id || (plan !== 'pro' && plan !== 'business') ||
      org.plan !== plan || !['active', 'trialing'].includes(org.subscription_status ?? '')) return { state: 'pending' };
  return { state: 'confirmed', plan };
}
