import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { assessCheckoutStatus } from '../checkoutStatus';
import { mfaDenialForVerifiedUser } from '../../_shared/mfa';

// Execute the actual handler; only provider, database and runtime boundaries are mocked.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const handlerSource = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'handleRequest')!;
const executable = ts.transpileModule(handlerSource.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  let allowed = true;
  let readError = false;
  const user = { id: 'actor', factors: [] as { status: string }[] };
  const session = { mode: 'subscription', livemode: false, status: 'complete', payment_status: 'paid', customer: 'cus_example',
    subscription: 'sub_new', client_reference_id: 'org-a', metadata: { org_id: 'org-a', plan: 'pro' } };
  const org = { stripe_customer_id: 'cus_example', stripe_subscription_id: 'sub_new', plan: 'pro', subscription_status: 'active' };
  const writes = vi.fn(() => { throw new Error('Confirmation must never write'); });
  const retrieve = vi.fn(async () => session);
  const client = { auth: { getUser: async () => ({ data: { user } }) }, from: (table: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({
      data: table === 'organization_members' ? (allowed ? { role: 'owner' } : null) : org,
      error: readError ? new Error('database unavailable') : null,
    }), insert: writes, update: writes, delete: writes };
    return query;
  } };
  const bindings = { Response, Request, URL, Promise, console, assessCheckoutStatus, mfaDenialForVerifiedUser,
    loadConfig: async () => ({ livemode: false, webhookSecret: 'test', pricePro: 'price_pro' }),
    billingReadiness: () => ({ ok: true, key: 'test-key' }), stripeClient: () => ({ checkout: { sessions: { retrieve, create: writes } } }),
    Deno: { env: { get: () => 'test-value' } }, createClient: () => client, admin: client, SUPABASE_URL: 'https://fixture.invalid', ANON_KEY: 'anon',
    json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }), reportError: writes, corsHeaders: () => ({}),
  };
  const runHandler = new Function(...Object.keys(bindings), `${executable}; return handleRequest;`)(...Object.values(bindings)) as (request: Request) => Promise<Response>;
  const run = (sessionId: unknown = 'cs_test_example123') => runHandler(new Request('https://fixture.invalid/stripe-billing', {
    method: 'POST', headers: { authorization: `Bearer header.${btoa(JSON.stringify({ sub: 'actor', aal: 'aal1' }))}.signature` },
    body: JSON.stringify({ action: 'checkout-status', org_id: 'org-a', session_id: sessionId }),
  }));
  return { run, user, session, org, writes, retrieve, revoke: () => { allowed = false; }, failRead: () => { readError = true; } };
}

describe('read-only checkout status authorization', () => {
  it('confirms the exact installed session without creating a checkout or changing entitlements', async () => {
    const view = fixture(); const response = await view.run();
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ state: 'confirmed', plan: 'pro' });
    expect(view.writes).not.toHaveBeenCalled();
  });
  it('denies an enrolled AAL1 token before any provider access', async () => {
    const view = fixture(); view.user.factors = [{ status: 'verified' }];
    const response = await view.run(); expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'mfa_required' }); expect(view.retrieve).not.toHaveBeenCalled();
  });
  it('denies a non-manager before reading the provider session', async () => {
    const view = fixture(); view.revoke(); expect((await view.run()).status).toBe(403); expect(view.retrieve).not.toHaveBeenCalled();
  });
  it('rechecks membership after a provider await before disclosing confirmation', async () => {
    const view = fixture(); view.retrieve.mockImplementationOnce(async () => { view.revoke(); return view.session; });
    expect((await view.run()).status).toBe(403); expect(view.writes).not.toHaveBeenCalled();
  });
  it('returns 503 on failed authorization reads rather than assuming ownership', async () => {
    const view = fixture(); view.failRead(); expect((await view.run()).status).toBe(503); expect(view.retrieve).not.toHaveBeenCalled();
  });
  it('rejects another workspace session without exposing its contents', async () => {
    const view = fixture(); view.session.metadata.org_id = 'org-b'; const response = await view.run();
    expect(response.status).toBe(403); expect(JSON.stringify(await response.json())).not.toContain('org-b');
  });
  it.each([null, {}, 'invalid', 'cs_' + 'x'.repeat(250)])('rejects invalid session ids before provider reads: %j', async id => {
    const view = fixture(); expect((await view.run(id)).status).toBe(400); expect(view.retrieve).not.toHaveBeenCalled();
  });
});
