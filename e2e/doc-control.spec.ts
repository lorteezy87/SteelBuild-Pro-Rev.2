import { expect, test } from "@playwright/test";

// Presentation acceptance with controlled records; no auth/RLS/data completeness claim.
test.use({ timezoneId: "America/Phoenix" });
for (const theme of ["dark", "light"] as const) {
  test(`document-control panels render evidence, unknowns and owners in ${theme} mode`, async ({ page }, testInfo) => {
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
    await page.goto("/dev/doc-control.html");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    // Why / Waiting on / Who — submittal: server-audited last move and owners.
    const [submittalPanel, setPanel] = await page.getByRole("region", { name: "Why, waiting on, who" }).all();
    await expect(submittalPanel.getByText("Status Revise and Resubmit → Under Review · Ball in court Detailer → EOR · Round 1 → 2")).toBeVisible();
    await expect(submittalPanel.getByText("Reviewer response")).toBeVisible();
    await expect(submittalPanel.getByText(/Due Sep 22, 26 \(14d over\)/)).toBeVisible();
    // Drawing set: an unavailable gate is said plainly, never "no blockers".
    await expect(setPanel.getByText("Blocker check unavailable.")).toBeVisible();
    await expect(setPanel.getByText("No recorded blockers.")).toHaveCount(0);
    await expect(setPanel.getByText("No ball in court recorded")).toBeVisible();

    // Approval delay log.
    const card = page.getByTestId("review-delay-card");
    await expect(card.getByText(/Review period 10 working days/)).toBeVisible();
    const lateTable = card.getByRole("table");
    await expect(lateTable.getByText("SUB-014")).toBeVisible();
    await expect(lateTable.getByText("SUB-016")).toHaveCount(0);
    await expect(lateTable.getByText("21+ · notice").first()).toBeVisible();
    await card.getByRole("button", { name: /Show 1 unmeasured round/ }).click();
    await expect(card.getByText(/No sent date recorded/)).toBeVisible();

    // Saved views round-trip on this device.
    await page.getByRole("button", { name: "Save view" }).click();
    await page.getByLabel("View name").fill("Holds on S-1");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.reload();
    const views = page.getByLabel("Saved views", { exact: true });
    await views.selectOption({ label: "Holds on S-1" });
    await expect(page.getByRole("status", { name: "Applied view" })).toHaveText("Holds on S-1");

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`doc-control-${theme}.png`), fullPage: true });
    expect(failures).toEqual([]);
  });
}
