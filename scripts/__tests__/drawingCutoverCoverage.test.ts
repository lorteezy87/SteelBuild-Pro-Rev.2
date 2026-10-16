import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Step = { run?: string; if?: string; 'continue-on-error'?: boolean; env?: Record<string, string> };
type Job = { needs?: string[]; if?: string; 'continue-on-error'?: boolean; steps: Step[]; services?: Record<string, { image: string }> };
const workflow = load(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')) as { jobs: Record<string, Job> };
const drawing = 'supabase/tests/drawing-set-revision-transaction';
describe('required drawing release coverage', () => {
  it('requiredCiRunsDrawingBehavior', () => {
    expect(workflow.jobs.ci.if).toBeUndefined();
    expect(workflow.jobs.ci['continue-on-error']).not.toBe(true);
    const step = workflow.jobs.ci.steps.find(step => step.run?.includes(`npm test --prefix ${drawing}`));
    expect(step, 'drawing behavior must block required ci').toBeDefined();
    expect(step?.if).toBeUndefined();
    expect(step?.['continue-on-error']).not.toBe(true);
  });
  it('requiredPostgresRunsDrawingConcurrency', () => {
    const job = workflow.jobs['commercial-postgres'];
    expect(job.if).toBeUndefined();
    expect(job['continue-on-error']).not.toBe(true);
    expect(job.services?.postgres.image).toBe('postgres:17');
    const step = job.steps.find(step => step.run?.includes(`npm run test:postgres --prefix ${drawing}`));
    expect(step, 'drawing concurrency must block required commercial-postgres').toBeDefined();
    expect(step?.run).toContain('createdb -h 127.0.0.1 -p 5432 -U postgres steelbuild_drawing_upload_test');
    expect(step?.env?.DRAWING_UPLOAD_POSTGRES_TEST).toBe('1');
    expect(new URL(step?.env?.DRAWING_UPLOAD_POSTGRES_URL ?? 'https://missing.invalid').pathname).toBe('/steelbuild_drawing_upload_test');
    expect(step?.if).toBeUndefined();
    expect(step?.['continue-on-error']).not.toBe(true);
  });
  it.each(['prepare-sites-release', 'preview-cloudflare'])('preserves every production prerequisite for %s', name => {
    expect(workflow.jobs[name]?.needs).toEqual(expect.arrayContaining(['ci', 'secret-scan', 'supabase-drift', 'edge-typecheck', 'commercial-postgres']));
  });
});
