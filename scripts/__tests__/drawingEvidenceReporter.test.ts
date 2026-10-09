import { afterEach, describe, expect, it, vi } from 'vitest';
import DrawingEvidenceReporter, { setupFailureMessage } from '../../e2e/drawing-evidence-reporter.js';

const { write } = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('node:fs', () => ({ mkdirSync: vi.fn(), writeFileSync: write }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); write.mockClear(); });

describe('secret-preserving drawing acceptance reporter', () => {
  it('retains only the fixed setup stage and never arbitrary failure details', () => {
    vi.stubEnv('ACCEPTANCE_CANDIDATE_SHA', 'a'.repeat(40));
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const reporter = new DrawingEvidenceReporter();
    reporter.onError({ message: 'Error: Drawing evidence setup failed: project', stack: 'private-stack' });
    reporter.onError({ message: 'Drawing evidence setup failed: browser' });
    reporter.onError({ message: 'Drawing evidence setup failed: identity private-token', stack: 'private-stack' });
    reporter.onError({ message: 'https://private.example/path?access_token=private-token' });
    reporter.onEnd({ status: 'failed', startTime: new Date(0), duration: 1 });
    expect(JSON.parse(write.mock.calls[0][1])).toEqual({
      candidate: 'a'.repeat(40), target: 'staging', mode: 'authenticated-read-only', status: 'failed',
      globalErrors: 4, setupFailureStages: ['project', 'browser'], setupFailureCategories: [], failedSetupTelemetryDiscarded: 0, cases: [],
    });
    expect(JSON.stringify(write.mock.calls) + JSON.stringify(output.mock.calls)).not.toContain('private');
    expect(write.mock.calls[0][0]).toBe('test-results/drawing-evidence/summary.json');
  });
  it('retains closed browser substeps, categories and bounded counts, rejecting tainted diagnostics entirely', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const reporter = new DrawingEvidenceReporter();
    reporter.onError({ message: setupFailureMessage('browser-probe-health', { telemetryDiscarded: 3, failureCategories: ['browser-console', 'blocked-route'] }) });
    reporter.onError({ message: 'Drawing evidence setup failed: browser-main; categories=private-token; discarded=1' });
    reporter.onError({ message: 'Drawing evidence setup failed: browser-main; categories=none; discarded=65' });
    reporter.onError({ message: 'Drawing evidence setup failed: private-token; categories=none; discarded=1' });
    reporter.onEnd({ status: 'failed', startTime: new Date(0), duration: 1 });
    const summary = JSON.parse(write.mock.calls[0][1]);
    expect(summary.setupFailureStages).toEqual(['browser-probe-health']);
    expect(summary.setupFailureCategories).toEqual(['blocked-route', 'browser-console']);
    expect(summary.failedSetupTelemetryDiscarded).toBe(3);
    expect(JSON.stringify(summary)).not.toContain('private');
  });
});
