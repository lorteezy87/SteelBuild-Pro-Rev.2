import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import Reporter, { classifyCase } from '../../e2e/calculator-acceptance/reporter.js';
import { INCOMPLETE_WEBGL, VIEWPORTS } from '../../e2e/calculator-acceptance/contracts.js';

const { write } = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('node:fs', () => ({ mkdirSync: vi.fn(), writeFileSync: write }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); write.mockClear(); });
function runCases(options: { unavailable?: string; extraError?: boolean; omit?: string; stage?: string } = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.stubEnv('ACCEPTANCE_CANDIDATE_SHA', 'a'.repeat(40));
  const reporter = new Reporter();
  for (const profile of VIEWPORTS.filter(value => value.name !== options.omit)) {
    const unavailable = profile.name === options.unavailable;
    reporter.onTestEnd({ parent: { project: () => ({ name: profile.name }) },
      annotations: [{ type: 'calculator-stage', description: options.stage ?? (unavailable ? 'webgl' : 'final-health') }],
    } as unknown as TestCase, { status: unavailable ? 'failed' : 'passed',
      errors: unavailable ? [{ message: `Error: ${INCOMPLETE_WEBGL}` }, ...(options.extraError ? [{ message: 'private-token' }] : [])] : [],
      stdout: ['private-token'], attachments: [{ body: Buffer.from('private-token') }],
    } as unknown as TestResult);
  }
  return reporter;
}
describe('closed calculator acceptance reporting', () => {
  it('passes only a complete six-viewport run', async () => {
    const reporter = runCases();
    expect(await reporter.onEnd({ status: 'passed', startTime: new Date(0), duration: 1 })).toEqual({ status: 'passed' });
    const summary = JSON.parse(write.mock.calls[0][1]);
    expect(summary.status).toBe('PASS'); expect(summary.cases).toHaveLength(6);
    expect(JSON.stringify(summary)).not.toContain('private-token');
  });
  it('returns nonzero failure for explicit WebGL incompleteness', async () => {
    const reporter = runCases({ unavailable: 'phone-360' });
    expect(await reporter.onEnd({ status: 'failed', startTime: new Date(0), duration: 1 })).toEqual({ status: 'failed' });
    expect(JSON.parse(write.mock.calls[0][1]).status).toBe('INCOMPLETE');
  });
  it.each([{ unavailable: 'phone-360', extraError: true }, { omit: 'desktop' }, { stage: 'private-token' }, { stage: 'content' }, { unavailable: 'phone-360', stage: 'content' }])('never hides another failure as platform incompleteness: %j', async options => {
    const reporter = runCases(options);
    expect(await reporter.onEnd({ status: 'failed', startTime: new Date(0), duration: 1 })).toEqual({ status: 'failed' });
    const summary = JSON.parse(write.mock.calls[0][1]);
    expect(summary.status).toBe('FAIL'); expect(JSON.stringify(summary)).not.toContain('private-token');
  });
  it('keeps only closed setup diagnostic fields', async () => {
    const reporter = runCases();
    reporter.onError({ message: 'Drawing evidence setup failed: browser-probe-health; categories=browser-console; discarded=3', stack: 'private-token' });
    reporter.onError({ message: 'Drawing evidence setup failed: identity; categories=private-token; discarded=3' });
    await reporter.onEnd({ status: 'failed', startTime: new Date(0), duration: 1 });
    const summary = JSON.parse(write.mock.calls[0][1]);
    expect(summary.status).toBe('FAIL');
    expect(summary.setupFailureStages).toEqual(['browser-probe-health']);
    expect(summary.setupFailureCategories).toEqual(['browser-console']);
    expect(summary.failedSetupTelemetryDiscarded).toBe(3);
    expect(JSON.stringify(summary)).not.toContain('private-token');
  });
  it.each(['timedOut', 'skipped', 'interrupted'] as const)('does not call %s a pass or unavailable', status => {
    expect(classifyCase({ status, errors: [{ message: INCOMPLETE_WEBGL }] })).toBe('FAIL');
  });
  it('rejects contradictory passed status with runtime errors', () => {
    expect(classifyCase({ status: 'passed', errors: [{ message: 'private-token' }] })).toBe('FAIL');
  });
});
