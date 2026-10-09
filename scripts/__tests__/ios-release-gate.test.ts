import { describe, expect, it } from 'vitest';
import { assertIosReleaseChecks } from '../ios-release-gate.mjs';

const run = { head_sha: 'abc', head_branch: 'main', event: 'push', status: 'completed' };
const jobs = ['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Supabase drift check', 'Release Edge Function typecheck', 'Dependency audit (required)', 'Commercial SQL + concurrent PostgreSQL acceptance', 'Exact revision staging release acceptance']
  .map(name => ({ name, status: 'completed', conclusion: 'success' }));

describe('iOS release gate', () => {
  it('accepts the same required validation gates as production', () => {
    expect(() => assertIosReleaseChecks(run, jobs, 'abc')).not.toThrow();
  });
  it.each(['Dependency audit (required)', 'Commercial SQL + concurrent PostgreSQL acceptance', 'Exact revision staging release acceptance'])('blocks a failed %s', name => {
    expect(() => assertIosReleaseChecks(run, jobs.map(job => job.name === name ? { ...job, conclusion: 'failure' } : job), 'abc')).toThrow(name);
  });
  it.each(['failure', 'skipped', 'cancelled', null])('rejects drift result %s', conclusion => {
    expect(() => assertIosReleaseChecks(run, jobs.map(j => j.name === 'Supabase drift check' ? { ...j, conclusion } : j), 'abc')).toThrow('Supabase drift check');
  });
  it('rejects missing or duplicate evidence', () => {
    expect(() => assertIosReleaseChecks(run, jobs.slice(1), 'abc')).toThrow();
    expect(() => assertIosReleaseChecks(run, [...jobs, jobs[0]], 'abc')).toThrow();
  });
  it.each([{ head_sha: 'old' }, { head_branch: 'feature' }, { event: 'pull_request' }, { status: 'in_progress' }])('rejects unrelated or unfinished CI: %j', change => {
    expect(() => assertIosReleaseChecks({ ...run, ...change }, jobs, 'abc')).toThrow();
  });
});
