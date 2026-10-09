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
    await expect(brief.getByText("1 overdue · 1 held or delayed · 0 RFIs with impact", { exact: true })).toBeVisible();
    await expect(brief.getByText(/Sources loaded/)).toBeVisible();
    await expect(brief.getByText(/1 without an owner · 1 without a valid required date/)).toBeVisible();
    const register = page.getByRole("table");
    await expect(register.getByRole("button")).toHaveCount(5);
    const horizons = page.getByRole("navigation", { name: "Project control horizons" });
    await expect(horizons.getByRole("button", { name: "View all 2 items in NOW" })).toBeVisible();
    await expect(horizons.getByRole("button", { name: "View all 1 item in 48 HOURS" })).toBeVisible();
    await expect(horizons.getByRole("button", { name: "View all 1 item in 10 DAYS" })).toBeVisible();

    const sourceActions = [
      ["Grid C4 brace connection", "RFI:overdue-rfi"],
      ["WP-012", "WP:held-package"],
      ["Erect east bay columns", "TASK:near-task"],
      ["Roof framing package", "SUB:future-submittal"],
      ["Canopy connection clarification", "RFI:undated-rfi"],
    ];
    for (const [label, target] of sourceActions) {
      await expect(brief.getByText(new RegExp(label))).toHaveCount(0);
      const action = register.getByRole("button", { name: new RegExp(label) });
      await action.focus();
      await expect(action).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status", { name: "Opened source" })).toHaveText(target);
    }
    await horizons.getByRole("button", { name: "View all 2 items in NOW" }).click();
    await expect(register.getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "NOW Action Items" })).toBeFocused();
    await horizons.getByRole("button", { name: "Show all horizons" }).click();
    await expect(register.getByRole("button")).toHaveCount(5);
    await expect(register.getByRole("button", { name: /Canopy connection clarification/ })).toContainText("Not recorded");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await brief.screenshot({ path: testInfo.outputPath(`command-brief-${theme}.png`) });
    await page.screenshot({ path: testInfo.outputPath(`command-center-${theme}.png`), fullPage: true });

    await page.getByRole("button", { name: "Show large snapshot", exact: true }).click();
    await expect(horizons.getByRole("button", { name: "View all 115 items in NOW" })).toBeVisible();
    const largeRegister = page.getByRole("region", { name: "Action register", exact: true });
    const firstRow = largeRegister.getByRole("button", { name: /RFI-001 — Bay 1 connection review/ });
    await expect(firstRow).toBeVisible();
    // The virtualized register mounts a window of rows, but all 115 remain reachable.
    expect(await largeRegister.getByRole("button").count()).toBeLessThan(115);
    const requiredHeaderCell = largeRegister.getByText("Required By", { exact: true }).locator("..");
    const requiredValueCell = firstRow.getByText("2026-10-05", { exact: true }).locator("..");
    const headerBefore = (await requiredHeaderCell.boundingBox())!;
    const valueBefore = (await requiredValueCell.boundingBox())!;
    expect(Math.abs(headerBefore.x - valueBefore.x)).toBeLessThan(1);
    await largeRegister.focus();
    await expect(largeRegister).toBeFocused();
    if (testInfo.project.name === "mobile") {
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => largeRegister.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      // Read both boxes in one frame: ArrowRight animates the native scroll position.
      const alignedAfterScroll = await largeRegister.evaluate(element => {
        const header = Array.from(element.querySelectorAll(".sbp-command-column-heading"))
          .find(node => node.textContent === "Required By")!.parentElement!;
        const value = element.querySelector('[data-index="0"]')!.children[6];
        return { headerX: header.getBoundingClientRect().x, valueX: value.getBoundingClientRect().x };
      });
      expect(alignedAfterScroll.headerX).toBeLessThan(headerBefore.x);
      expect(Math.abs(alignedAfterScroll.headerX - alignedAfterScroll.valueX)).toBeLessThan(1);
      // Each later column can be brought into the same contained horizontal viewport.
      const ownerHeader = largeRegister.getByText("Owner / BIC", { exact: true });
      await ownerHeader.evaluate(element => element.scrollIntoView({ block: "nearest", inline: "center" }));
      await expect(ownerHeader).toBeInViewport();
      await expect(firstRow.getByText("EOR", { exact: true })).toBeInViewport();
      const dueHeader = largeRegister.getByText("Required By", { exact: true });
      await dueHeader.evaluate(element => element.scrollIntoView({ block: "nearest", inline: "center" }));
      await expect(dueHeader).toBeInViewport();
      await expect(firstRow.getByText("2026-10-05", { exact: true })).toBeInViewport();
    }
    const virtualBody = largeRegister.locator(".cmd-table-virtual-body");
    await virtualBody.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const lastRow = largeRegister.getByRole("button", { name: /RFI-115 — Bay 115 connection review/ });
    await expect(lastRow).toBeVisible();
    await lastRow.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status", { name: "Opened source" })).toHaveText("RFI:large-rfi-114");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole("button", { name: "Show empty snapshot", exact: true }).click();
    await expect(register.getByRole("button")).toHaveCount(0);
    await expect(brief.getByText("0 overdue · 0 held or delayed · 0 RFIs with impact", { exact: true })).toBeVisible();
    await expect(brief.getByText(/This does not establish project readiness/)).toBeVisible();
    expect(failures).toEqual([]);
  });
}
