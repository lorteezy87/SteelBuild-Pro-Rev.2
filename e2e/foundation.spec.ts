import { expect, test } from '@playwright/test';

// This is explicitly fixture acceptance of real shell primitives. Authenticated
// project navigation and RLS are separate gates, not simulated by these tests.
test('shell primitives load, retain theme, navigate, and recover from a render error', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  let allowIntentionalError = false;
  page.on('pageerror', error => {
    if (!(allowIntentionalError && error.message.includes('[M0 fixture]'))) errors.push(error.message);
  });
  page.on('console', message => {
    if (message.type() === 'error' && !allowIntentionalError) errors.push(message.text());
  });
  // This fixture must neither require nor send any external service requests.
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      externalRequests.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/dev/foundation.html');
  await expect(page).toHaveTitle('SteelBuild Pro — Foundation verification');
  await expect(page.getByRole('heading', { name: 'Foundation verification' })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to verification' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  const initialTheme = await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
  expect(await page.evaluate(() => localStorage.getItem('sbp-theme'))).toBe(nextTheme);

  // Hold the actual lazy chunk until its accessible loading state is observed.
  let releaseChunk: (() => void) | undefined;
  const chunkGate = new Promise<void>(resolve => { releaseChunk = resolve; });
  await page.route('**/FoundationDetails.tsx*', async route => { await chunkGate; await route.continue(); });
  await page.getByRole('link', { name: 'Details' }).click();
  try {
    await expect(page.getByRole('status', { name: 'Loading page' })).toBeVisible();
  } finally { releaseChunk?.(); }
  await expect(page.getByRole('heading', { name: 'Details loaded' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Recovery check' })).toBeVisible();

  allowIntentionalError = true;
  await page.getByRole('button', { name: 'Trigger render error' }).click();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear error cause' }).click();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Section ready')).toBeVisible();
  allowIntentionalError = false;
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('foundation.png'), fullPage: true });
});

test('public app route shows progress during a real chunk load', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Do not send local acceptance telemetry or download external fonts. No auth
  // session is supplied and this test never enters an authenticated route.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4186') await route.continue();
    else await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  let releasePrivacy: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { releasePrivacy = resolve; });
  await page.route('**/src/pages/Privacy.jsx*', async route => { await gate; await route.continue(); });
  await page.goto('/privacy');
  try {
    await expect(page.getByRole('status', { name: 'Loading page' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('public-loading.png') });
  } finally { releasePrivacy?.(); }
  await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading page' })).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('public-loaded.png') });
});

test('a failed public chunk stops automatic reloads and can recover with Reload page', async ({ page }, testInfo) => {
  let failedRequests = 0;
  let chunkAvailable = false;
  let documentLoads = 0;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.resourceType() === 'document' && request.frame() === page.mainFrame()) documentLoads += 1;
  });
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:4186') await route.continue();
    else await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await page.route('**/src/pages/Privacy.jsx*', async route => {
    if (chunkAvailable) await route.continue();
    else { failedRequests += 1; await route.abort('failed'); }
  });
  await page.goto('/privacy', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  expect(failedRequests).toBe(2);
  expect(documentLoads).toBe(2); // initial document + exactly one automatic recovery
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('public-chunk-error.png') });
  chunkAvailable = true;
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
  expect(documentLoads).toBe(3); // explicit user action, not another automatic retry
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toHaveCount(0);
});

test('missing startup configuration renders recovery instead of stranding the boot screen', async ({ page }, testInfo) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4187') await route.continue();
    else await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await page.goto('http://127.0.0.1:4187/privacy');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading application' })).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('startup-recovery.png') });
});

for (const preference of [null, 'system', 'invalid', 'dark', 'denied'] as const) {
  test(`initial theme honors ${preference ?? 'unset'} preference before the app loads`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(value => {
      localStorage.clear();
      if (value === 'denied') {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new DOMException('Storage denied', 'SecurityError'); },
        });
      } else if (value) localStorage.setItem('sbp-theme', value);
    }, preference);
    await page.route('**/*', async route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:4186') await route.continue();
      else await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    });
    let releaseApp: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { releaseApp = resolve; });
    await page.route('**/src/main.jsx*', async route => { await gate; await route.continue(); });
    const expected = preference === 'dark' ? 'dark' : 'light';
    await page.goto('/privacy', { waitUntil: 'commit' });
    try {
      await expect(page.locator('#root')).toBeEmpty();
      await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
      await expect(page.locator('body')).toHaveCSS('background-color', expected === 'dark' ? 'rgb(11, 14, 17)' : 'rgb(241, 245, 249)');
    } finally { releaseApp?.(); }
    await expect(page.getByRole('heading', { name: /Privacy Policy/i })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
  });
}
