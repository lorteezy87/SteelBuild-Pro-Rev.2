import { mkdirSync, writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** Never serialize errors, attachments, request bodies, auth state or stdout. */
export default class DrawingEvidenceReporter implements Reporter {
  private cases: Array<{ viewport: string; status: TestResult['status'] }> = [];
  private globalErrors = 0;

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name;
    this.cases.push({ viewport: project === 'desktop' || project === 'mobile' ? project : 'unknown', status: result.status });
  }

  onError(): void { this.globalErrors++; }

  onEnd(result: FullResult): void {
    const candidate = process.env.ACCEPTANCE_CANDIDATE_SHA || '';
    mkdirSync('test-results/drawing-evidence', { recursive: true });
    writeFileSync('test-results/drawing-evidence/summary.json', JSON.stringify({
      candidate: /^[a-f0-9]{40}$/.test(candidate) ? candidate : 'unverified',
      target: 'staging',
      mode: 'authenticated-read-only',
      status: result.status,
      globalErrors: this.globalErrors,
      cases: this.cases,
    }, null, 2));
    console.log(`Drawing evidence acceptance: ${result.status}; ${this.cases.length} cases; ${this.globalErrors} setup/runtime errors. See retained screenshots.`);
  }
}
