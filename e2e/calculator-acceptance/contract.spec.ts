import { expect, test } from '@playwright/test';
import { assertCalculatorContent, assertControlsReachable, assertNoPageOverflow, assertRealWebgl, INCOMPLETE_WEBGL } from './contracts.js';

test('clipped action in an overflow-hidden parent fails even when the document fits', async ({ page }) => {
  await page.setContent('<main id="main-content" style="width:300px;overflow:hidden"><div style="width:140px;overflow:hidden"><button style="width:280px;height:40px">An action clipped by its card</button></div></main><nav class="app-topbar"></nav>');
  await assertNoPageOverflow(page);
  await expect(assertControlsReachable(page.locator('main'))).rejects.toThrow('without clipping');
});
test('visible controls can scroll vertically without requiring a giant screenshot', async ({ page }) => {
  await page.setContent('<main style="height:150px;overflow:auto"><div style="height:700px"></div><button style="height:40px">Reachable action</button></main>');
  expect(await assertControlsReachable(page.locator('main'))).toBe(1);
});
test('overlaid action fails containment instead of passing from its box alone', async ({ page }) => {
  await page.setContent('<main><button style="width:150px;height:40px">Covered action</button></main><div style="position:fixed;inset:0;background:white"></div>');
  await expect(assertControlsReachable(page.locator('main'))).rejects.toThrow('without clipping');
});
test('disabled summary remains visually testable', async ({ page }) => {
  await page.setContent('<main><button disabled style="height:40px">Generate Pick Summary</button></main>');
  expect(await assertControlsReachable(page.locator('main'))).toBe(1);
});
test('reachability checks do not activate an action', async ({ page }) => {
  await page.setContent('<main><button style="height:40px" onclick="document.body.dataset.activated=\'yes\'">Action under test</button></main>');
  expect(await assertControlsReachable(page.locator('main'))).toBe(1);
  expect(await page.evaluate(() => document.body.dataset.activated)).toBeUndefined();
});
test('rounded action corners are not mistaken for clipping', async ({ page }) => {
  await page.setContent('<main><button style="width:90px;height:48px;border-radius:16px">Centered</button></main>');
  expect(await assertControlsReachable(page.locator('main'))).toBe(1);
});
test('a fitting error page is not a calculator', async ({ page }) => {
  await page.route('http://127.0.0.1:4173/**', route => route.fulfill({ contentType: 'text/html', body: '<main aria-label="Main content">Something went wrong</main>' }));
  await page.goto('http://127.0.0.1:4173/CalculatorsHub?calc_tab=cranepick');
  await expect(assertCalculatorContent(page)).rejects.toThrow();
});
test('a login route cannot substitute for calculator acceptance', async ({ page }) => {
  await page.route('http://127.0.0.1:4173/**', route => route.fulfill({ contentType: 'text/html', body: '<main aria-label="Main content">Sign in</main>' }));
  await page.goto('http://127.0.0.1:4173/Login');
  await expect(assertCalculatorContent(page)).rejects.toThrow();
});
test('only the explicit WebGL fallback classifies unavailable, not a missing or broken canvas', async ({ page }) => {
  await page.setContent('<div class="crane-pick-page"><div role="note">3D view unavailable — this browser could not start WebGL. All calculations above are unaffected.</div></div>');
  await expect(assertRealWebgl(page)).rejects.toThrow(INCOMPLETE_WEBGL);
  await page.setContent('<div class="crane-pick-page"><canvas></canvas></div>');
  await expect(assertRealWebgl(page)).rejects.not.toThrow(INCOMPLETE_WEBGL);
});
