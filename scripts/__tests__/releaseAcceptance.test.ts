import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { verifyDeployment } from '../verify-deployment.mjs';
import { REQUIRED_RELEASE_FIXTURES, verifyReleaseFixtures } from '../verify-release-fixtures.mjs';
import { fixtureNow, releaseFixtureEnv } from './releaseFixtureTestData.ts';

const revision = 'a'.repeat(40);
const origin = 'https://steelbuild.example.invalid';
function responses(bad?: string) {
  return vi.fn(async value => {
    const url = new URL(value);
    if (url.pathname === '/build-info.json') return Response.json({ revision: bad === 'revision' ? 'b'.repeat(40) : revision });
    if (url.pathname === '/') return new Response(bad === 'boot' ? '<html>Challenge</html>' : '<div id="root"></div><script type="module" src="/assets/app-hash.js"></script>', { headers: { 'content-type': 'text/html' } });
    if (url.pathname.startsWith('/assets/')) return new Response('export const ready=true', { headers: { 'content-type': bad === 'asset' ? 'text/html' : 'application/javascript' } });
    return Response.json({ status: bad === 'backend' ? 'degraded' : 'ok', db: 'ok' });
  });
}
describe('release artifact checks', () => {
  it('accepts matching revision, executable entrypoint and backend readiness', async () => {
    await expect(verifyDeployment({ baseUrl: origin, revision, backendUrl: 'https://synthetic.supabase.co', fetchImpl: responses() })).resolves.toMatchObject({ revision });
  });
  it.each(['revision', 'boot', 'asset', 'backend'])('refuses HTTP 200 with wrong %s', async bad => {
    await expect(verifyDeployment({ baseUrl: origin, revision, backendUrl: 'https://synthetic.supabase.co', fetchImpl: responses(bad) })).rejects.toThrow();
  });
  it('uses bounded no-redirect probes', async () => {
    const fetch = responses();
    await verifyDeployment({ baseUrl: origin, revision, backendUrl: 'https://synthetic.supabase.co', fetchImpl: fetch });
    expect(fetch.mock.calls.every(call => (call as unknown[])[1] && ((call as unknown[])[1] as RequestInit).redirect === 'error')).toBe(true);
  });
});

describe('mandatory staging fixture', () => {
  const fixture = releaseFixtureEnv;
  it('accepts the complete isolated fixture with an exact-attempt attestation', () => expect(() => verifyReleaseFixtures(fixture(), fixtureNow)).not.toThrow());
  it.each(REQUIRED_RELEASE_FIXTURES)('rejects missing %s rather than letting its tests skip', key => {
    expect(() => verifyReleaseFixtures({ ...fixture(), [key]: '' }, fixtureNow)).toThrow();
  });
  it('rejects production or partial workflow', () => {
    expect(() => verifyReleaseFixtures({ ...fixture(), E2E_SUPABASE_URL: 'https://kjrwqagyeswwoxpjkcko.supabase.co' }, fixtureNow)).toThrow();
    expect(() => verifyReleaseFixtures({ ...fixture(), E2E_PIECE_FULL_WORKFLOW: 'false' }, fixtureNow)).toThrow();
  });
});

type Job = { needs?: string[]; environment?: string; steps?: Array<{ uses?: string; run?: string; env?: Record<string, string> }>; env?: Record<string, string> };
const workflow = load(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')) as { jobs: Record<string, Job> };
describe('publishing dependency contract', () => {
  it.each(['deploy-cloudflare', 'preview-cloudflare'])('%s requires the content-hashed IFC runtime', name => {
    const commands = workflow.jobs[name].steps!.map(step => step.run || '').join('\n');
    expect(commands).toContain("compgen -G 'dist/assets/web-ifc-*.wasm'");
    expect(commands).not.toContain('dist/wasm/web-ifc.wasm');
  });
  it.each(['deploy-cloudflare', 'preview-cloudflare', 'deploy-staging-cloudflare'])('%s waits for security audit and names a protected environment', name => {
    expect(workflow.jobs[name].needs).toContain('dependency-audit');
    expect(workflow.jobs[name].environment).toMatch(/^steelbuild-/);
  });
  it('cannot publish production before the same-revision mutation gate succeeds', () => {
    expect(workflow.jobs['deploy-cloudflare'].needs).toContain('production-acceptance');
    const scripts = workflow.jobs['production-acceptance'].steps!.map(step => step.run).join('\n');
    expect(scripts).toContain('verify-release-fixtures.mjs');
    expect(scripts).toContain('verify-deployment.mjs');
    expect(scripts).toContain('test:e2e:staging:mutations');
  });
  it('requires operator attestation and checks server freshness before deployment and again before mutations', () => {
    const job = workflow.jobs['production-acceptance'];
    expect(job.env?.E2E_RELEASE_FIXTURE_ATTESTATION).toBe('${{ secrets.STAGING_E2E_RELEASE_FIXTURE_ATTESTATION }}');
    const steps = job.steps!.map(step => step.run || '');
    const checks = steps.flatMap((run, index) => run.includes('verify-release-fixtures.mjs') ? [index] : []);
    expect(checks).toHaveLength(2);
    const deploy = steps.findIndex(run => run.includes('wrangler deploy'));
    const mutations = steps.findIndex(run => run.includes('test:e2e:staging:mutations'));
    expect(checks[0]).toBeLessThan(deploy);
    expect(checks[1]).toBeGreaterThan(deploy);
    expect(checks[1]).toBe(mutations - 1);
  });
  it('pins all reusable action source in the publishing workflow to a full commit', () => {
    const uses = Object.values(workflow.jobs).flatMap(job => job.steps ?? []).flatMap(step => step.uses ? [step.uses] : []);
    expect(uses.every(action => /@[0-9a-f]{40}$/.test(action))).toBe(true);
  });
  it('gives previews their own publisher and staging browser configuration', () => {
    const preview = JSON.stringify(workflow.jobs['preview-cloudflare']);
    expect(preview).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
    expect(preview).not.toContain('secrets.VITE_SUPABASE_URL');
    expect(preview).toContain('wrangler.preview.jsonc');
  });
});
