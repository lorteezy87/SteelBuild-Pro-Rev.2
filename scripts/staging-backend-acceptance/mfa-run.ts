import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { assertEnvironment, ORIGIN, PROJECT_ID, ORG_ID, verifyIdentity } from './acceptance.ts';
import { totp } from './totp.ts';

type Row = Record<string, unknown>;
const row = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const env = process.env;
const cases: Array<{ name: string; status: string }> = [];
let factorId: string | undefined;
let cleanupToken: string | undefined;
let stage = 'environment';
const record = (name: string, passed: boolean) => { cases.push({ name, status: passed ? 'PASS' : 'FAIL' }); };

// Fixed staging origin, closed request profiles, no redirects or response logging.
async function request(path: string, token?: string, body?: Row, method = body ? 'POST' : 'GET') {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid path');
  const response = await fetch(ORIGIN + path, { method, redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { apikey: env.E2E_SUPABASE_ANON_KEY!, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value: unknown = await response.json().catch(() => null);
  return { status: response.status, value };
}

async function login() {
  const session = await request('/auth/v1/token?grant_type=password', undefined,
    { email: env.E2E_USER, password: env.E2E_PASS });
  if (session.status !== 200 || !row(session.value) || typeof session.value.access_token !== 'string') throw new Error('Login failed');
  const user = await request('/auth/v1/user', session.value.access_token);
  const identity = verifyIdentity(session.value, user.value, env.E2E_USER!);
  return { identity, user: user.value };
}

try {
  assertEnvironment(env);
  if (env.E2E_USER !== 'staging.pm@steelbuild-pro.invalid') throw new Error('Synthetic identity required');
  stage = 'initial synthetic login';
  const initial = await login();
  if (initial.identity.verifiedFactors !== 0 || !row(initial.user) ||
      (Array.isArray(initial.user.factors) && initial.user.factors.length !== 0)) throw new Error('Existing factors must not be altered');
  const organization = await request(`/rest/v1/organizations?id=eq.${ORG_ID}&select=id,name`, initial.identity.token);
  if (organization.status !== 200 || !Array.isArray(organization.value) || organization.value.length !== 1 ||
      !row(organization.value[0]) || organization.value[0].name !== 'Example Fabrication (staging)') throw new Error('Fixture identity not established');
  stage = 'enroll temporary factor';
  cleanupToken = initial.identity.token;
  const enrolled = await request('/auth/v1/factors', cleanupToken,
    { factor_type: 'totp', friendly_name: `Acceptance-${randomUUID()}` });
  if (enrolled.status !== 200 || !row(enrolled.value) || typeof enrolled.value.id !== 'string') throw new Error('Enrollment failed');
  factorId = enrolled.value.id;
  if (!/^[a-f0-9-]{36}$/.test(factorId) || !row(enrolled.value.totp) || typeof enrolled.value.totp.secret !== 'string') throw new Error('Enrollment response invalid');
  stage = 'challenge temporary factor';
  const challenge = await request(`/auth/v1/factors/${factorId}/challenge`, cleanupToken, {});
  if (!row(challenge.value) || typeof challenge.value.id !== 'string') throw new Error('Challenge failed');
  stage = 'verify temporary factor';
  const verified = await request(`/auth/v1/factors/${factorId}/verify`, cleanupToken,
    { challenge_id: challenge.value.id, code: totp(enrolled.value.totp.secret) });
  if (verified.status !== 200 || !row(verified.value) || typeof verified.value.access_token !== 'string') throw new Error('Verification failed');
  cleanupToken = verified.value.access_token;
  stage = 'verify assurance identities';
  const verifiedUser = await request('/auth/v1/user', cleanupToken);
  const high = verifyIdentity(verified.value, verifiedUser.value, env.E2E_USER!);
  const low = (await login()).identity;
  if (high.aal !== 'aal2' || low.aal !== 'aal1' || high.verifiedFactors !== 1 || low.verifiedFactors !== 1 || high.subject !== low.subject) throw new Error('Assurance identities not established');
  record('Auth-issued enrolled AAL1 and AAL2 for same synthetic user', true);
  stage = 'probe assurance boundaries';
  const readPath = `/rest/v1/projects?id=eq.${PROJECT_ID}&select=id,org_id`;
  const denied = await request(readPath, low.token);
  record('Data API denies enrolled AAL1', denied.status === 403);
  const allowed = await request(readPath, high.token);
  record('Data API accepts AAL2 fixture read', allowed.status === 200 && Array.isArray(allowed.value) &&
    allowed.value.some(project => row(project) && project.id === PROJECT_ID && project.org_id === ORG_ID));
  const profiles: Array<[string, Row, number[]]> = [
    ['llm-proxy', { provider: '__acceptance_invalid__', model: '__acceptance_invalid__' }, [400]],
    ['email-send', {}, [400]],
    ['project-export', { project_id: PROJECT_ID }, [200]],
    ['command-center-read', { schemaVersion: 1, entityTypes: ['project'], projectIds: [PROJECT_ID], limitPerEntity: 1 }, [200]],
    ['command-center-session-handoff', { action: 'create', state: '', codeChallenge: '', encryptedSession: null }, [400]],
    // Foreign UUID cannot authorize workspace erasure. Never invoke self-deletion.
    ['account-delete', { org_id: '91db0000-0000-4000-8000-000000000099' }, [403]],
    ['stripe-billing', { action: '__acceptance_invalid__', org_id: ORG_ID }, [400]],
  ];
  for (const [slug, body, expected] of profiles) {
    const lowReply = await request(`/functions/v1/${slug}`, low.token, body);
    const highReply = await request(`/functions/v1/${slug}`, high.token, body);
    if (slug === 'stripe-billing' && (lowReply.status === 503 || highReply.status === 503)) {
      cases.push({ name: 'stripe-billing configuration required before MFA HTTP acceptance', status: 'INCOMPLETE' }); continue;
    }
    record(`${slug}: enrolled AAL1 denied by explicit MFA guard`, lowReply.status === 403 && row(lowReply.value) && lowReply.value.code === 'mfa_required');
    record(`${slug}: AAL2 reaches bounded read/validation boundary`, expected.includes(highReply.status) &&
      !(row(highReply.value) && highReply.value.code === 'mfa_required'));
  }
} catch {
  // Never expose Auth tokens, passwords, secrets, fixture responses or provider data.
  cases.push({ name: `MFA acceptance: ${stage}`, status: 'FAIL' });
} finally {
  if (factorId && cleanupToken) {
    try {
      const cleanup = await request(`/auth/v1/factors/${factorId}`, cleanupToken, undefined, 'DELETE');
      record('Temporary MFA factor removed', cleanup.status === 200 || cleanup.status === 204);
      const user = await request('/auth/v1/user', cleanupToken);
      record('Factor cleanup readback', user.status === 200 && row(user.value) &&
        (!Array.isArray(user.value.factors) || !user.value.factors.some(factor => row(factor) && factor.id === factorId)));
    } catch { record('Temporary MFA factor removed', false); }
  }
  const status = cases.some(result => result.status === 'FAIL') ? 'FAIL' : cases.some(result => result.status === 'INCOMPLETE') ? 'INCOMPLETE' : 'PASS';
  await mkdir('test-results/backend-acceptance', { recursive: true });
  await writeFile('test-results/backend-acceptance/mfa.json', JSON.stringify({ candidate: env.ACCEPTANCE_CANDIDATE_SHA,
    projectRef: 'ndyfjffsulfbwpmwdmic', status, cases,
    coverage: 'Enrolled Auth assurance, Data API and seven bounded Edge probes. Not Storage/Realtime or successful external-provider operations.' }, null, 2), { mode: 0o600 });
  console.log(`Staging enrolled MFA: ${status}; cases=${cases.length}`);
  process.exitCode = status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2;
}
