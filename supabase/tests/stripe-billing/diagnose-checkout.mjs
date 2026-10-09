import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Diagnostic of OPEN gaps, not release acceptance. Executes the current handler
// with synthetic provider/database boundaries; never contacts Stripe or charges.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../../functions/stripe-billing/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const executable = ts.transpileModule(source.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const orgId = '10000000-0000-4000-8000-000000000001';
function fixture(customerId, updateFails = false) {
  let handler;
  const org = { id: orgId, name: 'Synthetic billing customer', stripe_customer_id: customerId, stripe_subscription_id: 'sub_existing_paid', subscription_status: 'active', plan: 'business' };
  const customers = [];
  const checkouts = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-owner', email: 'fixture@example.invalid' } } }) },
    from(table) {
      let payload;
      const result = () => {
        if (table === 'billing_config') return { data: { stripe_price_pro: 'price_pro', stripe_price_business: 'price_business', livemode: true } };
        if (table === 'organization_members') return { data: { role: 'owner' } };
        assert.equal(table, 'organizations');
        if (payload) {
          if (updateFails) return { data: null, error: { message: 'Synthetic binding write failure' } };
          Object.assign(org, payload);
        }
        return { data: { ...org }, error: null };
      };
      const query = { select: () => query, eq: () => query, update: value => { payload = value; return query; },
        maybeSingle: async () => result(), single: async () => result(), then: resolve => Promise.resolve(result()).then(resolve) };
      return query;
    },
  };
  class StripeFixture {
    static createFetchHttpClient() { return {}; }
    customers = { create: async (_params, options) => {
      const customer = { id: `cus_fixture_${customers.length + 1}` };
      customers.push({ ...customer, options });
      return customer;
    } };
    checkout = { sessions: { create: async (params, options) => {
      const result = { id: `cs_fixture_${checkouts.length + 1}`, url: 'https://checkout.example.invalid/' };
      checkouts.push({ ...result, params, options });
      return result;
    } } };
  }
  const bindings = {
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://fixture.invalid', STRIPE_SECRET_KEY: 'sk_fixture' })[name] }, serve: value => { handler = value; } },
    Stripe: StripeFixture, createClient: () => client, corsHeaders: () => ({}), isAllowedOrigin: () => false,
    reportError: async () => {}, mfaDenialForVerifiedUser: () => null, billingReadiness: () => ({ ok: true, key: 'sk_fixture' }),
    subscriptionOrgUpdate: () => { throw new Error('No webhook is exercised'); }, PAID_SUBSCRIPTION_STATUSES: [],
  };
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  const run = () => handler(new Request('https://fixture.invalid/stripe-billing', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token' }, body: JSON.stringify({ action: 'checkout', org_id: orgId, plan: 'pro' }),
  }));
  return { run, customers, checkouts, org };
}
const paid = fixture('cus_existing');
assert.deepEqual((await Promise.all([paid.run(), paid.run()])).map(r => r.status), [200, 200]);
assert.equal(paid.checkouts.length, 2);
assert.ok(paid.checkouts.every(c => c.params.mode === 'subscription' && c.options === undefined));
console.log('CONFIRMED OPEN GAP: two requests for an already-paid workspace create two new subscription sessions without idempotency.');
const unbound = fixture(null, true);
assert.deepEqual((await Promise.all([unbound.run(), unbound.run()])).map(r => r.status), [200, 200]);
assert.equal(unbound.customers.length, 2);
assert.equal(unbound.checkouts.length, 2);
assert.equal(unbound.org.stripe_customer_id, null);
assert.ok(unbound.customers.every(c => c.options === undefined));
console.log('CONFIRMED OPEN GAP: concurrent requests create two customers and two sessions despite failed workspace customer binding writes.');
