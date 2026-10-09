import { mkdirSync, writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestResult } from '@playwright/test/reporter';

/** Errors, requests, auth state, stdout and attachments are never serialized. */
export default class SyntheticPdfReporter implements Reporter {
  private statuses: TestResult['status'][] = [];
  private errors = 0;
  onTestEnd(_test: unknown, result: TestResult) { this.statuses.push(result.status); }
  onError() { this.errors++; }
  onEnd(result: FullResult) {
    mkdirSync('test-results/synthetic-pdf', { recursive: true });
    const candidate = process.env.ACCEPTANCE_CANDIDATE_SHA || '';
    writeFileSync('test-results/synthetic-pdf/summary.json', JSON.stringify({
      candidate: /^[a-f0-9]{40}$/.test(candidate) ? candidate : 'unverified', target: 'staging',
      mode: 'synthetic-api-writes-rendered-reads', status: result.status, tests: this.statuses, globalErrors: this.errors,
    }, null, 2));
    console.log(`Synthetic PDF acceptance: ${result.status}; ${this.statuses.length} cases; ${this.errors} setup/runtime errors.`);
  }
}
