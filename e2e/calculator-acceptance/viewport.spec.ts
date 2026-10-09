import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '../drawing-evidence-test.js';
import { observeReadOnlyPage } from '../acceptance.js';
import { DRAWING_ORG_ID, DRAWING_PROJECT_ID } from '../drawingEvidenceTransport.js';
import { STAGING_ORIGIN } from '../stagingNetworkGuard.js';
import { assertCalculatorContent, assertControlsReachable, assertNoPageOverflow, assertRealWebgl, CALCULATOR_PATH, VIEWPORTS, type CalculatorStage } from './contracts.js';

const SHOTS = ['initial', 'actions', 'webgl', 'library'] as const;
type Shot = typeof SHOTS[number];
function stage(info: TestInfo, next: CalculatorStage) {
  info.annotations = info.annotations.filter(annotation => annotation.type !== 'calculator-stage');
  info.annotations.push({ type: 'calculator-stage', description: next });
}

async function screenshot(page: Page, region: Locator, info: TestInfo, name: Shot): Promise<void> {
  // No full-page or automatic failure screenshots: crop to calculator content
  // only. Fixed four names per viewport bound both file count and dimensions.
  const viewport = page.viewportSize();
  const box = await region.boundingBox();
  if (!viewport || !box) throw new Error('Calculator screenshot region unavailable');
  const main = name === 'library' ? box : await page.getByRole('main', { name: 'Main content', exact: true }).boundingBox();
  if (!main) throw new Error('Calculator main bounds unavailable');
  const x = Math.max(0, box.x, main.x); const y = Math.max(0, box.y, main.y);
  const width = Math.min(viewport.width, box.x + box.width, main.x + main.width) - x;
  const height = Math.min(viewport.height, box.y + box.height, main.y + main.height) - y;
  if (width <= 0 || height <= 0 || width > 1440 || height > 1180) throw new Error('Calculator screenshot bounds rejected');
  const pixels = await page.screenshot({ type: 'png', clip: { x, y, width, height }, animations: 'disabled',
    // Defence in depth if a future sticky header overlaps the main rectangle.
    mask: [page.locator('.app-topbar'), page.getByRole('group', { name: 'Workspace and project', exact: true })],
  });
  if (pixels.byteLength > 2 * 1024 * 1024) throw new Error('Calculator screenshot byte limit exceeded');
  const viewportName = VIEWPORTS.find(value => value.name === info.project.name)?.name;
  if (!viewportName || !SHOTS.includes(name)) throw new Error('Calculator screenshot identity rejected');
  mkdirSync('test-results/calculator-acceptance', { recursive: true });
  writeFileSync(`test-results/calculator-acceptance/${viewportName}-${name}.png`, pixels);
}

test('crane pick content and controls fit the authenticated viewport', async ({ page }, info) => {
  const profile = VIEWPORTS.find(value => value.name === info.project.name);
  if (!profile) throw new Error('Unknown calculator viewport');
  const probe = await observeReadOnlyPage(page, STAGING_ORIGIN, DRAWING_PROJECT_ID);
  stage(info, 'content');
  await page.goto(CALCULATOR_PATH);
  await assertCalculatorContent(page);
  await expect.poll(() => page.evaluate(() => ({
    project: localStorage.getItem('activeProjectId'), org: localStorage.getItem('sbp:current-org'),
  }))).toEqual({ project: DRAWING_PROJECT_ID, org: DRAWING_ORG_ID });
  const calculator = page.locator('.crane-pick-page');
  const rail = page.getByRole('group', { name: 'Calculator tools', exact: true });
  stage(info, 'shell');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-viewport', profile.band);
  if (profile.band === 'desktop') {
    const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true });
    if (await expand.isVisible()) await expand.click();
    const sidebar = page.getByRole('complementary', { name: 'Dashboard navigation', exact: true });
    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(180);
  }
  if (profile.band === 'tablet') await expect(page.getByRole('complementary', { name: 'Dashboard navigation', exact: true })).toHaveClass(/is-collapsed/);
  stage(info, 'initial-layout');
  expect(await page.evaluate(() => window.innerWidth)).toBe(profile.width);
  if (profile.name === 'sidebar-constrained') {
    expect((await calculator.boundingBox())?.width ?? 0).toBeLessThan(980);
  }
  const gridColumns = await calculator.locator('.crane-pick-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(/\s+/).length);
  expect(gridColumns, 'The real available width must select the intended stacked or two-column layout').toBe(profile.name === 'desktop' ? 2 : 1);
  await assertNoPageOverflow(page);
  await assertControlsReachable(rail);
  await calculator.getByText('Crane Pick Calculator', { exact: true }).scrollIntoViewIfNeeded();
  await screenshot(page, calculator, info, 'initial');

  stage(info, 'details');
  await calculator.getByRole('button', { name: /Reference Details \(metadata only\)/ }).click();
  await expect(calculator.getByLabel('Crane Make / Model', { exact: true })).toHaveValue('');
  const bearing = calculator.getByRole('button', { name: /Ground Bearing — Outrigger Mat Check/ });
  await bearing.click();
  await expect(bearing).toHaveAttribute('aria-expanded', 'true');
  await expect(calculator.getByLabel('Max outrigger reaction (lb)', { exact: false })).toHaveValue('');
  await assertControlsReachable(calculator);
  await assertNoPageOverflow(page);
  stage(info, 'actions');
  const summary = calculator.getByRole('button', { name: 'Generate Pick Summary', exact: true });
  await expect(summary).toBeDisabled();
  await summary.scrollIntoViewIfNeeded();
  await screenshot(page, calculator, info, 'actions');

  stage(info, 'webgl');
  // Never convert console/network/app errors into an unavailable-WebGL result.
  await probe.settle(); probe.assertHealthy();
  await assertRealWebgl(page);
  for (const name of ['Overview', 'Rigging', 'Side', 'Plan']) await calculator.getByRole('button', { name, exact: true }).click();
  await calculator.getByRole('button', { name: 'Hide 3D', exact: true }).click();
  await expect(calculator.locator('.crane-pick-viewport')).toHaveCount(0);
  await calculator.getByRole('button', { name: 'Show 3D', exact: true }).click();
  await probe.settle(); probe.assertHealthy();
  await assertRealWebgl(page);
  await calculator.locator('.crane-pick-viewport').scrollIntoViewIfNeeded();
  await screenshot(page, calculator, info, 'webgl');

  stage(info, 'library');
  await calculator.getByRole('button', { name: 'Read rated capacity from a load chart in the crane library', exact: true }).click();
  await expect(calculator.getByText(/No cranes in the library yet\./)).toBeVisible();
  await calculator.getByRole('button', { name: 'Open crane library', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Crane Library', exact: true });
  await expect(library).toBeVisible();
  await assertControlsReachable(library);
  await assertNoPageOverflow(page);
  await screenshot(page, library, info, 'library');
  await library.getByRole('button', { name: 'Close crane library', exact: true }).click();
  await expect(library).toHaveCount(0);
  stage(info, 'final-health');
  await assertCalculatorContent(page);
  await assertNoPageOverflow(page);
  await probe.settle(); probe.assertHealthy();
});
