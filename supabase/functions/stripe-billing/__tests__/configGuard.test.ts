import { describe, expect, it } from 'vitest';
import { billingReadiness } from '../configGuard';

describe('billing configuration boundary', () => {
  it.each([undefined, '', '   '])('refuses webhook verification with an empty signing secret: %j', (webhookSecret) => {
    expect(billingReadiness({ livemode: true, liveKey: 'fixture-key', webhook: true, webhookSecret }).ok).toBe(false);
  });
  it('requires a payment key even with a webhook signing secret', () => {
    expect(billingReadiness({ livemode: true, webhook: true, webhookSecret: 'fixture-secret' }).ok).toBe(false);
  });
  it('never substitutes the live key when test mode is configured', () => {
    expect(billingReadiness({ livemode: false, liveKey: 'fixture-live', webhook: false }).ok).toBe(false);
    expect(billingReadiness({ livemode: false, liveKey: 'fixture-live', testKey: 'fixture-test', webhook: false })).toEqual({ ok: true, key: 'fixture-test' });
  });
  it('allows checkout without a webhook secret but requires one for webhooks', () => {
    expect(billingReadiness({ livemode: true, liveKey: 'fixture-live', webhook: false }).ok).toBe(true);
    expect(billingReadiness({ livemode: true, liveKey: 'fixture-live', webhook: true, webhookSecret: 'fixture-secret' }).ok).toBe(true);
  });
});
