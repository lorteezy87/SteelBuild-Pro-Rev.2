import { mkdirSync, writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestError, TestResult } from '@playwright/test/reporter';

export type DrawingSetupStage = 'environment' | 'identity' | 'project' | 'browser';

/** Never serialize errors, attachments, request bodies, auth state or stdout. */
export default class DrawingEvidenceReporter implements Reporter {
  private cases: Array<{ viewport: string; status: TestResult['status'] }> = [];
  private globalErrors = 0;
  private setupFailureStages = new Set<DrawingSetupStage>();

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name;
    this.cases.push({ viewport: project === 'desktop' || project === 'mobile' ? project : 'unknown', status: result.status });
  }

  onError(error: TestError): void {
    this.globalErrors++;
    // Only our closed stage vocabulary survives. Raw errors, stacks, URLs,
    // response bodies and credentials never reach the retained summary.
    const stage = /^(?:Error: )?Drawing evidence setup failed: (environment|identity|project|browser)$/.exec(error.message || '')?.[1];
    if (stage) this.setupFailureStages.add(stage as DrawingSetupStage);
  }

  onEnd(result: FullResult): void {
    const candidate = process.env.ACCEPTANCE_CANDIDATE_SHA || '';
    mkdirSync('test-results/drawing-evidence', { recursive: true });
    writeFileSync('test-results/drawing-evidence/summary.json', JSON.stringify({
      candidate: /^[a-f0-9]{40}$/.test(candidate) ? candidate : 'unverified',
      target: 'staging',
      mode: 'authenticated-read-only',
      status: result.status,
      globalErrors: this.globalErrors,
      setupFailureStages: [...this.setupFailureStages],
      cases: this.cases,
    }, null, 2));
    console.log(`Drawing evidence acceptance: ${result.status}; ${this.cases.length} cases; ${this.globalErrors} setup/runtime errors. See retained screenshots.`);
  }
}
