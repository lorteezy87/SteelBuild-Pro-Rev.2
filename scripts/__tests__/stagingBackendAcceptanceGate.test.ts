import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Step { uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown>; if?: string }
interface Job { if: string; needs?: string; environment?: string; steps: Step[] }
const workflow = load(readFileSync(new URL('../../.github/workflows/staging-backend-acceptance.yml', import.meta.url), 'utf8')) as {
  on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, Job>;
};
const script = workflow.jobs.verify.steps[0].with?.script;
if (typeof script !== 'string') throw new Error('Missing verification source');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const execute = new AsyncFunction('github', 'context', 'core', script) as (github: unknown, context: unknown, core: unknown) => Promise<void>;
const candidate = 'a'.repeat(40);
const required = ['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Release Edge Function typecheck', 'Commercial SQL + concurrent PostgreSQL acceptance'];
afterEach(() => vi.unstubAllEnvs());

async function verify(options: { ref?: string; event?: string; input?: string; mergeBase?: string; runSha?: string; runEvent?: string; runStatus?: string; failedJob?: string; missingJob?: string; splitRuns?: boolean } = {}) {
  vi.stubEnv('CANDIDATE_SHA', options.input ?? candidate);
  const setOutput = vi.fn();
  const github = {
    rest: { repos: { compareCommitsWithBasehead: vi.fn(async () => ({ data: { merge_base_commit: { sha: options.mergeBase ?? candidate } } })) }, actions: { listWorkflowRuns: 'runs', listJobsForWorkflowRun: 'jobs' } },
    paginate: vi.fn(async (method: string, params: { run_id?: number }) => {
      if (method === 'jobs') return required.filter(name => name !== options.missingJob).map((name, index) => ({ name, conclusion: name === options.failedJob || options.splitRuns && index % 2 !== (params.run_id ?? 0) % 2 ? 'failure' : 'success' }));
      const run = { id: 1, head_sha: options.runSha ?? candidate, event: options.runEvent ?? 'push', status: options.runStatus ?? 'completed' };
      return options.splitRuns ? [run, { ...run, id: 2 }] : [run];
    }),
  };
  await execute(github, { ref: options.ref ?? 'refs/heads/main', eventName: options.event ?? 'workflow_dispatch', sha: 'b'.repeat(40), repo: { owner: 'fixture', repo: 'app' } }, { setOutput });
  return setOutput;
}

describe('executed bounded backend acceptance source gate', () => {
  it('checks one exact main ancestor with all four source jobs in the same push run', async () => expect(await verify()).toHaveBeenCalledExactlyOnceWith('candidate_sha', candidate));
  it.each(['refs/heads/staging', 'refs/heads/codex/test', 'refs/pull/527/merge'])('rejects credentials on %s', async ref => { await expect(verify({ ref })).rejects.toThrow('dispatched from main'); });
  it('rejects ordinary CI events', async () => { await expect(verify({ event: 'push' })).rejects.toThrow('dispatched from main'); });
  it.each(['main', 'A'.repeat(40), 'a'.repeat(39), `${candidate}; echo private`])('rejects a nonexact SHA %s', async input => { await expect(verify({ input })).rejects.toThrow('exact lowercase'); });
  it('rejects unmerged source', async () => { await expect(verify({ mergeBase: 'c'.repeat(40) })).rejects.toThrow('not reachable'); });
  it.each(required)('requires successful %s', async failedJob => { await expect(verify({ failedJob })).rejects.toThrow('not passed together'); });
  it.each([{ missingJob: required[0] }, { runSha: 'c'.repeat(40) }, { runEvent: 'pull_request' }, { runStatus: 'in_progress' }, { splitRuns: true }])('rejects incomplete or stitched evidence %j', async options => { await expect(verify(options)).rejects.toThrow('not passed together'); });
  it('keeps the existing four staging credentials behind the protected environment and exact checkout', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(workflow.jobs.acceptance.needs).toBe('verify');
    expect(workflow.jobs.acceptance.environment).toBe('staging-backend');
    for (const job of Object.values(workflow.jobs)) expect(job.if).toBe("github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'");
    const checkout = workflow.jobs.acceptance.steps.find(step => step.uses === 'actions/checkout@v7');
    expect(checkout?.with).toEqual({ ref: '${{ needs.verify.outputs.candidate_sha }}', 'persist-credentials': false });
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps);
    const credentialSteps = steps.filter(step => Object.values(step.env ?? {}).some(value => value.includes('secrets.')));
    expect(credentialSteps).toHaveLength(1);
    expect(Object.values(credentialSteps[0].env ?? {}).filter(value => value.includes('secrets.')).sort()).toEqual([
      '${{ secrets.STAGING_E2E_PASS }}', '${{ secrets.STAGING_E2E_SUPABASE_ANON_KEY }}', '${{ secrets.STAGING_E2E_SUPABASE_URL }}', '${{ secrets.STAGING_E2E_USER }}',
    ]);
    expect(credentialSteps[0].run).toBe('node scripts/staging-backend-acceptance/run.ts');
    expect(steps.some(step => /npm|npx|curl|supabase functions|continue-on-error/.test(step.run ?? ''))).toBe(false);
    const upload = steps.find(step => step.uses === 'actions/upload-artifact@v7');
    expect(upload?.with?.path).toBe('test-results/backend-acceptance/summary.json');
    expect(upload?.if).toBe('${{ !cancelled() }}');
  });
  it('does not import the executable into general CI, and cannot turn INCOMPLETE into exit zero', () => {
    const cli = readFileSync(new URL('../staging-backend-acceptance/run.ts', import.meta.url), 'utf8');
    expect(cli).toContain("process.exitCode = report.status === 'FAIL' ? 1 : 2");
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).not.toContain('staging-backend-acceptance/run.ts');
    expect(cli).not.toMatch(/JSON\.stringify\((process\.env|session|response|error)/);
  });
});
