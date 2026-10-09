import { afterEach, describe, expect, it, vi } from 'vitest';
import DrawingEvidenceReporter from '../../e2e/drawing-evidence-reporter.js';

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
      globalErrors: 4, setupFailureStages: ['project', 'browser'], cases: [],
    });
    expect(JSON.stringify(write.mock.calls) + JSON.stringify(output.mock.calls)).not.toContain('private');
    expect(write.mock.calls[0][0]).toBe('test-results/drawing-evidence/summary.json');
  });
});
