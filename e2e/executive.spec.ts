import { expect, test } from "@playwright/test";

// This exercises shipped UI and route resolution with synthetic records, not
// authentication, RLS, or production database acceptance.
for (const theme of ["dark", "light"] as const) {
  test(`executive dashboard is usable in ${theme} mode`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const backendRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(value => localStorage.setItem("sbp-theme", value), theme);
    await page.clock.setFixedTime(new Date("2026-10-06T18:00:00Z"));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:4186"
        || (url.protocol === "https:" && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname))) {
        await route.continue();
      }
      else {
        if (url.hostname.includes("supabase") || url.port === "54321") backendRequests.push(url.href);
        await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
      }
    });
    await page.goto("/dev/executive.html");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { name: "Project Dashboard" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("region", { name: "Executive operating summary" })).toBeVisible();
    await expect(page.getByText(/Showing 8 of \d+ priorities/)).toBeVisible();

    const command = page.getByRole("button", { name: "Open command center", exact: true });
    await command.focus();
    await expect(command).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status", { name: "Opened workspace" })).toHaveText("/CommandCenter");
    await page.getByRole("button", { name: /Fabrication & Logistics/ }).click();
    await expect(page.getByRole("status", { name: "Opened workspace" })).toHaveText("/WorkPackages");
    await page.getByRole("button", { name: /Open RFI-101/ }).click();
    await expect(page.getByRole("status", { name: "Opened workspace" })).toContainText("/RFIs");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(backendRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`executive-${theme}.png`), fullPage: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`executive-${theme}-viewport.jpg`), type: "jpeg", quality: 70 });

    if (testInfo.project.name === "desktop") {
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(command).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`executive-${theme}-tablet.png`), fullPage: true });
    }
  });
}
