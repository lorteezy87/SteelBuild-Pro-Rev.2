import { chromium, expect } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { observeReadOnlyPage } from './acceptance.js';
import { APP_ORIGIN, STAGING_ORIGIN, installStagingNetworkGuard } from './stagingNetworkGuard.js';
import { setupFailureMessage, type DrawingFailureCategory, type DrawingSetupDiagnostics, type DrawingSetupStage } from './drawing-evidence-reporter.js';
import {
  DRAWING_ORG_ID, DRAWING_PROJECT_ID, DRAWING_STATE_PATH, ORG_READ, PROJECT_READ,
  DrawingEvidenceTransport, assertDrawingEvidenceEnvironment, assertDrawingParent, validateDrawingSession,
} from './drawingEvidenceTransport.js';

/** Dedicated to the protected drawing runner; general E2E setup is unchanged. */
export default async function drawingEvidenceSetup(): Promise<void> {
  let stage: DrawingSetupStage = 'environment';
  let diagnostics: () => DrawingSetupDiagnostics = () => ({ telemetryDiscarded: 0, failureCategories: [] });
  try { await executeSetup(nextStage => { stage = nextStage; }, readDiagnostics => { diagnostics = readDiagnostics; }); }
  catch { throw new Error(setupFailureMessage(stage, diagnostics())); }
}

async function executeSetup(onStage: (stage: DrawingSetupStage) => void, onDiagnostics: (read: () => DrawingSetupDiagnostics) => void): Promise<void> {
  assertDrawingEvidenceEnvironment();
  // Never reuse an earlier auth session after a failed setup.
  rmSync(DRAWING_STATE_PATH, { force: true });
  onStage('identity');
  const key = process.env.E2E_SUPABASE_ANON_KEY!;
  const auth = new DrawingEvidenceTransport(key);
  const response = await auth.send('/auth/v1/token?grant_type=password', 'POST', { email: process.env.E2E_USER, password: process.env.E2E_PASS });
  const session = validateDrawingSession(await response.json());
  onStage('project');
  const api = new DrawingEvidenceTransport(key, session.access_token);
  const projects = await api.send(PROJECT_READ);
  const organizations = await api.send(ORG_READ);
  assertDrawingParent(await projects.json(), await organizations.json());
  process.env.E2E_PROJECT_ID = DRAWING_PROJECT_ID;

  onStage('browser-launch');
  const browser = await chromium.launch();
  try {
    onStage('browser-context');
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const network = await installStagingNetworkGuard(context);
    const page = await context.newPage();
    const browserFailures = new Set<DrawingFailureCategory>();
    // Count only closed categories. Never read console text or runtime errors.
    page.on('console', message => { if (message.type() === 'error') browserFailures.add('browser-console'); });
    page.on('pageerror', () => { browserFailures.add('browser-runtime'); });
    onDiagnostics(() => ({ ...network.diagnostics(), failureCategories: [...network.diagnostics().failureCategories, ...browserFailures] }));
    const probe = await observeReadOnlyPage(page, STAGING_ORIGIN);
    onStage('browser-origin');
    await page.goto(APP_ORIGIN, { waitUntil: 'domcontentloaded' });
    onStage('browser-session');
    await page.evaluate(({ value, org }) => {
      localStorage.setItem('sb-ndyfjffsulfbwpmwdmic-auth-token', value);
      localStorage.setItem('sbp:current-org', org);
    }, { value: JSON.stringify(session), org: DRAWING_ORG_ID });
    onStage('browser-projects');
    await page.goto(`${APP_ORIGIN}/Projects`, { waitUntil: 'domcontentloaded' });
    onStage('browser-main');
    await expect(page.getByRole('main', { name: 'Main content', exact: true })).toBeVisible({ timeout: 30_000 });
    onStage('browser-cache');
    await expect.poll(() => page.evaluate(({ userId, orgId, projectId }) => {
      try {
        const cached = JSON.parse(localStorage.getItem('sbp_projects_cache') || 'null');
        return cached?.version === 2 && cached.owner?.userId === userId && cached.owner?.orgId === orgId
          && cached.projects?.some((row: { id?: string }) => row.id === projectId);
      } catch { return false; }
    }, { userId: session.user.id, orgId: DRAWING_ORG_ID, projectId: DRAWING_PROJECT_ID }), {
      timeout: 30_000, message: 'The authenticated app must load its owned staging project cache',
    }).toBe(true);
    onStage('browser-picker-open');
    await page.locator('button[aria-label^="Project picker:"]:visible').first().click();
    const picker = page.getByRole('dialog', { name: 'Choose project', exact: true });
    onStage('browser-picker-search');
    await picker.getByRole('combobox', { name: 'Search projects', exact: true }).fill('STG-0001');
    onStage('browser-picker-select');
    await picker.locator(`[id="project-option-${DRAWING_PROJECT_ID}"]`).click();
    onStage('browser-selection');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('activeProjectId'))).toBe(DRAWING_PROJECT_ID);
    onStage('browser-probe-settle');
    await probe.settle();
    onStage('browser-network-settle');
    await network.settle();
    onStage('browser-probe-health');
    probe.assertHealthy();
    onStage('browser-network-health');
    network.assertHealthy();
    onStage('browser-save-state');
    mkdirSync('e2e/.auth', { recursive: true });
    await context.storageState({ path: DRAWING_STATE_PATH });
  } finally { await browser.close(); }
}
