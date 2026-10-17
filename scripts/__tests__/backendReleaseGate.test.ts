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

function verify(options: { target?: string; slug?: string; ref?: string; failedJob?: string; stagingSha?: string; stagingSlug?: string; noStaging?: boolean } = {}) {
  vi.stubEnv('TARGET', options.target ?? 'production');
  vi.stubEnv('FUNCTION', options.slug ?? 'project-export');
  const sha = 'a'.repeat(40);
  const names = ['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Release Edge Function typecheck', 'Commercial SQL + concurrent PostgreSQL acceptance', 'Supabase drift check'];
  const github = {
    rest: { actions: { listWorkflowRuns: 'runs', listJobsForWorkflowRun: 'jobs' } },
    paginate: vi.fn(async (method: string, params: { workflow_id?: string }) => {
      if (method === 'jobs') return names.map(name => ({ name, conclusion: options.failedJob === name ? 'failure' : 'success' }));
      if (params.workflow_id === 'ci.yml') return [{ id: 1, head_sha: sha, event: 'push', status: 'completed' }];
      return options.noStaging ? [] : [{ head_sha: options.stagingSha ?? sha, event: 'workflow_dispatch', display_title: `Deploy ${options.stagingSlug ?? options.slug ?? 'project-export'} to staging` }];
    }),
  };
  return execute(github, { sha, ref: options.ref ?? 'refs/heads/main', repo: { owner: 'fixture', repo: 'app' } });
}

describe('executed backend release gate', () => {
  it('retains the original bundle without extracting server-controlled paths', () => {
    const source = readFileSync(new URL('../../.github/workflows/supabase-deploy-reviewed.yml', import.meta.url), 'utf8');
    expect(source).toContain('/functions/$FUNCTION/body');
    expect(source).toContain('function-before.multipart');
    expect(source).toContain('Accept: multipart/form-data');
    expect(source).toContain('sha256sum');
    expect(source).toContain("--write-out '%{http_code}'");
    expect(source).toContain('assertBackendBundle(Number(process.env.BUNDLE_HTTP_STATUS)');
    expect(source).not.toContain('functions download');
    expect(source).toContain('if-no-files-found: error');
  });
  it('keeps isolated Stripe key provisioning behind staging-only billing selection', () => {
    const source = readFileSync(new URL('../../.github/workflows/supabase-deploy-reviewed.yml', import.meta.url), 'utf8');
    const parsed = load(source) as { jobs: { deploy: { steps: Array<{ name?: string; if?: string; run?: string }> } } };
    const step = parsed.jobs.deploy.steps.find(step => step.name === 'Configure isolated staging billing key and return origin');
    expect(step?.if).toBe("inputs.target == 'staging' && inputs.function == 'stripe-billing'");
    expect(step?.run).toContain('https://api.supabase.com/v1/projects/ndyfjffsulfbwpmwdmic/secrets');
    expect(step?.run).not.toContain('kjrwqagyeswwoxpjkcko');
    expect(step?.run).not.toContain("name: 'STRIPE_SECRET_KEY'");
  });
  it('permits a checked production commit with matching staging evidence', async () => {
    await expect(verify()).resolves.toBeUndefined();
  });
  it.each(['llm-proxy', 'project-export', 'stripe-billing', 'email-send', 'command-center-read', 'command-center-session-handoff', 'account-delete'])('permits the reviewed %s with matching staging evidence', async (slug) => {
    await expect(verify({ slug })).resolves.toBeUndefined();
  });
  it.each(['email-ingest', 'health', 'staging-e2e-bootstrap', 'sheets-api', 'sharepoint-proxy', 'all', ''])('rejects the unreviewed selection %s', async (slug) => {
    await expect(verify({ slug })).rejects.toThrow('Unsupported');
  });
  it.each(['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)', 'Release Edge Function typecheck', 'Commercial SQL + concurrent PostgreSQL acceptance', 'Supabase drift check'])('blocks a failed %s', async (failedJob) => {
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
  it('requires commercial transaction checks for staging too', async () => {
    await expect(verify({ target: 'staging', failedJob: 'Commercial SQL + concurrent PostgreSQL acceptance' })).rejects.toThrow('Required checks');
  });
  it('binds the frontend publisher to security checks too', () => {
    const ci = load(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')) as Workflow;
    expect(ci.jobs['prepare-sites-release'].needs).toEqual(expect.arrayContaining(['ci', 'secret-scan', 'supabase-drift', 'edge-typecheck', 'commercial-postgres']));
  });
});
