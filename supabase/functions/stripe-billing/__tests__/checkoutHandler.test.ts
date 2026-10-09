import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { CheckoutError, createDurableCheckout } from '../checkout';

// Actual entrypoint; only external provider/database/runtime boundaries are synthetic.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const executable = ts.transpileModule(source.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const orgId = '10000000-0000-4000-8000-000000000001';
function fixture(customerId: string | null, updateFails = false) {
  let handler: (request: Request) => Promise<Response>;
  const org: Record<string, unknown> = { id: orgId, name: 'Synthetic billing customer', stripe_customer_id: customerId, stripe_subscription_id: 'sub_existing_paid', subscription_status: 'active', plan: 'business' };
  const customers: Array<{ id: string; options: unknown }> = [];
  const checkouts: Array<{ params: Record<string, unknown>; options: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let intent: Record<string, unknown> | null = null;
  let allowed = true;
  let missing = false;
  let customerTimeout = false;
  let sessionTimeout = false;
  let sessionWriteFailure = false;
  let orgReadFailure = false;
  let portalCalls = 0;
  let afterProvider: (() => void) | undefined;
  let sessionStatus = 'open';
  let subscriptions: Array<{ id: string; customer: string; status: string }> = [];
  const customerKeys = new Map<string, { id: string }>();
  const sessionKeys = new Map<string, { id: string; customer: string; mode: string; livemode: boolean; metadata: Record<string, string>; expires_at: number; status: string; url: string }>();
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-owner', email: 'fixture@example.invalid' } } }) },
    from(table: string) {
      let payload: Record<string, unknown> | undefined;
      const result = () => {
        if (table === 'billing_config') return { data: { stripe_price_pro: 'price_pro', stripe_price_business: 'price_business', livemode: true } };
        if (table === 'organization_members') return { data: allowed ? { role: 'owner' } : null };
        if (table !== 'organizations') throw new Error(`Unexpected table ${table}`);
        if (orgReadFailure) return { data: null, error: { message: 'Synthetic organization read failure' } };
        if (missing) return { data: null, error: null };
        if (payload) {
          if (updateFails) return { data: null, error: { message: 'Synthetic binding write failure' } };
          Object.assign(org, payload);
        }
        return { data: { ...org }, error: null };
      };
      const query = { select: () => query, eq: () => query, update: (value: Record<string, unknown>) => { payload = value; return query; },
        maybeSingle: async () => result(), single: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (!allowed || missing) return { data: null, error: { code: missing ? 'P0002' : '42501' } };
      if (name === 'begin_billing_checkout') {
        if (org.stripe_subscription_id && !org.stripe_customer_id) return { data: { decision: 'reconcile' }, error: null };
        if (org.plan !== 'free') return { data: { decision: 'portal' }, error: null };
        if (!intent || intent.state === 'expired') intent = { org_id: orgId, operation_id: intent ? '20000000-0000-4000-8000-000000000002' : '20000000-0000-4000-8000-000000000001',
          plan: args.p_plan, price_id: args.p_price_id, livemode: args.p_livemode, return_base: args.p_return_base, state: 'pending',
          customer_id: org.stripe_customer_id, session_id: null, session_url: null, session_expires_at: null, created_at: new Date().toISOString() };
        return { data: { decision: 'intent', intent: { ...intent } }, error: null };
      }
      if (!intent || intent.operation_id !== args.p_operation_id) return { data: null, error: { code: '40001' } };
      if (name === 'bind_billing_checkout_customer') {
        if (updateFails) return { data: null, error: { code: '40001' } };
        org.stripe_customer_id = args.p_customer_id;
        intent.customer_id = args.p_customer_id;
      } else if (name === 'record_billing_checkout_session') {
        if (sessionWriteFailure) return { data: null, error: { code: '40001' } };
        Object.assign(intent, { state: 'open', session_id: args.p_session_id, session_url: args.p_session_url, session_expires_at: args.p_expires_at });
      } else if (name === 'expire_billing_checkout_intent') intent.state = 'expired';
      else throw new Error(`Unexpected RPC ${name}`);
      return { data: null, error: null };
    },
  };
  class StripeFixture {
    static createFetchHttpClient() { return {}; }
    billingPortal = { sessions: { create: async () => { portalCalls++; afterProvider?.(); return { url: 'https://billing.stripe.com/p/session/fixture' }; } } };
    customers = { create: async (_params: unknown, options: { idempotencyKey: string }) => {
      const saved = customerKeys.get(options.idempotencyKey);
      if (saved) return saved;
      const customer = { id: `cus_fixture_${customers.length + 1}` };
      customers.push({ ...customer, options }); customerKeys.set(options.idempotencyKey, customer);
      afterProvider?.();
      if (customerTimeout) { customerTimeout = false; throw new Error('Synthetic lost customer response'); }
      return customer;
    } };
    subscriptions = { list: async (params: { starting_after?: string }) => {
      afterProvider?.();
      const start = params.starting_after ? subscriptions.findIndex(s => s.id === params.starting_after) + 1 : 0;
      return { data: subscriptions.slice(start, start + 100), has_more: start + 100 < subscriptions.length };
    } };
    checkout = { sessions: { create: async (params: Record<string, unknown>, options: { idempotencyKey: string }) => {
      const saved = sessionKeys.get(options.idempotencyKey);
      if (saved) return saved;
      const result = { id: `cs_fixture_${checkouts.length + 1}`, customer: params.customer as string, mode: 'subscription', livemode: true,
        metadata: params.metadata as Record<string, string>, expires_at: Math.floor(Date.now() / 1000) + 3600, status: 'open', url: 'https://checkout.stripe.com/c/pay/fixture' };
      checkouts.push({ params, options }); sessionKeys.set(options.idempotencyKey, result);
      afterProvider?.();
      if (sessionTimeout) { sessionTimeout = false; throw new Error('Synthetic lost session response'); }
      return result;
    }, retrieve: async (id: string) => {
      const session = [...sessionKeys.values()].find(s => s.id === id);
      if (!session) throw new Error('Unknown provider session');
      afterProvider?.();
      return { ...session, status: sessionStatus };
    } } };
  }
  const bindings = {
    Deno: { env: { get: (name: string) => ({ SUPABASE_URL: 'https://fixture.invalid', STRIPE_SECRET_KEY: 'sk_fixture' })[name] }, serve: (value: typeof handler) => { handler = value; } },
    Stripe: StripeFixture, createClient: () => client, corsHeaders: () => ({}), isAllowedOrigin: (base: string) => base === 'https://www.steelbuild-pro.com',
    reportError: async () => {}, mfaDenialForVerifiedUser: () => null, billingReadiness: () => ({ ok: true, key: 'sk_fixture' }),
    subscriptionOrgUpdate: () => { throw new Error('No webhook is exercised'); }, PAID_SUBSCRIPTION_STATUSES: [],
    CheckoutError, createDurableCheckout,
  };
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  const run = (plan = 'pro', action = 'checkout') => handler(new Request('https://fixture.invalid/stripe-billing', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token', Origin: 'https://attacker.invalid' },
    body: JSON.stringify({ action, org_id: orgId, plan, actor_id: 'attacker' }),
  }));
  return { run, customers, checkouts, org, rpcCalls, free() { org.plan = 'free'; org.subscription_status = null; org.stripe_subscription_id = null; },
    loseCustomerResponse() { customerTimeout = true; }, loseSessionResponse() { sessionTimeout = true; },
    failSessionWrite(value: boolean) { sessionWriteFailure = value; }, revoke() { allowed = false; }, erase() { missing = true; },
    afterProvider(callback: () => void) { afterProvider = callback; }, getIntent() { return intent; },
    failOrgRead() { orgReadFailure = true; }, get portalCalls() { return portalCalls; },
    setProviderStatus(status: string) { sessionStatus = status; }, setSubscriptions(rows: typeof subscriptions) { subscriptions = rows; },
    expireSession() { for (const session of sessionKeys.values()) session.expires_at = Math.floor(Date.now() / 1000) - 10;
      sessionStatus = 'expired'; intent!.session_expires_at = new Date([...sessionKeys.values()][0].expires_at * 1000).toISOString(); },
  };
}
describe('checkout entrypoint duplicate-charge boundary', () => {
  it('directs simultaneous requests from an existing paid workspace to its portal', async () => {
    const app = fixture('cus_existing');
    const responses = await Promise.all([app.run(), app.run()]);
    expect(responses.map(r => r.status)).toEqual([409, 409]);
    expect(app.checkouts).toHaveLength(0);
    expect(app.customers).toHaveLength(0);
  });
  it('does not return payable sessions after a customer binding write fails', async () => {
    const app = fixture(null, true);
    app.org.plan = 'free';
    app.org.subscription_status = null;
    app.org.stripe_subscription_id = null;
    const responses = await Promise.all([app.run(), app.run()]);
    expect(responses.every(r => r.status >= 500)).toBe(true);
    expect(app.checkouts).toHaveLength(0);
  });
  it('concurrent requests share one customer, one provider session and a durable URL', async () => {
    const app = fixture(null); app.free();
    const responses = await Promise.all(Array.from({ length: 8 }, () => app.run()));
    expect(responses.map(r => r.status)).toEqual(Array(8).fill(200));
    expect(app.customers).toHaveLength(1); expect(app.checkouts).toHaveLength(1);
    expect(app.rpcCalls.every(call => call.args.p_actor_id === 'fixture-owner')).toBe(true);
    expect(app.checkouts[0].params.success_url).toBe('https://www.steelbuild-pro.com/Billing?status=success');
  });
  it.each(['Customer', 'Session'] as const)('retries a lost %s response using the same provider idempotency key', async kind => {
    const app = fixture(null); app.free();
    if (kind === 'Customer') app.loseCustomerResponse(); else app.loseSessionResponse();
    expect((await app.run()).status).toBe(500);
    expect((await app.run()).status).toBe(200);
    expect(app.customers).toHaveLength(1); expect(app.checkouts).toHaveLength(1);
  });
  it('recovers a failed session receipt without creating another payable session', async () => {
    const app = fixture(null); app.free(); app.failSessionWrite(true);
    expect((await app.run()).status).toBe(503);
    app.failSessionWrite(false);
    expect((await app.run()).status).toBe(200);
    expect(app.checkouts).toHaveLength(1);
  });
  it.each(['active', 'trialing', 'past_due', 'incomplete', 'unpaid', 'paused', 'unknown'])('blocks new checkout for provider %s subscriptions', async status => {
    const app = fixture('cus_existing'); app.free();
    app.setSubscriptions([{ id: 'sub_provider', customer: 'cus_existing', status }]);
    expect((await app.run()).status).toBe(409); expect(app.checkouts).toHaveLength(0);
  });
  it('rechecks provider subscriptions before returning an existing open session', async () => {
    const app = fixture('cus_existing'); app.free(); expect((await app.run()).status).toBe(200);
    app.setSubscriptions([{ id: 'sub_other', customer: 'cus_existing', status: 'active' }]);
    expect((await app.run()).status).toBe(409); expect(app.checkouts).toHaveLength(1);
  });
  it('reuses an open session and refuses another plan while it remains open', async () => {
    const app = fixture(null); app.free(); expect((await app.run()).status).toBe(200);
    expect((await app.run()).status).toBe(200); expect((await app.run('business')).status).toBe(409);
    expect(app.checkouts).toHaveLength(1);
  });
  it('never renews an unresolved provider outcome after 23 hours', async () => {
    const app = fixture(null); app.free(); app.loseCustomerResponse(); await app.run();
    app.getIntent()!.created_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect((await app.run()).status).toBe(409); expect(app.checkouts).toHaveLength(0); expect(app.customers).toHaveLength(1);
  });
  it.each(['complete', 'unexpected'])('does not replace a provider %s session', async status => {
    const app = fixture(null); app.free(); expect((await app.run()).status).toBe(200);
    app.setProviderStatus(status); expect((await app.run()).status).toBe(409); expect(app.checkouts).toHaveLength(1);
  });
  it('renews only a provider-confirmed expired session without an outstanding subscription', async () => {
    const app = fixture(null); app.free(); expect((await app.run()).status).toBe(200);
    app.expireSession(); app.setProviderStatus('expired');
    const response = await app.run();
    expect(response.status).toBe(200);
    expect(app.checkouts).toHaveLength(2);
    expect(app.getIntent()!.operation_id).toBe('20000000-0000-4000-8000-000000000002');
  });
  it.each(['revoke', 'erase'] as const)('does not publish a checkout URL after workspace %s during provider work', async action => {
    const app = fixture(null); app.free(); app.afterProvider(() => app[action]());
    expect((await app.run()).status).toBe(403); expect(app.checkouts).toHaveLength(0);
  });
  it.each(['revoke', 'erase'] as const)('does not publish the session created just before workspace %s', async action => {
    const app = fixture(null); app.free(); app.afterProvider(() => { if (app.checkouts.length) app[action](); });
    const response = await app.run();
    expect(response.status).toBe(403); expect(app.checkouts).toHaveLength(1);
    expect((await response.json()).url).toBeUndefined();
  });
  it('checks later provider pages instead of assuming an empty first-page active filter', async () => {
    const app = fixture('cus_existing'); app.free();
    app.setSubscriptions(Array.from({ length: 101 }, (_, n) => ({ id: `sub_${n}`, customer: 'cus_existing', status: n === 100 ? 'active' : 'canceled' })));
    expect((await app.run()).status).toBe(409); expect(app.checkouts).toHaveLength(0);
  });
  it('does not treat a capped provider history as complete evidence', async () => {
    const app = fixture('cus_existing'); app.free();
    app.setSubscriptions(Array.from({ length: 1001 }, (_, n) => ({ id: `sub_${n}`, customer: 'cus_existing', status: 'canceled' })));
    expect((await app.run()).status).toBe(409); expect(app.checkouts).toHaveLength(0);
  });
  it('preserves the existing subscription portal flow', async () => {
    const app = fixture('cus_existing');
    const response = await app.run('pro','portal');
    expect(response.status).toBe(200); expect((await response.json()).url).toContain('billing.stripe.com');
    expect(app.checkouts).toHaveLength(0);
  });
  it('does not create a portal session from an uncertain customer read', async () => {
    const app = fixture('cus_existing'); app.failOrgRead();
    expect((await app.run('pro','portal')).status).toBe(503); expect(app.portalCalls).toBe(0);
  });
  it.each(['revoke','erase'] as const)('does not publish a portal URL after workspace %s', async action => {
    const app = fixture('cus_existing'); app.afterProvider(() => app[action]());
    const response = await app.run('pro','portal');
    expect(response.status).toBe(403); expect((await response.json()).url).toBeUndefined();
  });
  it('does not publish a portal URL when its customer binding changes during provider work', async () => {
    const app = fixture('cus_existing'); app.afterProvider(() => { app.org.stripe_customer_id='cus_other'; });
    const response = await app.run('pro','portal');
    expect(response.status).toBe(403); expect((await response.json()).url).toBeUndefined();
  });
  it('does not publish a portal URL when post-provider access reads fail', async () => {
    const app = fixture('cus_existing'); app.afterProvider(() => app.failOrgRead());
    const response = await app.run('pro','portal');
    expect(response.status).toBe(503); expect((await response.json()).url).toBeUndefined();
  });
});
