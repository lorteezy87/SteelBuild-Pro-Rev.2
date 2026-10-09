import { expect, it, vi } from 'vitest';
import { verifyReleaseFixtureFreshness, verifyReleaseFixtures } from '../verify-release-fixtures.mjs';
import { fixtureNow, releaseFixtureEnv } from './releaseFixtureTestData.ts';

function fakeServer(env: Record<string, string>, fault = '') {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const bearer = new Headers(init?.headers).get('Authorization');
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (url.pathname === '/auth/v1/token') {
      const { email } = JSON.parse(String(init?.body));
      const viewer = email === env.E2E_VIEWER_USER;
      return Response.json({ access_token: viewer ? 'viewer-token' : 'primary-token', user: { id: viewer && fault !== 'same-user' ? 'viewer-user' : 'primary-user' } });
    }
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (fault === 'http') return Response.json({ error: 'secret-provider-diagnostic' }, { status: 503 });
    if (url.pathname === '/rest/v1/projects') {
      if (fault === 'missing-project') return Response.json([]);
      const foreign = id === env.E2E_PIECE_OTHER_TENANT_PROJECT_ID;
      if (foreign && bearer === 'Bearer primary-token' && fault !== 'foreign-visible') return Response.json([]);
      return Response.json([{ id, org_id: foreign && fault !== 'same-org' ? 'org-b' : 'org-a', is_deleted: false, deleted_at: null, piece_control_mode: 'pilot' }]);
    }
    if (url.pathname === '/rest/v1/pieces') return Response.json(fault === 'empty-foreign' ? [] : [{ id: 'foreign-piece' }]);
    if (url.pathname === '/rest/v1/drawings') {
      return Response.json([{ id, is_deleted: fault === 'deleted-drawing', deleted_at: null, is_superseded: false, project_id: id === env.E2E_PIECE_APPROVED_DRAWING_ID ? env.E2E_PIECE_PROJECT_ID : env.E2E_FAB_PROJECT_ID }]);
    }
    if (url.pathname === '/rest/v1/work_packages') return Response.json([{ id, is_deleted: false, deleted_at: null, project_id: fault === 'wrong-package-project' ? 'wrong-project' : env.E2E_PIECE_PROJECT_ID }]);
    if (url.pathname === '/rest/v1/rpc/evaluate_release_gate') {
      const { p_work_package_id: wp } = JSON.parse(String(init?.body));
      const exception = wp === env.E2E_PIECE_EXCEPTION_WORK_PACKAGE_ID;
      return Response.json({ work_package_id: wp, project_id: env.E2E_PIECE_PROJECT_ID,
        already_released: fault === 'consumed' ? true : fault === 'unknown-release' ? null : false,
        passes: exception && fault === 'unblocked-exception', checks: {
          scope: { passed: exception && fault !== 'no-exception-scope', piece_count: exception ? 1 : fault === 'dirty-lifecycle' ? 1 : 0 },
          material: { passed: !exception || fault === 'unblocked-exception' },
          drawings: { passed: true }, holds: { passed: true },
        } });
    }
    throw new Error(`Unexpected fixture request ${url.pathname}`);
  });
}

it('requires a reviewed attestation even with every legacy fixture variable present', () => {
  const env = releaseFixtureEnv(); delete env.E2E_RELEASE_FIXTURE_ATTESTATION;
  expect(() => verifyReleaseFixtures(env, fixtureNow)).toThrow(/attestation is required/);
});

it.each(['GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'E2E_PIECE_WORK_PACKAGE_ID'])('rejects stale attestation after %s changes before any server request', async key => {
  const env = releaseFixtureEnv();
  env[key] = key === 'GITHUB_SHA' ? 'b'.repeat(40) : key.endsWith('_ID') && key.startsWith('E2E_') ? '20000000-0000-4000-8000-000000000001' : '2';
  const fetchImpl = vi.fn();
  await expect(verifyReleaseFixtureFreshness(env, { now: fixtureNow, fetchImpl })).rejects.toThrow(/attestation/);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it.each([-1, 86_400_001])('rejects expired or overlong review windows (%s milliseconds)', expiresOffset => {
  const env = releaseFixtureEnv();
  const attestation = JSON.parse(env.E2E_RELEASE_FIXTURE_ATTESTATION);
  attestation.prepared_at = new Date(fixtureNow).toISOString();
  attestation.expires_at = new Date(fixtureNow + expiresOffset).toISOString();
  env.E2E_RELEASE_FIXTURE_ATTESTATION = JSON.stringify(attestation);
  expect(() => verifyReleaseFixtures(env, fixtureNow)).toThrow(/review window/);
});

it('verifies real fixture relationships and pristine package state using bounded reads and releases local auth sessions', async () => {
  const env = releaseFixtureEnv(); const fetchImpl = fakeServer(env);
  await expect(verifyReleaseFixtureFreshness(env, { now: fixtureNow, fetchImpl })).resolves.toMatchObject({ revision: env.GITHUB_SHA, work_packages_unreleased: 2 });
  const calls = fetchImpl.mock.calls;
  expect(calls.filter(([url]) => String(url).includes('/auth/v1/logout?scope=local'))).toHaveLength(2);
  expect(calls.every(([, init]) => init?.redirect === 'error' && init.signal)).toBe(true);
  expect(calls.filter(([, init]) => init?.method === 'POST').every(([url]) => /\/auth\/v1\/(token|logout)|\/rest\/v1\/rpc\/evaluate_release_gate/.test(String(url)))).toBe(true);
});

it.each(['consumed', 'unknown-release', 'dirty-lifecycle', 'no-exception-scope', 'unblocked-exception', 'same-user', 'same-org', 'foreign-visible', 'empty-foreign', 'missing-project', 'deleted-drawing', 'wrong-package-project'])('refuses unsafe or used fixture: %s', async fault => {
  const env = releaseFixtureEnv(); const fetchImpl = fakeServer(env, fault);
  await expect(verifyReleaseFixtureFreshness(env, { now: fixtureNow, fetchImpl })).rejects.toThrow(/fixture|package|Exception|Lifecycle|viewer|Primary|drawing|workspace/i);
  expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes('/auth/v1/logout?scope=local'))).toHaveLength(2);
});

it('never reports server response bodies or tokens in a preflight failure', async () => {
  const env = releaseFixtureEnv();
  await expect(verifyReleaseFixtureFreshness(env, { now: fixtureNow, fetchImpl: fakeServer(env, 'http') })).rejects.toThrow('Release fixture server check failed: HTTP 503');
});
