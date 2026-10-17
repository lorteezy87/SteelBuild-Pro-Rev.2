import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { assertEnvironment, ORIGIN, verifyIdentity } from './acceptance.ts';

const env = process.env;
const report: Record<string, unknown> = { candidate: env.ACCEPTANCE_CANDIDATE_SHA,
  projectRef: 'ndyfjffsulfbwpmwdmic', status: 'INCOMPLETE', cases: [] };
const cases: Array<{ name: string; passed: boolean }> = [];
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
let stage = 'environment';
let token: string | undefined;
async function request(path: string, body?: Record<string, unknown>) {
  const response = await fetch(ORIGIN + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { apikey: env.E2E_SUPABASE_ANON_KEY!, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value: unknown = await response.json().catch(() => null);
  return { status: response.status, value };
}
try {
  assertEnvironment(env);
  if (env.E2E_USER !== 'staging.pm@steelbuild-pro.invalid' || !['start', 'verify'].includes(env.BILLING_ACTION ?? '')) throw new Error();
  stage = 'authenticate synthetic account';
  const session = await request('/auth/v1/token?grant_type=password', { email: env.E2E_USER, password: env.E2E_PASS });
  if (session.status !== 200 || !row(session.value) || typeof session.value.access_token !== 'string') throw new Error();
  token = session.value.access_token;
  const user = await request('/auth/v1/user');
  const identity = verifyIdentity(session.value, user.value, env.E2E_USER);
  if (identity.verifiedFactors !== 0) throw new Error();
  let orgId = env.BILLING_ORG_ID ?? '';
  if (env.BILLING_ACTION === 'start') {
    if (orgId || env.BILLING_SESSION_ID) throw new Error();
    stage = 'create disposable billing workspace';
    const created = await request('/rest/v1/rpc/create_organization', { p_name: `STAGING billing 557 ${randomUUID()}`, p_slug: null });
    if (created.status !== 200 || !row(created.value) || typeof created.value.id !== 'string') throw new Error();
    orgId = created.value.id;
    report.orgId = orgId; // Retained even if a later provider request fails.
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(orgId)) throw new Error();
  stage = 'verify disposable owner scope';
  const org = await request(`/rest/v1/organizations?id=eq.${orgId}&select=id,name,plan,subscription_status,stripe_customer_id,stripe_subscription_id`);
  if (org.status !== 200 || !Array.isArray(org.value) || org.value.length !== 1 || !row(org.value[0]) ||
      !String(org.value[0].name).startsWith('STAGING billing 557 ')) throw new Error();
  report.orgId = orgId;
  report.workspace = org.value[0];
  if (env.BILLING_ACTION === 'start') {
    if (org.value[0].plan !== 'free' || org.value[0].stripe_customer_id || org.value[0].stripe_subscription_id) throw new Error();
    stage = 'start test checkout';
    const first = await request('/functions/v1/stripe-billing', { action: 'checkout', plan: 'pro', org_id: orgId });
    report.checkoutHttpStatus = first.status;
    if (first.status !== 200 || !row(first.value) || typeof first.value.url !== 'string') throw new Error();
    const url = new URL(first.value.url);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || !url.pathname.includes('cs_test_')) throw new Error();
    // Test-only Checkout is intentionally handed to the browser operator. Never
    // retain Auth sessions, API keys, passwords or webhook secrets in artifacts.
    report.testCheckoutUrl = url.href;
    stage = 'verify repeat checkout reuses provider session';
    const repeated = await request('/functions/v1/stripe-billing', { action: 'checkout', plan: 'pro', org_id: orgId });
    cases.push({ name: 'Repeated checkout returns exact same test session', passed: repeated.status === 200 && row(repeated.value) && repeated.value.url === url.href });
  } else {
    stage = 'read exact test-session confirmation';
    if (!/^cs_test_[A-Za-z0-9_]{6,230}$/.test(env.BILLING_SESSION_ID ?? '')) throw new Error();
    const reply = await request('/functions/v1/stripe-billing', { action: 'checkout-status', org_id: orgId, session_id: env.BILLING_SESSION_ID });
    report.confirmation = { httpStatus: reply.status, state: row(reply.value) ? reply.value.state : null };
    const receipts = await request(`/rest/v1/billing_events?org_id=eq.${orgId}&select=stripe_event_id,type`);
    if (receipts.status !== 200 || !Array.isArray(receipts.value)) throw new Error();
    report.receipts = receipts.value;
    cases.push({ name: 'Exact session confirmation is readable by workspace owner', passed: reply.status === 200 });
  }
  report.cases = cases;
  if (cases.some(result => !result.passed)) throw new Error();
} catch { report.status = 'FAIL'; report.failedStage = stage; }
await mkdir('test-results/backend-acceptance', { recursive: true });
await writeFile('test-results/backend-acceptance/billing.json', JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(`Staging billing probe: ${report.status}; stage=${stage}`);
// A test Checkout URL or status snapshot alone is never a green release gate.
process.exitCode = report.status === 'FAIL' ? 1 : 2;
