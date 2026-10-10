import { describe, expect, it, vi } from 'vitest';
import { APP_ORIGIN, STAGING_ORIGIN } from '../../e2e/stagingNetworkGuard.js';
import {
  DRAWING_PROJECT_ID, DRAWING_ORG_ID, ORG_READ, PROJECT_READ, DrawingEvidenceTransport,
  allowsDrawingSetupRequest, assertDrawingEvidenceEnvironment, assertDrawingParent, validateDrawingSession,
} from '../../e2e/drawingEvidenceTransport.js';

const key = 'sb_publishable_synthetic';
const env = {
  GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  ACCEPTANCE_CANDIDATE_SHA: 'a'.repeat(40), E2E_TARGET: 'staging', E2E_BASE_URL: APP_ORIGIN,
  E2E_SUPABASE_URL: STAGING_ORIGIN, E2E_EXPECTED_SUPABASE_REF: 'ndyfjffsulfbwpmwdmic',
  E2E_USER: 'synthetic@example.invalid', E2E_PASS: 'synthetic', E2E_SUPABASE_ANON_KEY: key,
};
const project = { id: DRAWING_PROJECT_ID, org_id: DRAWING_ORG_ID, name: 'STAGING — Warehouse Expansion', project_number: 'STG-0001', is_deleted: false, on_hold: false };
const org = { id: DRAWING_ORG_ID, name: 'Example Fabrication (staging)' };
const jwt = (payload: object) => 'synthetic.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature';

describe('protected drawing setup environment', () => {
  it('accepts the exact workflow and public staging credentials', () => {
    expect(() => assertDrawingEvidenceEnvironment(env)).not.toThrow();
    expect(() => assertDrawingEvidenceEnvironment({ ...env, E2E_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: 'ndyfjffsulfbwpmwdmic' }) })).not.toThrow();
  });
  it.each([
    ['GITHUB_ACTIONS', 'false'], ['GITHUB_REF', 'refs/heads/other'], ['GITHUB_EVENT_NAME', 'push'],
    ['ACCEPTANCE_CANDIDATE_SHA', 'main'], ['E2E_TARGET', 'production'], ['E2E_BASE_URL', 'https://www.steelbuild-pro.com'],
    ['E2E_SUPABASE_URL', 'https://kjrwqagyeswwoxpjkcko.supabase.co'], ['E2E_EXPECTED_SUPABASE_REF', 'other'],
    ['E2E_PROJECT_ID', 'other'], ['E2E_USER', ''], ['E2E_PASS', ''], ['E2E_SUPABASE_ANON_KEY', ''],
    ['E2E_SUPABASE_ANON_KEY', 'sb_secret_synthetic'],
    ['E2E_SUPABASE_ANON_KEY', jwt({ role: 'service_role', ref: 'ndyfjffsulfbwpmwdmic' })],
    ['E2E_SUPABASE_ANON_KEY', jwt({ role: 'anon', ref: 'kjrwqagyeswwoxpjkcko' })],
  ])('fails before sign-in for invalid %s', (name, value) => {
    expect(() => assertDrawingEvidenceEnvironment({ ...env, [name]: value })).toThrow();
  });
});

