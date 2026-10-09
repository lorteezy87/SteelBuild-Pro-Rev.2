import { mkdirSync, writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestError, TestResult } from '@playwright/test/reporter';

export type SyntheticSetupStage = 'environment' | 'identity' | 'project' | 'browser';

/** Errors, requests, auth state, stdout and attachments are never serialized. */
export default class SyntheticPdfReporter implements Reporter {
  private statuses: TestResult['status'][] = [];
  private errors = 0;
  private setupFailureStages = new Set<SyntheticSetupStage>();
  onTestEnd(_test: unknown, result: TestResult) { this.statuses.push(result.status); }
  onError(error: TestError) {
    this.errors++;
    // Retain only our closed stage vocabulary, never raw error text or tokens.
    const stage = /^(?:Error: )?Synthetic PDF setup failed: (environment|identity|project|browser)$/.exec(error.message || '')?.[1];
    if (stage) this.setupFailureStages.add(stage as SyntheticSetupStage);
  }
  onEnd(result: FullResult) {
    mkdirSync('test-results/synthetic-pdf', { recursive: true });
    const candidate = process.env.ACCEPTANCE_CANDIDATE_SHA || '';
    writeFileSync('test-results/synthetic-pdf/summary.json', JSON.stringify({
      candidate: /^[a-f0-9]{40}$/.test(candidate) ? candidate : 'unverified', target: 'staging',
      mode: 'synthetic-api-writes-rendered-reads', status: result.status, tests: this.statuses, globalErrors: this.errors,
      setupFailureStages: [...this.setupFailureStages],
    }, null, 2));
    console.log(`Synthetic PDF acceptance: ${result.status}; ${this.statuses.length} cases; ${this.errors} setup/runtime errors.`);
  }
}
