import { expect, type Locator, type Page } from '@playwright/test';

export const CALCULATOR_PATH = '/CalculatorsHub?calc_tab=cranepick';
export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, band: 'desktop' },
  { name: 'sidebar-constrained', width: 1100, height: 800, band: 'desktop' },
  { name: 'tablet', width: 820, height: 1180, band: 'tablet' },
  { name: 'phone-360', width: 360, height: 852, band: 'phone' },
  { name: 'phone-393', width: 393, height: 852, band: 'phone' },
  { name: 'phone-430', width: 430, height: 932, band: 'phone' },
] as const;
export type ViewportName = typeof VIEWPORTS[number]['name'];
export const STAGES = ['content', 'shell', 'initial-layout', 'details', 'actions', 'webgl', 'library', 'final-health'] as const;
export type CalculatorStage = typeof STAGES[number];
export const INCOMPLETE_WEBGL = 'Calculator acceptance incomplete: webgl-unavailable';

/** Never accept a login/error screen merely because it fits a viewport. */
export async function assertCalculatorContent(page: Page): Promise<void> {
  await expect(page).toHaveURL(url => url.pathname === '/CalculatorsHub' && url.searchParams.get('calc_tab') === 'cranepick');
  const main = page.getByRole('main', { name: 'Main content', exact: true });
  await expect(main).toBeVisible();
  const calculator = main.locator('.crane-pick-page');
  await expect(calculator.getByText('Crane Pick Calculator', { exact: true })).toBeVisible();
  await expect(main.getByRole('group', { name: 'Calculator tools', exact: true }).getByRole('button', { name: 'Crane Pick', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(calculator.getByLabel('Piece Weight (lb)', { exact: true })).toHaveValue('');
  await expect(calculator.getByText('PLANNING TOOL ONLY', { exact: true })).toBeVisible();
  await expect(calculator.getByRole('button', { name: 'Generate Pick Summary', exact: true })).toBeDisabled();
  await expect(calculator.getByText('No history yet.', { exact: true })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.getByText(/Calculators — LOAD ERROR|Something went wrong\. Please retry|An unexpected error occurred/)).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

export async function assertNoPageOverflow(page: Page): Promise<void> {
  const measurement = await page.evaluate(() => {
    const main = document.getElementById('main-content');
    const topbar = document.querySelector<HTMLElement>('.app-topbar');
    return {
      document: document.documentElement.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : null,
      topbar: topbar ? topbar.scrollWidth - topbar.clientWidth : null,
      horizontalScroll: window.scrollX,
    };
  });
  expect(measurement.main, 'Authenticated main must exist').not.toBeNull();
  expect(measurement.topbar, 'Application topbar must exist').not.toBeNull();
  for (const width of Object.values(measurement)) expect(width, 'Page and shell must fit horizontally').toBeLessThanOrEqual(1);
}

/** Scroll vertically, then inspect the center and four edge midpoints. This catches
 * clipping inside overflow:hidden ancestors, which scrollWidth alone misses.
 * Return only finite booleans/counts: never serialize DOM text or input values.
 */
export async function assertControlsReachable(root: Locator): Promise<number> {
  const controls = root.locator('button, input:not([type="hidden"]), select, textarea');
  const count = await controls.count();
  expect(count, 'The tested region must contain controls').toBeGreaterThan(0);
  expect(count, 'Bound the acceptance scan').toBeLessThanOrEqual(100);
  let checked = 0;
  for (let index = 0; index < count; index++) {
    const control = controls.nth(index);
    if (!await control.isVisible()) continue;
    await control.scrollIntoViewIfNeeded();
    const geometry = await control.evaluate(element => {
      const control = element as HTMLElement;
      const box = control.getBoundingClientRect();
      // Rounded button corners intentionally do not hit the button. Edge
      // midpoints catch clipping without treating those curves as a defect.
      const inset = 1;
      const centerX = box.left + box.width / 2; const centerY = box.top + box.height / 2;
      const points = [[centerX, centerY], [box.left + inset, centerY], [box.right - inset, centerY],
        [centerX, box.top + inset], [centerX, box.bottom - inset]];
      return {
        fitsViewport: box.left >= -1 && box.right <= window.innerWidth + 1 && box.top >= -1 && box.bottom <= window.innerHeight + 1,
        edgesVisible: points.every(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit === control || !!hit && control.contains(hit); }),
        labelFits: control.tagName !== 'BUTTON' || control.scrollWidth <= control.clientWidth + 1,
        usableSize: box.width >= 20 && box.height >= 20,
      };
    });
    expect(geometry, `Control ${index + 1} must be visible without clipping or obstruction`).toEqual({ fitsViewport: true, edgesVisible: true, labelFits: true, usableSize: true });
    if (await control.isEnabled()) await control.click({ trial: true, timeout: 5_000 });
    checked++;
  }
  expect(checked, 'At least one visible control must be checked').toBeGreaterThan(0);
  return checked;
}

export async function assertRealWebgl(page: Page): Promise<void> {
  const calculator = page.locator('.crane-pick-page');
  await expect(calculator.getByText('Loading 3D view…', { exact: true })).toHaveCount(0);
  if (await calculator.getByRole('note').filter({ hasText: '3D view unavailable — this browser could not start WebGL.' }).isVisible()) {
    // The caller settles runtime/network probes BEFORE classifying this. Any
    // console or application fault remains FAIL, never a platform exemption.
    throw new Error(INCOMPLETE_WEBGL);
  }
  const canvas = calculator.locator('.crane-pick-viewport canvas');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return canvas.width > 0 && canvas.height > 0 && !!context && !context.isContextLost();
  }), 'The actual application canvas must have a live WebGL context').toBe(true);
  for (const name of ['Overview', 'Rigging', 'Side', 'Plan']) await expect(calculator.getByRole('button', { name, exact: true })).toBeVisible();
}
