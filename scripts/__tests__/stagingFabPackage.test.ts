import { describe, expect, it } from 'vitest';
import { assertStagingFabPackageEnvironment } from '../../e2e/fixtures/stagingFabPackage.js';
const env = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/staging', GITHUB_EVENT_NAME: 'push',
  GITHUB_RUN_ID: '12345678901', GITHUB_RUN_ATTEMPT: '1', E2E_TARGET: 'staging',
  E2E_BASE_URL: 'https://steelbuild-pro-staging.n-lortz1987.workers.dev',
  E2E_SUPABASE_URL: 'https://ndyfjffsulfbwpmwdmic.supabase.co', E2E_SUPABASE_ANON_KEY: 'browser-public-key',
  E2E_EXPECTED_SUPABASE_REF: 'ndyfjffsulfbwpmwdmic', E2E_USER: 'staging.pm@steelbuild-pro.invalid',
  E2E_PASS: 'test-password-not-a-secret', E2E_MUTATIONS_ENABLED: 'true', E2E_MUTATION_FIXTURE_KIND: 'disposable' };
const project = '6573ede6-e29d-4d15-8855-403029735231';
const sheet = 'e0f7baec-b586-4b64-8c7b-296117c667c1';
describe('fresh staging fab package boundary', () => {
  it('allows only the explicit synthetic CI fixture', () => expect(() => assertStagingFabPackageEnvironment(env, project, sheet)).not.toThrow());
  it.each([
    { GITHUB_ACTIONS: 'false' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { E2E_TARGET: 'production' }, { E2E_SUPABASE_URL: 'https://kjrwqagyeswwoxpjkcko.supabase.co' },
    { E2E_BASE_URL: 'https://steelbuild-pro.com' }, { E2E_USER: 'someone@example.invalid' },
    { E2E_MUTATIONS_ENABLED: 'false' }, { E2E_MUTATION_FIXTURE_KIND: 'customer' }, { GITHUB_RUN_ID: '../escape' },
  ])('rejects an unexpected context before any mutation: %j', patch => {
    expect(() => assertStagingFabPackageEnvironment({ ...env, ...patch }, project, sheet)).toThrow();
  });
  it('refuses a different project or template sheet', () => {
    expect(() => assertStagingFabPackageEnvironment(env, 'foreign', sheet)).toThrow();
    expect(() => assertStagingFabPackageEnvironment(env, project, 'foreign')).toThrow();
  });
});
