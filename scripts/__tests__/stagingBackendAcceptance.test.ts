import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { BoundedTransport, HANDLERS, ORIGIN, ORG_ID, PROJECT_ID, PUBLIC_STAGE_ORIGIN, assertEnvironment, runAcceptance, validateExport, verifyIdentity } from '../staging-backend-acceptance/acceptance.ts';
import { PROJECT_EXPORT_TABLES } from '../../supabase/functions/project-export/exportShape.ts';

const subject = '00000000-0000-4000-8000-000000000001';
const now = 1_800_000_000_000;
const email = 'synthetic@example.invalid';
const token = (extra: Record<string, unknown> = {}) => `header.${Buffer.from(JSON.stringify({ sub: subject, iss: `${ORIGIN}/auth/v1`, role: 'authenticated', aal: 'aal1', exp: now / 1000 + 3600, ...extra })).toString('base64url')}.signature`;
const env = {
  GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  ACCEPTANCE_CANDIDATE_SHA: 'a'.repeat(40), E2E_TARGET: 'staging', E2E_EXPECTED_SUPABASE_REF: 'ndyfjffsulfbwpmwdmic',
  E2E_SUPABASE_URL: ORIGIN, E2E_SUPABASE_ANON_KEY: 'sb_publishable_fixture', E2E_USER: email, E2E_PASS: 'fixture-password',
};
const projects = [{ id: PROJECT_ID, org_id: ORG_ID, name: 'STAGING — Warehouse Expansion', project_number: 'STG-0001', is_deleted: false, on_hold: false }];
const organizations = [{ id: ORG_ID, name: 'Example Fabrication (staging)' }];
function exported() {
  const names = [...PROJECT_EXPORT_TABLES, 'note_folder_job_links', 'note_folders'];
  return { export_version: 2, exported_at: new Date(now).toISOString(), exported_by: email, project: projects[0],
    tables: Object.fromEntries(names.map(name => [name, [] as Record<string, unknown>[]])), row_counts: Object.fromEntries(names.map(name => [name, 0])), total_rows: 0, files: [], file_count: 0, storage_files: [] };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('bounded backend acceptance request policy', () => {
  it('accepts only the protected main staging environment', () => expect(() => assertEnvironment(env)).not.toThrow());
  it.each([
    { GITHUB_REF: 'refs/heads/codex/test' }, { GITHUB_EVENT_NAME: 'push' }, { GITHUB_ACTIONS: 'false' },
    { ACCEPTANCE_CANDIDATE_SHA: 'main' }, { E2E_SUPABASE_URL: 'https://kjrwqagyeswwoxpjkcko.supabase.co' },
    { E2E_EXPECTED_SUPABASE_REF: 'production' }, { E2E_TARGET: 'production' }, { E2E_PASS: '' },
    { E2E_SUPABASE_ANON_KEY: 'sb_secret_forbidden' },
    { E2E_SUPABASE_ANON_KEY: `h.${Buffer.from(JSON.stringify({ role: 'service_role', ref: 'ndyfjffsulfbwpmwdmic' })).toString('base64url')}.s` },
  ])('rejects unsafe environment before network: %j', async change => {
    const network = vi.fn<typeof fetch>();
    await expect(runAcceptance({ ...env, ...change }, network)).resolves.toMatchObject({ status: 'FAIL', stage: 'environment' });
    expect(network).not.toHaveBeenCalled();
  });
  it('uses apikey only for password auth and never allows caller supplied request data', async () => {
    const network = vi.fn<typeof fetch>(async () => json({}));
    const transport = new BoundedTransport(env, network);
    await transport.send('sign-in');
    const [url, options] = network.mock.calls[0];
    expect(url).toBe(`${ORIGIN}/auth/v1/token?grant_type=password`);
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(options?.body).toBe(JSON.stringify({ email, password: env.E2E_PASS }));
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(['checkout', 'portal', 'redeem', 'enroll', 'delete', 'POST /rest/v1/activities', 'https://api.stripe.com/v1/customers', 'probe:account-delete?mode=account', 'probe:constructor', '__proto__'])('never sends unsupported operation %s', async operation => {
    const network = vi.fn<typeof fetch>();
    await expect(new BoundedTransport(env, network).send(operation)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
  it('pins dangerous handlers to nonoperational payloads even after authentication', async () => {
    const network = vi.fn<typeof fetch>(async () => json({}, 400));
    const transport = new BoundedTransport(env, network);
    transport.setSession(token(), subject);
    for (const handler of HANDLERS.filter(name => name !== 'project-export')) await transport.send(`probe:${handler}`);
    const bodies = Object.fromEntries(network.mock.calls.map(([url, options]) => [String(url).split('/').at(-1), JSON.parse(String(options?.body))]));
    expect(bodies['account-delete']).toEqual({});
    expect(bodies['email-send']).toEqual({});
    expect(bodies['stripe-billing']).toEqual({ action: '__acceptance_invalid__', org_id: ORG_ID });
    expect(bodies['command-center-session-handoff']).toEqual({ action: 'create', state: '', codeChallenge: '', encryptedSession: null });
    expect(bodies['llm-proxy']).toEqual({ provider: '__acceptance_invalid__', model: '__acceptance_invalid__' });
  });
  it('requires exact active synthetic parent proof before export and prohibits repeats', async () => {
    const network = vi.fn<typeof fetch>(async () => json(exported()));
    const denied = new BoundedTransport(env, network); denied.setSession(token(), subject);
    await expect(denied.send('probe:project-export')).rejects.toThrow();
    expect(() => denied.confirmFixture([{ ...projects[0], org_id: subject }], organizations)).toThrow();
    expect(network).not.toHaveBeenCalled();
    const approved = new BoundedTransport(env, network); approved.setSession(token(), subject); approved.confirmFixture(projects, organizations);
    await approved.send('probe:project-export');
    await expect(approved.send('probe:project-export')).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('caps streamed bytes and suppresses raw response/network diagnostics', async () => {
    const oversized = new BoundedTransport(env, async () => new Response('private-data'.repeat(15_000)));
    await expect(oversized.send('sign-in')).rejects.toThrow('RESPONSE_LIMIT');
    const failed = new BoundedTransport(env, async () => { throw new Error('password=private-token'); });
    await expect(failed.send('sign-in')).rejects.toThrow(/^NETWORK_REJECTED$/);
  });
  it('a real 307 response never forwards credentials to the redirect target', async () => {
    let hits = 0;
    const destination = createServer((_req, res) => { hits++; res.end('{}'); }); destination.listen(0, '127.0.0.1'); await once(destination, 'listening');
    const address = destination.address(); if (!address || typeof address === 'string') throw new Error('loopback unavailable');
    const redirect = createServer((_req, res) => { res.writeHead(307, { location: `http://127.0.0.1:${address.port}/sink` }); res.end(); }); redirect.listen(0, '127.0.0.1'); await once(redirect, 'listening');
    const source = redirect.address(); if (!source || typeof source === 'string') throw new Error('loopback unavailable');
    try {
      const network: typeof fetch = (_url, options) => fetch(`http://127.0.0.1:${source.port}/auth`, options);
      await expect(new BoundedTransport(env, network).send('sign-in')).rejects.toThrow('NETWORK_REJECTED');
      expect(hits).toBe(0);
    } finally { redirect.closeAllConnections(); destination.closeAllConnections(); await Promise.all([new Promise<void>(resolve => redirect.close(() => resolve())), new Promise<void>(resolve => destination.close(() => resolve()))]); }
  });
});

function scenario(options: { enrolled?: boolean; readConfigured?: boolean; invalidMfa?: boolean; missingAudit?: boolean; sourceOrigin?: string; changedEnrollment?: boolean; rawFailure?: boolean; hiddenParent?: boolean } = {}) {
  let exportedOnce = false, userReads = 0;
  const sessionToken = token({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const exportValue = exported();
  const network = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(ORIGIN);
    const headers = new Headers(init?.headers);
    if (url.pathname === '/auth/v1/token') return json({ access_token: sessionToken, refresh_token: 'private-refresh-token', expires_in: 3600, user: { id: subject } });
    if (url.pathname === '/auth/v1/user') { userReads++; return json({ id: subject, email, factors: options.enrolled || options.changedEnrollment && userReads > 1 ? [{ status: 'verified' }] : [] }); }
    if (url.pathname === '/rest/v1/projects') return json(options.hiddenParent ? [] : projects);
    if (url.pathname === '/rest/v1/organizations') return json(organizations);
    if (url.pathname === '/rest/v1/activities') return json(exportedOnce && !options.missingAudit ? [{ id: '00000000-0000-4000-8000-000000000002', project_id: PROJECT_ID, entity_id: PROJECT_ID, entity_type: 'Project', action: 'exported', performed_by_user_id: subject, metadata: { export_version: 2, total_rows: 0, table_count: PROJECT_EXPORT_TABLES.length + 2, file_count: 0 } }] : []);
    if (!url.pathname.startsWith('/functions/v1/')) throw new Error('Unexpected network operation');
    const handler = url.pathname.split('/').at(-1);
    if (init?.method === 'GET') return json({ error: 'Method not allowed' }, 405);
    if (handler === 'stripe-billing') return json({ error: 'Billing configuration is unavailable. Please contact support.' }, 503);
    if (!headers.has('authorization')) return json({ error: 'Unauthorized' }, 401);
    if (handler === 'account-delete') { expect(init?.body).toBe('{}'); return json({ error: 'org_id is required' }, 400); }
    if (handler === 'command-center-read' && !options.readConfigured) return json({ error: 'SteelBuild read service is not configured' }, 503);
    if (options.rawFailure) throw new Error(`password=${env.E2E_PASS} ${sessionToken}`);
    if (options.enrolled) return json({ code: options.invalidMfa ? 'unrelated' : 'mfa_required' }, 403);
    if (handler === 'llm-proxy') return json({ error: 'Unknown provider: "__acceptance_invalid__". Use "anthropic" or "openai".' }, 400);
    if (handler === 'email-send') return json({ error: 'project_id is required' }, 400);
    if (handler === 'command-center-session-handoff') return json({ error: 'Invalid handoff request' }, 400);
    if (handler === 'project-export') { exportedOnce = true; return json(exportValue); }
    if (handler === 'command-center-read') {
      const sourceUrl = `${options.sourceOrigin ?? PUBLIC_STAGE_ORIGIN}/Projects?projectId=${PROJECT_ID}&recordId=${PROJECT_ID}`;
      return json({ generatedAt: new Date().toISOString(), items: [{ id: PROJECT_ID, entityType: 'project', project: { id: PROJECT_ID }, sourceUrl,
        source: { sourceType: 'steelbuild', sourceId: PROJECT_ID, sourceUrl, entityType: 'project' } }], cursors: {}, truncated: { project: false } });
    }
    throw new Error('Unexpected handler');
  });
  return { network, sessionToken };
}

describe('bounded runner end-to-end without hosted network', () => {
  it('retains only aggregate evidence and stays INCOMPLETE after safe checks and audited export pass', async () => {
    const { network, sessionToken } = scenario();
    const result = await runAcceptance(env, network);
    expect(result).toMatchObject({ status: 'INCOMPLETE', stage: 'finished', auth: { aal: 'aal1', verifiedFactors: 0 }, exportAuditRows: 1 });
    expect(result.cases).toContainEqual({ id: 'probe:project-export', status: 'PASS', reason: 'V2_SCOPED_CREDENTIALS_EXCLUDED', httpStatus: 200 });
    expect(result.cases).toContainEqual({ id: 'probe:stripe-billing', status: 'INCOMPLETE', reason: 'REQUIRED_CONFIGURATION_UNAVAILABLE', httpStatus: 503 });
    const serialized = JSON.stringify(result);
    for (const sensitive of [subject, email, env.E2E_PASS, sessionToken, 'private-refresh-token', PROJECT_ID, ORG_ID]) expect(serialized).not.toContain(sensitive);
    expect(result.limitations).toContain('AAL2_STEP_UP_AND_SEVEN_HANDLER_MFA_MATRIX_UNTESTED');
    expect(network.mock.calls.length).toBeLessThanOrEqual(32);
  });
  it('validates the actual project record link contract on a configured read service', async () => {
    const result = await runAcceptance(env, scenario({ readConfigured: true }).network);
    expect(result.status).toBe('INCOMPLETE');
    expect(result.cases).toContainEqual({ id: 'probe:command-center-read', status: 'PASS', reason: 'BOUNDED_PROJECT_READ', httpStatus: 200 });
  });
  it('does not label a production URL or unrelated 403 as valid staging/MFA proof', async () => {
    expect((await runAcceptance(env, scenario({ readConfigured: true, sourceOrigin: 'https://www.steelbuild-pro.com' }).network)).status).toBe('FAIL');
    expect((await runAcceptance(env, scenario({ enrolled: true, invalidMfa: true }).network)).status).toBe('FAIL');
  });
  it('checks enrolled AAL1 denial without inventing AAL2 or invoking erasure/export', async () => {
    const { network } = scenario({ enrolled: true });
    const result = await runAcceptance(env, network);
    expect(result).toMatchObject({ status: 'INCOMPLETE', stage: 'finished', auth: { verifiedFactors: 1 } });
    expect(result.cases).toContainEqual({ id: 'probe:llm-proxy', status: 'PASS', reason: 'ENROLLED_AAL1_REJECTED', httpStatus: 403 });
    expect(result.cases).toContainEqual({ id: 'probe:project-export', status: 'INCOMPLETE', reason: 'AAL2_REQUIRED_FOR_AUTHORIZED_EXPORT' });
    expect(network.mock.calls.some(([url, init]) => String(url).endsWith('/project-export') && init?.method === 'POST' && new Headers(init.headers).has('Authorization'))).toBe(false);
  });
  it('does not export an inaccessible or changed synthetic parent', async () => {
    const { network } = scenario({ hiddenParent: true });
    const result = await runAcceptance(env, network);
    expect(result.status).toBe('INCOMPLETE'); expect(result.exportCounts).toBeUndefined();
    expect(network.mock.calls.some(([url]) => String(url).includes('/rest/v1/activities'))).toBe(false);
  });
  it.each([{ missingAudit: true }, { changedEnrollment: true }, { rawFailure: true }])('fails missing durable proof or changing identity without recording raw error data: %j', async options => {
    const result = await runAcceptance(env, scenario(options).network);
    expect(result.status).toBe('FAIL');
    expect(JSON.stringify(result)).not.toContain(env.E2E_PASS);
    expect(JSON.stringify(result)).not.toContain(email);
  });
});

describe('fresh verified Auth proof and honest export evidence', () => {
  const session = { access_token: token(), expires_in: 3600, user: { id: subject } };
  const user = { id: subject, email, factors: [{ status: 'verified' }] };
  it('uses fresh Auth factors rather than user metadata for the MFA expectation', () => {
    expect(verifyIdentity(session, { ...user, user_metadata: { factors: [] } }, email, now)).toMatchObject({ aal: 'aal1', verifiedFactors: 1 });
    expect(verifyIdentity(session, { id: subject, email, user_metadata: { factors: [{ status: 'verified' }] } }, email, now)).toMatchObject({ verifiedFactors: 0 });
  });
  it.each([{ sub: ORG_ID }, { iss: 'https://other.supabase.co/auth/v1' }, { aal: 'aal3' }, { exp: now / 1000 - 1 }, { role: 'service_role' }])('rejects invalid verified-token contract %j', claims => {
    expect(() => verifyIdentity({ ...session, access_token: token(claims) }, user, email, now)).toThrow();
  });
  it.each([null, {}, [{ status: 'unknown' }]])('fails closed on malformed factor metadata %j', factors => {
    expect(() => verifyIdentity(session, { ...user, factors }, email, now)).toThrow();
  });
  it('validates the complete v2 export without retaining its content in the result', () => {
    const result = validateExport(exported());
    expect(result).toEqual({ tables: PROJECT_EXPORT_TABLES.length + 2, rows: 0, files: 0, storageFiles: 0, mailboxRows: 0 });
    expect(JSON.stringify(result)).not.toContain(email);
  });
  it.each(['access_token', 'refresh_token'])('rejects even empty leaked email credential columns: %s', key => {
    const value = exported(); value.tables.email_accounts = [{ project_id: PROJECT_ID, [key]: '' }]; value.row_counts.email_accounts = 1; value.total_rows = 1;
    expect(() => validateExport(value)).toThrow();
  });
  it('rejects wrong project rows, omitted tables, false totals, and v1 exports', () => {
    const leaked = exported(); leaked.tables.drawings = [{ project_id: subject }]; leaked.row_counts.drawings = 1; leaked.total_rows = 1;
    const omitted = exported(); delete omitted.tables.drawings;
    for (const value of [leaked, omitted, { ...exported(), total_rows: 1 }, { ...exported(), export_version: 1 }]) expect(() => validateExport(value)).toThrow();
  });
  it('requires an explicit project boundary on every project-owned row', () => {
    const missingScope = exported(); missingScope.tables.drawings = [{ id: subject }]; missingScope.row_counts.drawings = 1; missingScope.total_rows = 1;
    expect(() => validateExport(missingScope)).toThrow();
  });
  it('distinguishes nonempty mailbox credential exclusion from an empty-table control', () => {
    const value = exported(); value.tables.email_accounts = [{ id: subject, project_id: PROJECT_ID }]; value.row_counts.email_accounts = 1; value.total_rows = 1;
    expect(validateExport(value)).toMatchObject({ mailboxRows: 1 });
  });
});
