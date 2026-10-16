import { mkdirSync, writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export const REQUIRED_DRAWING_CASES = [
  'drawing:preflight', 'drawing:protected-negative', 'drawing:upload-new', 'drawing:upload-revision',
  'drawing:lost-response-reload', 'drawing:two-tab-retry', 'drawing:role-org-project', 'drawing:removed-membership',
  'drawing:mfa', 'drawing:storage-protection', 'drawing:metadata-calibration', 'drawing:holds-locks',
  'drawing:rounds-fab', 'drawing:exports', 'drawing:manual-intake', 'drawing:stop-recovery', 'drawing:erasure', 'drawing:advisors',
  'fab:blocked', 'fab:override', 'fab:clean', 'fab:viewer',
] as const;
const fabTitles: Record<string, string> = {
  'BLOCKED: open RFI + no override is refused by the server': 'fab:blocked',
  'OVERRIDE: same package with a reason inserts and snapshots the blocking set': 'fab:override',
  'CLEAN: package with no open RFIs releases with an empty blocking set': 'fab:clean',
  'RLS: a viewer-role user cannot record a release': 'fab:viewer',
};
export type SafeCase = { id: string; status: 'passed' | 'failed' | 'skipped'; durationMs: number };
export function summarizeCases(cases: SafeCase[], runtimeError = false) {
  const known = new Set<string>(REQUIRED_DRAWING_CASES);
  const unexpected = cases.some(c => !known.has(c.id)) || new Set(cases.map(c => c.id)).size !== cases.length;
  const missing = REQUIRED_DRAWING_CASES.filter(id => !cases.some(c => c.id === id && c.status === 'passed'));
  return { version: 1, status: runtimeError || unexpected || cases.some(c => c.status === 'failed') ? 'FAIL' : missing.length ? 'INCOMPLETE' : 'PASS',
    scope: 'hosted-drawing-acceptance', cases: cases.filter(c => known.has(c.id)), missing,
    reason: runtimeError ? 'RUNNER_ERROR' : unexpected ? 'UNEXPECTED_OR_DUPLICATE_CASE' : missing.length ? 'REQUIRED_CASES_UNPROVED' : 'ALL_REQUIRED_CASES_PASSED' };
}
/** No raw title, error, stack, stdout, stderr, attachment, annotation or URL is emitted. */
export default class DrawingCutoverReporter implements Reporter {
  private cases: SafeCase[] = [];
  private runtimeError = false;
  onTestEnd(test: TestCase, result: TestResult): void {
    const id = fabTitles[test.title] ?? (REQUIRED_DRAWING_CASES as readonly string[]).find(id => id === test.title) ?? 'unknown';
    this.cases.push({ id, status: result.status === 'passed' ? 'passed' : result.status === 'skipped' ? 'skipped' : 'failed', durationMs: Math.max(0, Math.round(result.duration)) });
  }
  onError(): void { this.runtimeError = true; }
  onStdOut(): void { /* Private application output is intentionally not persisted. */ }
  onStdErr(): void { /* Private transport output is intentionally not persisted. */ }
  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    const summary = summarizeCases(this.cases, this.runtimeError || result.status !== 'passed');
    mkdirSync('test-results/drawing-cutover', { recursive: true });
    const candidateSha = /^[a-f0-9]{40}$/.test(process.env.DRAWING_CUTOVER_CANDIDATE_SHA ?? '') ? process.env.DRAWING_CUTOVER_CANDIDATE_SHA : null;
    const manifestSha256 = /^[a-f0-9]{64}$/.test(process.env.DRAWING_CUTOVER_MANIFEST_SHA256 ?? '') ? process.env.DRAWING_CUTOVER_MANIFEST_SHA256 : null;
    writeFileSync('test-results/drawing-cutover/summary.json', JSON.stringify({ ...summary, candidateSha, manifestSha256 }, null, 2) + '\n', { mode: 0o600 });
    console.log(`Drawing acceptance: ${summary.status}; passed=${summary.cases.filter(c => c.status === 'passed').length}; missing=${summary.missing.length}`);
    return { status: summary.status === 'PASS' ? 'passed' : 'failed' };
  }
}
