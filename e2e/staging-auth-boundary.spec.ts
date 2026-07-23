import { test, expect } from "@playwright/test";

test.describe("staging authentication boundary", () => {
  test.skip(
    process.env.E2E_TARGET !== "staging",
    "Authentication boundary checks are staging-only.",
  );
  test.describe.configure({ mode: "serial" });

  test("rejects an unauthenticated protected-route request", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });

    try {
      const page = await context.newPage();
      await page.goto("/Submittals");

      await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
      await expect(page.locator('main[aria-label="Main content"]')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("signs out the staging user and clears the browser session", async ({ page }) => {
    await page.goto("/Submittals");
    await expect(page).toHaveURL(/\/Submittals\/?$/);

    await page.getByRole("button", { name: /sign out/i }).click();

    await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(window.localStorage).filter(
            (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
          ),
        ),
      )
      .toEqual([]);
  });
});