describe('separate setup HTTP transport', () => {
  it('permits only exact sign-in, then the two fixed fixture reads', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response('{}'));
    await new DrawingEvidenceTransport(key, undefined, network).send('/auth/v1/token?grant_type=password', 'POST', { email: env.E2E_USER, password: env.E2E_PASS });
    const api = new DrawingEvidenceTransport(key, 'synthetic-session', network);
    await api.send(PROJECT_READ); await api.send(ORG_READ);
    expect(network.mock.calls.map(call => call[0])).toEqual([
      STAGING_ORIGIN + '/auth/v1/token?grant_type=password', STAGING_ORIGIN + PROJECT_READ, STAGING_ORIGIN + ORG_READ,
    ]);
    for (const [, options] of network.mock.calls) {
      expect(options?.redirect).toBe('error'); expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(network.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
    expect(network.mock.calls[1][1]?.headers).toHaveProperty('Authorization', 'Bearer synthetic-session');
  });
  it.each([
    ['/functions/v1/stripe-billing', 'POST'], ['/functions/v1/email-send', 'GET'],
    ['/rest/v1/projects', 'GET'], [PROJECT_READ + '&id=neq.other', 'GET'],
    [PROJECT_READ, 'PATCH'], ['/rest/v1/rpc/apply_submittal_round_workflow', 'POST'],
    ['https://api.stripe.com/v1/customers', 'POST'], ['/auth/v1/admin/users', 'GET'],
    ['/auth/v1/token?grant_type=password', 'POST'],
  ])('never calls the network for forbidden %s %s', async (path, method) => {
    const network = vi.fn<typeof fetch>();
    await expect(new DrawingEvidenceTransport(key, 'session', network).send(path, method)).rejects.toThrow('out-of-scope');
    expect(network).not.toHaveBeenCalled();
  });
  it('requires sign-in credentials with no administrative fields and authenticated reads', () => {
    expect(allowsDrawingSetupRequest(PROJECT_READ, 'GET', false)).toBe(false);
    expect(allowsDrawingSetupRequest(PROJECT_READ, 'GET', true, {})).toBe(false);
    expect(allowsDrawingSetupRequest('/auth/v1/token?grant_type=password', 'POST', false, { email: 'synthetic', password: 'synthetic', role: 'admin' })).toBe(false);
  });
  it('bounds setup requests and sanitizes provider failure details', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response('{}'));
    const api = new DrawingEvidenceTransport(key, 'session', network);
    for (let n = 0; n < 3; n++) await api.send(PROJECT_READ);
    await expect(api.send(PROJECT_READ)).rejects.toThrow('out-of-scope');
    expect(network).toHaveBeenCalledTimes(3);
    const failed = vi.fn<typeof fetch>(async () => { throw new Error('private token / credentials'); });
    await expect(new DrawingEvidenceTransport(key, 'session', failed).send(PROJECT_READ)).rejects.toThrow(/^Protected drawing setup request failed$/);
    const rejected = vi.fn<typeof fetch>(async () => new Response('private response', { status: 400 }));
    await expect(new DrawingEvidenceTransport(key, 'session', rejected).send(PROJECT_READ)).rejects.toThrow(/^Protected drawing setup request failed$/);
  });
});

describe('exact accessible staging fixture and session', () => {
  it('verifies both fixed parent identities and active project state', () => expect(() => assertDrawingParent([project], [org])).not.toThrow());
  it.each([
    [[], [org]], [[project, project], [org]], [[{ ...project, org_id: 'other' }], [org]],
    [[{ ...project, id: 'other' }], [org]], [[{ ...project, name: 'Customer project' }], [org]],
    [[{ ...project, is_deleted: true }], [org]], [[{ ...project, on_hold: true }], [org]],
    [[project], [{ ...org, id: 'other' }]], [[project], [{ ...org, name: 'Customer workspace' }]],
  ])('rejects missing, ambiguous, inactive or unrelated parent rows', (projects, organizations) => {
    expect(() => assertDrawingParent(projects, organizations)).toThrow('identity');
  });
  it('derives session expiry without exposing or mutating the authentication response', () => {
    const session = { access_token: 'synthetic', refresh_token: 'synthetic', user: { id: DRAWING_PROJECT_ID }, expires_in: 60 };
    expect(validateDrawingSession(session, 1_000).expires_at).toBe(61);
    expect(session).not.toHaveProperty('expires_at');
    expect(() => validateDrawingSession({ ...session, expires_at: 0 }, 1_000)).toThrow('Expired');
    expect(() => validateDrawingSession({ ...session, user: null })).toThrow('Incomplete');
  });
});
