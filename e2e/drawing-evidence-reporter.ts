import { mkdirSync, writeFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestError, TestResult } from '@playwright/test/reporter';
import { NETWORK_FAILURE_CATEGORIES, TELEMETRY_DISCARD_LIMIT } from './stagingNetworkGuard.js';

export const DRAWING_SETUP_STAGES = ['environment', 'identity', 'project', 'browser',
  'browser-launch', 'browser-context', 'browser-origin', 'browser-session', 'browser-projects',
  'browser-main', 'browser-cache', 'browser-picker-open', 'browser-picker-search', 'browser-picker-select',
  'browser-selection', 'browser-probe-settle', 'browser-network-settle', 'browser-probe-health',
  'browser-network-health', 'browser-save-state'] as const;
export type DrawingSetupStage = typeof DRAWING_SETUP_STAGES[number];
export const DRAWING_FAILURE_CATEGORIES = [...NETWORK_FAILURE_CATEGORIES, 'browser-console', 'browser-runtime'] as const;
export type DrawingFailureCategory = typeof DRAWING_FAILURE_CATEGORIES[number];
export interface DrawingSetupDiagnostics { telemetryDiscarded: number; failureCategories: DrawingFailureCategory[] }

export function setupFailureMessage(stage: DrawingSetupStage, diagnostics: DrawingSetupDiagnostics): string {
  const categories = DRAWING_FAILURE_CATEGORIES.filter(category => diagnostics.failureCategories.includes(category));
  const discarded = Number.isInteger(diagnostics.telemetryDiscarded)
    && diagnostics.telemetryDiscarded >= 0 && diagnostics.telemetryDiscarded <= TELEMETRY_DISCARD_LIMIT
    ? diagnostics.telemetryDiscarded : 0;
  return `Drawing evidence setup failed: ${stage}; categories=${categories.join(',') || 'none'}; discarded=${discarded}`;
}

/** Never serialize errors, attachments, request bodies, auth state or stdout. */
export default class DrawingEvidenceReporter implements Reporter {
  private cases: Array<{ viewport: string; status: TestResult['status'] }> = [];
  private globalErrors = 0;
  private setupFailureStages = new Set<DrawingSetupStage>();
  private setupFailureCategories = new Set<DrawingFailureCategory>();
  private failedSetupTelemetryDiscarded = 0;

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name;
    this.cases.push({ viewport: project === 'desktop' || project === 'mobile' ? project : 'unknown', status: result.status });
  }

  onError(error: TestError): void {
    this.globalErrors++;
    // Only our closed stage vocabulary survives. Raw errors, stacks, URLs,
    // response bodies and credentials never reach the retained summary.
    const match = /^(?:Error: )?Drawing evidence setup failed: ([a-z-]+)(?:; categories=([a-z,-]+); discarded=(\d{1,2}))?$/.exec(error.message || '');
    if (!match || !DRAWING_SETUP_STAGES.includes(match[1] as DrawingSetupStage)) return;
    const categories = match[2] === undefined || match[2] === 'none' ? [] : match[2].split(',');
    if (categories.some(category => !DRAWING_FAILURE_CATEGORIES.includes(category as DrawingFailureCategory))) return;
    const discarded = Number(match[3] || 0);
    if (discarded > TELEMETRY_DISCARD_LIMIT) return;
    this.setupFailureStages.add(match[1] as DrawingSetupStage);
    for (const category of categories) this.setupFailureCategories.add(category as DrawingFailureCategory);
    this.failedSetupTelemetryDiscarded = Math.max(this.failedSetupTelemetryDiscarded, discarded);
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
      setupFailureCategories: [...this.setupFailureCategories],
      failedSetupTelemetryDiscarded: this.failedSetupTelemetryDiscarded,
      cases: this.cases,
    }, null, 2));
    console.log(`Drawing evidence acceptance: ${result.status}; ${this.cases.length} cases; ${this.globalErrors} setup/runtime errors. See retained screenshots.`);
  }
}
