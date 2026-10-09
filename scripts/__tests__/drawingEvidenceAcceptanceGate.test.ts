import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import generalConfig from '../../playwright.config.js';
import drawingConfig from '../../playwright.drawing-evidence.config.js';

interface Step { uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, string> }
interface Job { if?: string; needs?: string; environment?: string; steps: Step[] }
const workflow = load(readFileSync(new URL('../../.github/workflows/drawing-evidence-acceptance.yml', import.meta.url), 'utf8')) as { jobs: Record<string, Job> };
const script = workflow.jobs.verify.steps[0].with?.script;
if (!script) throw new Error('Missing candidate verification script');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const execute = new AsyncFunction('github', 'context', 'core', script) as (github: unknown, context: unknown, core: unknown) => Promise<void>;
const candidate = 'a'.repeat(40);
const required = ['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Release Edge Function typecheck', 'Commercial SQL + concurrent PostgreSQL acceptance'];

afterEach(() => vi.unstubAllEnvs());

async function verify(options: {
  input?: string; ref?: string; event?: string; mergeBase?: string;
  runSha?: string; runEvent?: string; runStatus?: string;
  failedJob?: string; missingJob?: string; splitRuns?: boolean;
} = {}) {
  vi.stubEnv('CANDIDATE_SHA', options.input ?? candidate);
  const setOutput = vi.fn();
  const github = {
    rest: {
      repos: { compareCommitsWithBasehead: vi.fn(async () => ({ data: { merge_base_commit: { sha: options.mergeBase ?? candidate } } })) },
      actions: { listWorkflowRuns: 'runs', listJobsForWorkflowRun: 'jobs' },
    },
    paginate: vi.fn(async (method: string, params: { run_id?: number }) => {
      if (method === 'jobs') return required.filter(name => name !== options.missingJob).map((name, index) => ({
        name, conclusion: name === options.failedJob || (options.splitRuns && index % 2 !== (params.run_id ?? 0) % 2) ? 'failure' : 'success',
      }));
      const run = { id: 1, head_sha: options.runSha ?? candidate, event: options.runEvent ?? 'push', status: options.runStatus ?? 'completed' };
      return options.splitRuns ? [run, { ...run, id: 2 }] : [run];
    }),
  };
  await execute(github, {
    sha: 'b'.repeat(40), ref: options.ref ?? 'refs/heads/main', eventName: options.event ?? 'workflow_dispatch',
    repo: { owner: 'fixture', repo: 'app' },
  }, { setOutput });
  return { setOutput, github };
}

