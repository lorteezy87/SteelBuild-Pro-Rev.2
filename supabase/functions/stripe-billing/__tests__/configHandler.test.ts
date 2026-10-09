import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { billingReadiness } from '../configGuard';

// Execute the real entrypoint with synthetic runtime/provider/database boundaries.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const executable = ts.transpileModule(source.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
type Action = 'checkout' | 'portal' | 'webhook';
type Handler = (request: Request) => Promise<Response>;

function fixture(row: unknown, options: { lookup?: 'returned-error' | 'throw'; testKey?: boolean } = {}) {
  let handler: Handler | undefined;
  const providerKeys: string[] = [];
  const signingSecrets: string[] = [];
  const reads: string[] = [];
  const reports: unknown[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from(table: string) {
      const query = {
        select() { return query; }, eq() { return query; },
        async maybeSingle() {
          reads.push(table);
          if (table === 'billing_config') {
            if (options.lookup === 'throw') throw new Error('Synthetic unavailable database');
            return { data: row, error: options.lookup === 'returned-error' ? { message: 'Synthetic lookup error' } : null };
          }
          if (table === 'billing_events') return { data: { stripe_event_id: 'evt_existing' }, error: null };
          throw new Error(`Unexpected table ${table}`);
        },
      };
      return query;
    },
  };
  class StripeFixture {
    constructor(key: string) { providerKeys.push(key); }
    static createFetchHttpClient() { return {}; }
    webhooks = { constructEventAsync: async (body: string, signature: string, signingSecret: string) => {
      signingSecrets.push(signingSecret);
      if (signature !== 'valid-fixture-signature') throw new Error('Synthetic invalid signature');
      return JSON.parse(body);
    } };
  }
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://fixture.invalid', STRIPE_SECRET_KEY: 'fixture-live-key',
    STRIPE_PRICE_PRO: 'price_fixture_pro', STRIPE_PRICE_BUSINESS: 'price_fixture_business',
    STRIPE_WEBHOOK_SECRET: 'fixture-signing-secret',
    ...(options.testKey === false ? {} : { STRIPE_SK_TEST: 'fixture-test-key' }),
  };
  const bindings = {
    Deno: { env: { get: (name: string) => env[name] }, serve: (value: Handler) => { handler = value; } },
    Stripe: StripeFixture, createClient: () => client, billingReadiness,
    corsHeaders: () => ({ 'Access-Control-Allow-Origin': 'https://www.steelbuild-pro.com' }),
    reportError: async (error: unknown) => { reports.push(error); },
  };
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  if (!handler) throw new Error('Entrypoint failed to register');
  return {
    providerKeys, signingSecrets, reads, reports,
    run: (action: Action, livemode = false, signature = 'valid-fixture-signature') => handler!(new Request(
      `https://fixture.invalid/stripe-billing${action === 'webhook' ? '/webhook' : ''}`, {
        method: 'POST', headers: { 'stripe-signature': signature },
        body: JSON.stringify(action === 'webhook' ? { id: 'evt_existing', type: 'invoice.created', livemode } : { action, org_id: 'fixture-org', plan: 'pro' }),
      },
    )),
  };
}

const invalidConfigurations: Array<{ name: string; row: unknown }> = [
    { name: 'missing row', row: null },
    { name: 'missing mode', row: {} },
    { name: 'null mode', row: { livemode: null } },
    { name: 'string false', row: { livemode: 'false' } },
    { name: 'string true', row: { livemode: 'true' } },
    { name: 'numeric zero', row: { livemode: 0 } },
    { name: 'numeric one', row: { livemode: 1 } },
];

describe.each(['checkout', 'portal', 'webhook'] as const)('%s explicit billing configuration', action => {
  it.each(invalidConfigurations)('refuses $name before constructing or accessing Stripe', async ({ row }) => {
    const app = fixture(row);
    const response = await app.run(action);
    expect(response.status).toBe(503);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://www.steelbuild-pro.com');
    expect(app.providerKeys).toEqual([]);
    expect(app.reads).toEqual(['billing_config']);
  });
  it.each(['returned-error', 'throw'] as const)('refuses a %s configuration lookup before Stripe', async lookup => {
    const app = fixture({ livemode: false }, { lookup });
    expect((await app.run(action)).status).toBe(503);
    expect(app.providerKeys).toEqual([]);
    expect(app.reads).toEqual(['billing_config']);
  });
  it.each([false, true])('uses only the explicitly selected mode %s and preserves the signing fallback', async livemode => {
    const app = fixture({ livemode });
    expect((await app.run(action, livemode)).status).toBe(action === 'webhook' ? 200 : 401);
    expect(app.providerKeys).toEqual([livemode ? 'fixture-live-key' : 'fixture-test-key']);
    expect(app.signingSecrets).toEqual(action === 'webhook' ? ['fixture-signing-secret'] : []);
  });
});

it('does not replace a missing test key with the available live key', async () => {
  const app = fixture({ livemode: false }, { testKey: false });
  expect((await app.run('checkout')).status).toBe(503);
  expect(app.providerKeys).toEqual([]);
});

it.each([false, true])('retains signed-webhook mode and signature checks for explicit mode %s', async livemode => {
  const app = fixture({ livemode });
  expect((await app.run('webhook', livemode, 'invalid-signature')).status).toBe(400);
  expect((await app.run('webhook', !livemode)).status).toBe(500);
  expect(app.reads).toEqual(['billing_config', 'billing_config']);
});
