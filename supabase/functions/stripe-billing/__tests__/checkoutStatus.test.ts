import { describe, expect, it } from 'vitest';
import { assessCheckoutStatus } from '../checkoutStatus';

const session = { id: 'cs_test_example123', mode: 'subscription', livemode: false, status: 'complete', payment_status: 'paid',
  customer: 'cus_example', subscription: 'sub_new', client_reference_id: 'org-a', metadata: { org_id: 'org-a', plan: 'pro' } };
const org = { stripe_customer_id: 'cus_example', stripe_subscription_id: 'sub_new', plan: 'pro', subscription_status: 'active' };

describe('checkout confirmation uses the exact provider session and webhook-backed entitlement', () => {
  it('confirms only when the paid session and installed subscription agree', () => {
    expect(assessCheckoutStatus(session, org, 'org-a', false)).toEqual({ state: 'confirmed', plan: 'pro' });
  });
  it.each([
    { stripe_subscription_id: 'sub_old' }, { plan: 'free' }, { subscription_status: 'past_due' },
  ])('waits for delayed or incomplete webhook state: %j', patch => {
    expect(assessCheckoutStatus(session, { ...org, ...patch }, 'org-a', false)).toEqual({ state: 'pending' });
  });
  it.each([
    { metadata: { org_id: 'org-b', plan: 'pro' } }, { client_reference_id: 'org-b' },
    { customer: 'cus_foreign' }, { livemode: true }, { mode: 'payment' },
  ])('does not disclose a foreign/mismatched checkout: %j', patch => {
    expect(() => assessCheckoutStatus({ ...session, ...patch }, org, 'org-a', false)).toThrow('Checkout could not be verified for this workspace');
  });
  it('accepts expanded provider references without trusting client values', () => {
    expect(assessCheckoutStatus({ ...session, customer: { id: 'cus_example' }, subscription: { id: 'sub_new' } }, org, 'org-a', false)).toEqual({ state: 'confirmed', plan: 'pro' });
  });
  it('never confirms an unpaid or open session, or an unknown price-derived plan', () => {
    for (const patch of [{ payment_status: 'unpaid' }, { status: 'open' }, { metadata: { org_id: 'org-a', plan: 'enterprise' } }]) {
      expect(assessCheckoutStatus({ ...session, ...patch }, org, 'org-a', false)).toEqual({ state: 'pending' });
    }
  });
  it('returns expired without suggesting a payment succeeded', () => {
    expect(assessCheckoutStatus({ ...session, status: 'expired' }, org, 'org-a', false)).toEqual({ state: 'expired' });
  });
  it('permits a completed trial only after its matching entitlement is installed', () => {
    expect(assessCheckoutStatus({ ...session, payment_status: 'no_payment_required' }, { ...org, subscription_status: 'trialing' }, 'org-a', false)).toEqual({ state: 'confirmed', plan: 'pro' });
  });
});
