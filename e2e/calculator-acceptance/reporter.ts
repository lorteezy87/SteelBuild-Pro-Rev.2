import { mkdirSync, writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestError, TestResult } from '@playwright/test/reporter';
import { DRAWING_SETUP_STAGES, DRAWING_FAILURE_CATEGORIES, type DrawingSetupStage, type DrawingFailureCategory } from '../drawing-evidence-reporter.js';
import { TELEMETRY_DISCARD_LIMIT } from '../stagingNetworkGuard.js';
import { INCOMPLETE_WEBGL, STAGES, VIEWPORTS, type CalculatorStage, type ViewportName } from './contracts.js';

type Outcome = 'PASS' | 'FAIL' | 'INCOMPLETE';
export function classifyCase(result: Pick<TestResult, 'status' | 'errors'>): Outcome {
  if (result.status === 'passed') return result.errors.length === 0 ? 'PASS' : 'FAIL';
  if (result.status === 'failed' && result.errors.length === 1
    && [INCOMPLETE_WEBGL, `Error: ${INCOMPLETE_WEBGL}`].includes(result.errors[0].message || '')) return 'INCOMPLETE';
  return 'FAIL';
}

/** Explicit fields only; never emit errors, stdout, attachments or auth. */
export default class CalculatorReporter implements Reporter {
  private cases: Array<{ viewport: ViewportName | 'unknown'; stage: CalculatorStage | 'unknown'; status: Outcome }> = [];
  private globalErrors = 0;
  private setupFailureStages = new Set<DrawingSetupStage>();
  private setupFailureCategories = new Set<DrawingFailureCategory>();
  private failedSetupTelemetryDiscarded = 0;
  onTestEnd(test: TestCase, result: TestResult): void {
    const name = test.parent.project()?.name;
    const stage = test.annotations.find(annotation => annotation.type === 'calculator-stage')?.description;
    this.cases.push({
      viewport: VIEWPORTS.find(profile => profile.name === name)?.name || 'unknown',
      stage: STAGES.find(value => value === stage) || 'unknown', status: classifyCase(result),
    });
  }
  onError(error: TestError): void {
    this.globalErrors++;
    const match = /^(?:Error: )?Drawing evidence setup failed: ([a-z-]+); categories=([a-z,-]+); discarded=(\d{1,2})$/.exec(error.message || '');
    if (!match || !DRAWING_SETUP_STAGES.includes(match[1] as DrawingSetupStage)) return;
    const categories = match[2] === 'none' ? [] : match[2].split(',');
    const discarded = Number(match[3]);
    if (discarded > TELEMETRY_DISCARD_LIMIT || categories.some(category => !DRAWING_FAILURE_CATEGORIES.includes(category as DrawingFailureCategory))) return;
    this.setupFailureStages.add(match[1] as DrawingSetupStage);
    for (const category of categories) this.setupFailureCategories.add(category as DrawingFailureCategory);
    this.failedSetupTelemetryDiscarded = Math.max(this.failedSetupTelemetryDiscarded, discarded);
  }
  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    const allViewports = this.cases.length === VIEWPORTS.length && VIEWPORTS.every(profile => this.cases.filter(value => value.viewport === profile.name).length === 1);
    const failed = this.globalErrors > 0 || !allViewports || this.cases.some(value => value.status === 'FAIL'
      || (value.status === 'PASS' && value.stage !== 'final-health') || (value.status === 'INCOMPLETE' && value.stage !== 'webgl'));
    const incomplete = this.cases.some(value => value.status === 'INCOMPLETE');
    const status: Outcome = failed || (!incomplete && result.status !== 'passed') ? 'FAIL' : incomplete ? 'INCOMPLETE' : 'PASS';
    const candidate = process.env.ACCEPTANCE_CANDIDATE_SHA || '';
    mkdirSync('test-results/calculator-acceptance', { recursive: true });
    writeFileSync('test-results/calculator-acceptance/summary.json', JSON.stringify({
      candidate: /^[a-f0-9]{40}$/.test(candidate) ? candidate : 'unverified',
      target: 'staging', mode: 'authenticated-read-only-calculator-layout', status,
      globalErrors: this.globalErrors, setupFailureStages: [...this.setupFailureStages],
      setupFailureCategories: [...this.setupFailureCategories], failedSetupTelemetryDiscarded: this.failedSetupTelemetryDiscarded,
      cases: this.cases,
      scope: 'Blank-input layout and local controls; no engineering calculation certification',
    }, null, 2));
    console.log(`Calculator acceptance: ${status}; ${this.cases.length} viewport cases.`);
    return { status: status === 'PASS' ? 'passed' : 'failed' };
  }
}
