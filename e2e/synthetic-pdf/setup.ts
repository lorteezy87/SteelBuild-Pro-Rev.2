import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { APP, ORG, PROJECT, STATE, assertPublicKey, assertRuntime, fixtureFor } from './fixture';
import { ScopedTransport, installBrowserGuard } from './guard';

export default async function setup(): Promise<void> {
  assertRuntime();
  const key = process.env.E2E_SUPABASE_ANON_KEY || '';
  if (!key || !process.env.E2E_USER || !process.env.E2E_PASS) throw new Error('Missing protected staging credentials');
  assertPublicKey(key);
  const auth = new ScopedTransport(null, key, key);
  const response = await auth.send('/auth/v1/token?grant_type=password', 'POST', { email: process.env.E2E_USER, password: process.env.E2E_PASS });
  if (!response.ok) throw new Error('Protected staging sign-in failed');
  const session = await response.json();
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) throw new Error('Incomplete staging session');
  const api = new ScopedTransport(fixtureFor(process.env.GITHUB_RUN_ID!, process.env.GITHUB_RUN_ATTEMPT!), key, session.access_token);
  const projectResponse = await api.send(`/rest/v1/projects?id=eq.${PROJECT}&limit=100&select=id,name,project_number,org_id,is_deleted,on_hold`);
  const orgResponse = await api.send(`/rest/v1/organizations?id=eq.${ORG}&limit=100&select=id,name`);
  if (!projectResponse.ok || !orgResponse.ok) throw new Error('Synthetic parent is inaccessible');
  const projects = await projectResponse.json(); const orgs = await orgResponse.json();
  if (projects.length !== 1 || projects[0].org_id !== ORG || projects[0].name !== 'STAGING — Warehouse Expansion'
    || projects[0].project_number !== 'STG-0001' || projects[0].is_deleted || projects[0].on_hold
    || orgs.length !== 1 || orgs[0].name !== 'Example Fabrication (staging)') throw new Error('Synthetic parent identity mismatch');
  const role = await api.send('/rest/v1/rpc/get_my_project_role', 'POST', { p_project_id: PROJECT });
  if (!role.ok || !['pm', 'admin', 'owner'].includes(await role.json())) throw new Error('Synthetic acceptance requires existing PM permission');

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const guard = await installBrowserGuard(context);
    const page = await context.newPage();
    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ value, org }) => {
      localStorage.setItem('sb-ndyfjffsulfbwpmwdmic-auth-token', value);
      localStorage.setItem('sbp:current-org', org);
    }, { value: JSON.stringify(session), org: ORG });
    await page.goto(`${APP}/Projects`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main', { name: 'Main content', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(({ project, org, user }) => {
      try { const cached = JSON.parse(localStorage.getItem('sbp_projects_cache') || 'null');
        return cached?.version === 2 && cached.owner?.userId === user && cached.owner?.orgId === org
          && cached.projects?.some((row: { id?: string }) => row.id === project);
      } catch { return false; }
    }, { project: PROJECT, org: ORG, user: session.user.id }), { timeout: 30_000 }).toBe(true);
    await page.locator('button[aria-label^="Project picker:"]:visible').first().click();
    const picker = page.getByRole('dialog', { name: 'Choose project', exact: true });
    await picker.getByRole('combobox', { name: 'Search projects', exact: true }).fill('STG-0001');
    await picker.locator(`[id="project-option-${PROJECT}"]`).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('activeProjectId'))).toBe(PROJECT);
    await guard.settle(); guard.assertHealthy();
    mkdirSync('e2e/.auth', { recursive: true });
    await context.storageState({ path: STATE });
  } finally { await browser.close(); }
}
