import { readFileSync } from 'node:fs';

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface Job {
  if?: string;
  needs?: string[];
  steps: Step[];
}

interface Workflow {
  on?: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const workflowSource = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const workflow = load(workflowSource) as Workflow;

describe('Sites production release handoff', () => {
  it('builds an immutable handoff only after every required release gate', () => {
    const job = workflow.jobs['prepare-sites-release'];
    expect(job).toBeDefined();
    expect(job.needs).toEqual(expect.arrayContaining([
      'ci',
      'secret-scan',
      'supabase-drift',
      'edge-typecheck',
      'commercial-postgres',
    ]));
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.if).toContain("github.event_name == 'push'");

    const commands = job.steps.map(({ run }) => run ?? '').join('\n');
    expect(commands).toContain('npm run sites:release:create');
    expect(commands).not.toContain('wrangler deploy');
    expect(commands).not.toContain('CLOUDFLARE_API_TOKEN');

    const upload = job.steps.find(({ uses }) => uses?.startsWith('actions/upload-artifact@'));
    expect(upload?.with).toMatchObject({
      name: 'sites-production-${{ github.sha }}',
      path: 'release/',
      'if-no-files-found': 'error',
    });
  });

  it('does not claim that pre-promotion checks are post-deploy acceptance', () => {
    expect(workflow.jobs['e2e-smoke']).toBeUndefined();
    expect(workflow.jobs['deploy-cloudflare']).toBeUndefined();
    expect(workflowSource).not.toContain('CLOUDFLARE_ENABLED');
  });

  it('verifies the promoted Sites version against the gated artifact on demand', () => {
    const verification = load(readFileSync(new URL('../../.github/workflows/sites-production-verify.yml', import.meta.url), 'utf8')) as Workflow;
    expect(verification.on).toHaveProperty('workflow_dispatch');
    const steps = verification.jobs.verify.steps;
    const commands = steps.map(({ run }) => run ?? '').join('\n');
    expect(commands).toContain('gh run view');
    expect(commands).toContain('gh run download');
    expect(commands).toContain('npm run sites:release:verify');
    expect(commands).toContain('npm run sites:verify:production');
    expect(commands.indexOf('npm run sites:release:verify')).toBeLessThan(commands.indexOf('npm run sites:verify:production'));
    expect(steps.findIndex(({ run }) => run?.includes('gh run view')))
      .toBeLessThan(steps.findIndex(({ uses }) => uses?.startsWith('actions/checkout@')));
  });
});
