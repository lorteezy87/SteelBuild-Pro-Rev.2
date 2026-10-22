import { expect, test } from "@playwright/test";

// Presentation acceptance with synthetic folders/files; no auth, RLS or data claim.
test.use({ timezoneId: "America/Phoenix" });
for (const theme of ["dark", "light"] as const) {
  test(`documents browser shows a folder tree and contents table in ${theme} mode`, async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
    await page.addInitScript((value) => localStorage.setItem("sbp-theme", value), theme);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:4186"
        || (url.protocol === "https:" && ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname))) {
        await route.continue();
      } else {
        failures.push(`Unexpected external request: ${url.origin}${url.pathname}`);
        await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
      }
    });
    await page.goto("/dev/documents.html");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();

    const table = page.getByRole("table");
    await expect(table.getByRole("row", { name: /01 Design Files/ })).toContainText("03/10/2026 at 09:25 AM");
    await expect(table.getByRole("row", { name: /AISC Code of Standard Practice/ })).toContainText("by Michael Mulsow");

    const mobile = (page.viewportSize()?.width ?? 1440) < 900;
    if (mobile) await page.getByRole("button", { name: "Folders" }).click();
    const tree = page.getByRole("navigation", { name: "Folders" });
    await expect(tree.getByRole("button", { name: "IFC Drawings", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`documents-root-${theme}.png`), fullPage: true });

    // Into a folder from the table, then a sub-folder.
    if (mobile) await page.getByRole("button", { name: "Folders" }).click();
    await table.getByRole("row", { name: /01 Design Files/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "01 Design Files" })).toBeVisible();
    await table.getByRole("row", { name: /Structural/ }).click();
    await expect(page.getByRole("navigation", { name: "Folder path" })).toContainText("01 Design Files");
    await expect(table.getByRole("row", { name: /S-101 Foundation Plan/ })).toContainText("Rev 2");

    // New folder appears in table and tree.
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: "Folder", exact: true }).click();
    await page.getByLabel("New folder name").fill("Connection Calcs");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(table.getByRole("row", { name: /Connection Calcs/ })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`documents-folder-${theme}.png`), fullPage: true });
    expect(failures).toEqual([]);
  });
}
