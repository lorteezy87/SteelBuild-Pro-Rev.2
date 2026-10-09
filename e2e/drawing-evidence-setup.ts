import { chromium, expect } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { observeReadOnlyPage } from './acceptance.js';
import { APP_ORIGIN, STAGING_ORIGIN, installStagingNetworkGuard } from './stagingNetworkGuard.js';
import type { DrawingSetupStage } from './drawing-evidence-reporter.js';
import {
  DRAWING_ORG_ID, DRAWING_PROJECT_ID, DRAWING_STATE_PATH, ORG_READ, PROJECT_READ,
  DrawingEvidenceTransport, assertDrawingEvidenceEnvironment, assertDrawingParent, validateDrawingSession,
} from './drawingEvidenceTransport.js';

/** Dedicated to the protected drawing runner; general E2E setup is unchanged. */
export default async function drawingEvidenceSetup(): Promise<void> {
  let stage: DrawingSetupStage = 'environment';
  try { await executeSetup(nextStage => { stage = nextStage; }); }
  catch { throw new Error(`Drawing evidence setup failed: ${stage}`); }
}

async function executeSetup(onStage: (stage: DrawingSetupStage) => void): Promise<void> {
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

  onStage('browser');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const network = await installStagingNetworkGuard(context);
    const page = await context.newPage();
    const probe = await observeReadOnlyPage(page, STAGING_ORIGIN);
    await page.goto(APP_ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ value, org }) => {
      localStorage.setItem('sb-ndyfjffsulfbwpmwdmic-auth-token', value);
      localStorage.setItem('sbp:current-org', org);
    }, { value: JSON.stringify(session), org: DRAWING_ORG_ID });
    await page.goto(`${APP_ORIGIN}/Projects`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main', { name: 'Main content', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(({ userId, orgId, projectId }) => {
      try {
        const cached = JSON.parse(localStorage.getItem('sbp_projects_cache') || 'null');
        return cached?.version === 2 && cached.owner?.userId === userId && cached.owner?.orgId === orgId
          && cached.projects?.some((row: { id?: string }) => row.id === projectId);
      } catch { return false; }
    }, { userId: session.user.id, orgId: DRAWING_ORG_ID, projectId: DRAWING_PROJECT_ID }), {
      timeout: 30_000, message: 'The authenticated app must load its owned staging project cache',
    }).toBe(true);
    await page.locator('button[aria-label^="Project picker:"]:visible').first().click();
    const picker = page.getByRole('dialog', { name: 'Choose project', exact: true });
    await picker.getByRole('combobox', { name: 'Search projects', exact: true }).fill('STG-0001');
    await picker.locator(`[id="project-option-${DRAWING_PROJECT_ID}"]`).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('activeProjectId'))).toBe(DRAWING_PROJECT_ID);
    await probe.settle();
    await network.settle();
    probe.assertHealthy(); network.assertHealthy();
    mkdirSync('e2e/.auth', { recursive: true });
    await context.storageState({ path: DRAWING_STATE_PATH });
  } finally { await browser.close(); }
}
