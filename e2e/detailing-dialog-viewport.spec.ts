import { expect, test } from '@playwright/test';

test('nested floating controls remain above the dialog and accept input', async ({ page }) => {
  await page.goto('/dev/detailing-dialogs.html?view=layers&theme=dark');
  const dialog = page.getByRole('dialog', { name: 'Nested control verification' });
  await page.getByText('Open popover', { exact: true }).click();
  await page.getByRole('button', { name: 'Popover action' }).click({ timeout: 3000 });
  await expect(dialog.getByRole('status')).toHaveText('popover');
  await page.keyboard.press('Escape');
  await page.getByText('Open menu', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Menu action', exact: true }).click();
  await page.getByText('Open context menu', { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Context action', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('popover,menu,context');
  for (const [trigger, content] of [['Show tooltip', 'Nested tooltip help'], ['Show hover details', 'Nested hover details']]) {
    await page.getByText(trigger, { exact: true }).hover();
    const popup = page.getByText(content, { exact: true }).first();
    await expect(popup).toBeVisible();
    const popupZ = await popup.evaluate(element => Number(getComputedStyle(element.closest('[data-radix-popper-content-wrapper]') ?? element).zIndex));
    const dialogZ = await dialog.evaluate(element => Number(getComputedStyle(element).zIndex));
    expect(popupZ).toBeGreaterThanOrEqual(dialogZ);
  }
});

test('manual intake can review all PDF pages after an extraction failure', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const externalRequests: string[] = [];
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') await route.continue();
    else { externalRequests.push(route.request().url()); await route.abort(); }
  });
  await page.goto('/dev/detailing-dialogs.html?view=intake&theme=dark');
  await expect(page.getByRole('heading', { name: 'Manual drawing intake verification' })).toBeVisible();
  const create = page.getByRole('button', { name: /Create 3 Entries/ });
  await expect(create).toBeDisabled();
  const pages = page.getByRole('spinbutton');
  await expect(pages).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    const row = pages.nth(index).locator('xpath=ancestor::tr');
    await row.getByRole('textbox').nth(0).fill(`S-10${index + 1}`);
    await row.getByRole('textbox').nth(1).fill(`Reviewed physical page ${index + 1}`);
  }
  await pages.nth(0).fill('4');
  await expect(create).toBeDisabled();
  await pages.nth(0).fill('1');
  await expect(create).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('manual-three-page-intake.png') });
  await create.click();
  await expect(page.getByRole('status')).toHaveText('Saved 3 pages: 1,2,3');
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

// The form and its real Radix portals render with shipped CSS. The fixture
// replaces only persistence; no credentials or customer records are involved.
for (const theme of ['light', 'dark']) {
  for (const mode of ['create', 'edit']) {
    test(`${theme} ${mode} submittal keeps its heading and actions reachable`, async ({ page }, testInfo) => {
      await page.setViewportSize(testInfo.project.name === 'desktop'
        ? { width: 1280, height: 640 }
        : { width: 390, height: 844 });
      const errors: string[] = [];
      const externalRequests: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') await route.continue();
        else { externalRequests.push(route.request().url()); await route.abort(); }
      });
      await page.goto(`/dev/detailing-dialogs.html?mode=${mode}&theme=${theme}`);
      const dialog = page.getByRole('dialog', { name: mode === 'edit' ? 'Edit Submittal' : 'New Submittal' });
      await expect(dialog).toBeVisible();
      const viewport = page.viewportSize()!;
      await expect.poll(async () => {
        const bounds = await dialog.boundingBox();
        return !!bounds && bounds.y >= 8 && bounds.x >= 8
          && bounds.y + bounds.height <= viewport.height - 8
          && bounds.x + bounds.width <= viewport.width - 8;
      }).toBe(true);
      const action = dialog.getByRole('button', { name: mode === 'edit' ? 'SAVE' : 'CREATE', exact: true });
      await expect(action).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole('button', { name: 'CANCEL', exact: true })).toBeInViewport({ ratio: 1 });
      await dialog.getByPlaceholder('Transmittal scope, cover letter text, known issues…').fill('Reviewed viewport fixture');
      await expect(dialog.getByRole('heading')).toBeInViewport({ ratio: 1 });
      await expect(action).toBeInViewport({ ratio: 1 });
      await dialog.getByRole('combobox', { name: 'Submittal type' }).click();
      await page.getByRole('option', { name: 'Product Data', exact: true }).click();
      await expect(dialog.getByRole('combobox', { name: 'Submittal type' })).toContainText('Product Data');
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${mode}-dialog.png`) });
      await action.click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('status')).toHaveText('Submittal details accepted');
      expect(errors).toEqual([]);
      expect(externalRequests).toEqual([]);
    });
  }
}

test('landscape phone keeps Cancel and Create visible while the form scrolls', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto('/dev/detailing-dialogs.html?mode=create&theme=dark');
  const dialog = page.getByRole('dialog', { name: 'New Submittal' });
  await dialog.getByPlaceholder('Transmittal scope, cover letter text, known issues…').fill('Landscape review');
  await expect(dialog.getByRole('heading')).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('button', { name: 'CREATE', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('button', { name: 'CANCEL', exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('landscape-dialog.png') });
  await dialog.getByRole('button', { name: 'CANCEL', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