describe('executed read-only drawing acceptance source gate', () => {
  it('isolates protected drawing evidence from general discovery while retaining both dedicated viewports', () => {
    const spec = 'drawing-revision-evidence.spec.ts';
    expect(generalConfig.testIgnore).toContain(spec);
    expect(drawingConfig.testMatch).toEqual([spec]);
    expect(drawingConfig.testIgnore).toEqual([]);
    expect(drawingConfig.projects?.map(project => project.name)).toEqual(['desktop', 'mobile']);
  });
  it('emits only the checked main-ancestor SHA', async () => {
    const result = await verify();
    expect(result.setOutput).toHaveBeenCalledExactlyOnceWith('candidate_sha', candidate);
    expect(result.github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith({ owner: 'fixture', repo: 'app', basehead: `${candidate}...${'b'.repeat(40)}` });
  });
  it.each(['refs/heads/staging', 'refs/heads/codex/release', 'refs/pull/514/merge'])('refuses credentials from %s', async ref => {
    await expect(verify({ ref })).rejects.toThrow('dispatched from main');
  });
  it('rejects nonmanual events', async () => {
    await expect(verify({ event: 'pull_request' })).rejects.toThrow('dispatched from main');
  });
  it.each(['main', 'a'.repeat(39), 'A'.repeat(40), `${candidate}; echo unsafe`])('rejects nonexact candidate %s', async input => {
    await expect(verify({ input })).rejects.toThrow('exact lowercase commit SHA');
  });
  it('rejects a candidate from a branch that is not merged into main', async () => {
    await expect(verify({ mergeBase: 'c'.repeat(40) })).rejects.toThrow('not reachable');
  });
  it.each(required)('requires successful %s for the candidate', async failedJob => {
    await expect(verify({ failedJob })).rejects.toThrow('not passed together');
  });
  it('rejects a missing security job', async () => {
    await expect(verify({ missingJob: required[1] })).rejects.toThrow('not passed together');
  });
  it.each([{ runSha: 'c'.repeat(40) }, { runEvent: 'pull_request' }, { runStatus: 'in_progress' }, { splitRuns: true }])('rejects mismatched or combined run evidence %j', async options => {
    await expect(verify(options)).rejects.toThrow('not passed together');
  });
  it('isolates credential consumption behind main-only verification and the staging environment', () => {
    for (const job of Object.values(workflow.jobs)) {
      expect(job.if).toBe("github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'");
    }
    expect(workflow.jobs.acceptance.needs).toBe('verify');
    expect(workflow.jobs.acceptance.environment).toBe('staging-backend');
    expect(workflow.jobs.verify.steps.some(step => Object.values(step.env ?? {}).some(value => value.includes('secrets.')))).toBe(false);
    const checkout = workflow.jobs.acceptance.steps.find(step => step.uses === 'actions/checkout@v7');
    expect(checkout?.with?.ref).toBe('${{ needs.verify.outputs.candidate_sha }}');
    const credentialSteps = workflow.jobs.acceptance.steps.filter(step => step.env?.E2E_PASS);
    expect(credentialSteps).toHaveLength(1);
    expect(credentialSteps[0].run).toBe('npx playwright test --config playwright.drawing-evidence.config.ts');
    expect(credentialSteps[0].env?.E2E_BASE_URL).toBe('http://127.0.0.1:4173');
    expect(credentialSteps[0].env?.E2E_TARGET).toBe('staging');
    expect(credentialSteps[0].env?.E2E_EXPECTED_SUPABASE_REF).toBe('ndyfjffsulfbwpmwdmic');
    const upload = workflow.jobs.acceptance.steps.find(step => step.uses === 'actions/upload-artifact@v7');
    expect(upload?.with?.path.trim().split('\n')).toEqual(['test-results/drawing-evidence/**/*.png', 'test-results/drawing-evidence/summary.json']);
  });
  it('wires a dedicated guarded setup, context and auth-state path without changing general setup', () => {
    const config = readFileSync(new URL('../../playwright.drawing-evidence.config.ts', import.meta.url), 'utf8');
    expect(config).toContain("globalSetup: './e2e/drawing-evidence-setup.ts'");
    expect(config).toContain('storageState: DRAWING_STATE_PATH');
    expect(config).toContain("serviceWorkers: 'block'");
    expect(config).toContain("reporter: [['./e2e/drawing-evidence-reporter.ts']]");
    expect(config).toContain("trace: 'off'"); expect(config).toContain("video: 'off'");
    const spec = readFileSync(new URL('../../e2e/drawing-revision-evidence.spec.ts', import.meta.url), 'utf8');
    expect(spec).toContain("import { test } from './drawing-evidence-test.js'");
    const setup = readFileSync(new URL('../../e2e/drawing-evidence-setup.ts', import.meta.url), 'utf8');
    expect(setup).toContain("newContext({ serviceWorkers: 'block' })");
    expect(setup.indexOf('await installStagingNetworkGuard(context)')).toBeLessThan(setup.indexOf('await context.newPage()'));
    const general = readFileSync(new URL('../../playwright.config.ts', import.meta.url), 'utf8');
    expect(general).toContain('globalSetup: "./e2e/global-setup.ts"');
    expect(general).toContain('storageState: "e2e/.auth/state.json"');
  });
});
