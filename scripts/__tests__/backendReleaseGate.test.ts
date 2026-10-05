import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Workflow = { jobs: Record<string, { needs?: string[]; steps: Array<{ with?: { script?: string } }> }> };
const workflow = load(readFileSync(new URL('../../.github/workflows/supabase-deploy-reviewed.yml', import.meta.url), 'utf8')) as Workflow;
const script = workflow.jobs.verify.steps[0].with?.script;
if (!script) throw new Error('Missing release verification script');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const execute = new AsyncFunction('github', 'context', script) as (github: unknown, context: unknown) => Promise<void>;

afterEach(() => vi.unstubAllEnvs());

function verify(options: { target?: string; ref?: string; failedJob?: string; stagingSha?: string; stagingSlug?: string; noStaging?: boolean } = {}) {
  vi.stubEnv('TARGET', options.target ?? 'production');
  vi.stubEnv('FUNCTION', 'project-export');
  const sha = 'a'.repeat(40);
  const names = ['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Release Edge Function typecheck', 'Supabase drift check'];
  const github = {
    rest: { actions: { listWorkflowRuns: 'runs', listJobsForWorkflowRun: 'jobs' } },
    paginate: vi.fn(async (method: string, params: { workflow_id?: string }) => {
      if (method === 'jobs') return names.map(name => ({ name, conclusion: options.failedJob === name ? 'failure' : 'success' }));
      if (params.workflow_id === 'ci.yml') return [{ id: 1, head_sha: sha, event: 'push', status: 'completed' }];
      return options.noStaging ? [] : [{ head_sha: options.stagingSha ?? sha, event: 'workflow_dispatch', display_title: `Deploy ${options.stagingSlug ?? 'project-export'} to staging` }];
    }),
  };
  return execute(github, { sha, ref: options.ref ?? 'refs/heads/main', repo: { owner: 'fixture', repo: 'app' } });
}

describe('executed backend release gate', () => {
  it('permits a checked production commit with matching staging evidence', async () => {
    await expect(verify()).resolves.toBeUndefined();
  });
  it.each(['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Release Edge Function typecheck', 'Supabase drift check'])('blocks a failed %s', async (failedJob) => {
    await expect(verify({ failedJob })).rejects.toThrow('Required checks');
  });
  it('blocks production outside main', async () => {
    await expect(verify({ ref: 'refs/heads/staging' })).rejects.toThrow('from main');
  });
  it.each([{ noStaging: true }, { stagingSha: 'b'.repeat(40) }, { stagingSlug: 'llm-proxy' }])('rejects missing/mismatched staging evidence %j', async (options) => {
    await expect(verify(options)).rejects.toThrow('exact commit and function');
  });
  it('allows staging before the new migration reaches production', async () => {
    await expect(verify({ target: 'staging', noStaging: true, failedJob: 'Supabase drift check' })).resolves.toBeUndefined();
  });
  it('binds the frontend publisher to security checks too', () => {
    const ci = load(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')) as Workflow;
    expect(ci.jobs['deploy-cloudflare'].needs).toEqual(expect.arrayContaining(['ci', 'secret-scan', 'supabase-drift', 'edge-typecheck']));
  });
});
