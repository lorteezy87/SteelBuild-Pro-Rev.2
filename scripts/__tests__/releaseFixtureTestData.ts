import { RELEASE_FIXTURE_IDS, REQUIRED_RELEASE_FIXTURES } from '../verify-release-fixtures.mjs';

export const fixtureNow = Date.parse('2026-10-08T12:00:00.000Z');
export function releaseFixtureEnv(): Record<string, string> {
  const env: Record<string, string> = {
    ...Object.fromEntries(REQUIRED_RELEASE_FIXTURES.map(key => [key, 'synthetic'])),
    E2E_TARGET: 'staging', E2E_EXPECTED_SUPABASE_REF: 'ndyfjffsulfbwpmwdmic',
    E2E_SUPABASE_URL: 'https://ndyfjffsulfbwpmwdmic.supabase.co',
    E2E_BASE_URL: 'https://steelbuild-pro-staging.n-lortz1987.workers.dev',
    E2E_MUTATIONS_ENABLED: 'true', E2E_MUTATION_FIXTURE_KIND: 'disposable', E2E_PIECE_FULL_WORKFLOW: 'true',
    GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1',
    E2E_USER: 'primary@fixture.invalid', E2E_VIEWER_USER: 'viewer@fixture.invalid',
  };
  RELEASE_FIXTURE_IDS.forEach((key, index) => { env[key] = `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`; });
  env.E2E_RELEASE_FIXTURE_ATTESTATION = JSON.stringify({ schema: 1, revision: env.GITHUB_SHA,
    run_id: env.GITHUB_RUN_ID, run_attempt: env.GITHUB_RUN_ATTEMPT, supabase_ref: env.E2E_EXPECTED_SUPABASE_REF,
    disposition: 'fresh-for-single-release-attempt', reviewed_by: 'fixture-operator',
    prepared_at: new Date(fixtureNow - 60_000).toISOString(), expires_at: new Date(fixtureNow + 3_600_000).toISOString(),
    fixture_ids: Object.fromEntries(RELEASE_FIXTURE_IDS.map(key => [key, env[key]])),
  });
  return env;
}
