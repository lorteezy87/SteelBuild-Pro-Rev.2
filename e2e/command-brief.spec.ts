import { expect, test } from "@playwright/test";

// Presentation acceptance with controlled records; no auth/RLS/data completeness claim.
test.use({ timezoneId: "America/Phoenix" });
for (const theme of ["dark", "light"] as const) {
  test(`execution brief preserves source actions and record gaps in ${theme} mode`, async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on("pageerror", error => failures.push(error.message));
    page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
    await page.addInitScript(value => localStorage.setItem("sbp-theme", value), theme);
    await page.clock.setFixedTime(new Date("2026-10-06T18:00:00Z"));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:4186"
        || (url.protocol === "https:" && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname))) {
        await route.continue();
      } else {
        failures.push(`Unexpected external request: ${url.origin}${url.pathname}`);
        await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
      }
    });
    await page.goto("/dev/command-brief.html");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const brief = page.getByRole("region", { name: "Execution brief", exact: true });
    await expect(brief).toBeVisible();
    await expect(brief.getByText("Calculated from project records", { exact: true })).toBeVisible();
    await expect(brief.getByText("2 NOW · 1 48 HOURS · 1 10 DAYS", { exact: true })).toBeVisible();
    await expect(brief.getByText(/Sources loaded/)).toBeVisible();
    await expect(brief.getByText(/1 without an owner · 1 without a valid required date/)).toBeVisible();
    await expect(brief.getByRole("button")).toHaveCount(5);

    const sourceActions = [
      ["Grid C4 brace connection", "RFI:overdue-rfi"],
      ["WP-012", "WP:held-package"],
      ["Erect east bay columns", "TASK:near-task"],
      ["Roof framing package", "SUB:future-submittal"],
      ["Canopy connection clarification", "RFI:undated-rfi"],
    ];
    for (const [label, target] of sourceActions) {
      const action = brief.getByRole("button", { name: new RegExp(label) });
      await action.focus();
      await expect(action).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status", { name: "Opened source" })).toHaveText(target);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await brief.screenshot({ path: testInfo.outputPath(`command-brief-${theme}.png`) });
    await page.screenshot({ path: testInfo.outputPath(`command-center-${theme}.png`), fullPage: true });

    await page.getByRole("button", { name: "Show empty snapshot", exact: true }).click();
    await expect(brief.getByRole("button")).toHaveCount(0);
    await expect(brief.getByText("0 NOW · 0 48 HOURS · 0 10 DAYS", { exact: true })).toBeVisible();
    await expect(brief.getByText(/This does not establish project readiness/)).toBeVisible();
    expect(failures).toEqual([]);
  });
}
