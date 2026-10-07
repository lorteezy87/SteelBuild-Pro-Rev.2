import { expect } from "@playwright/test";
import { readOnlyTest as test } from "./acceptance";

test.describe("staging authentication boundary", () => {
  test.skip(
    process.env.E2E_TARGET !== "staging",
    "Authentication boundary checks are staging-only.",
  );
  test.describe.configure({ mode: "serial" });

  test.describe("without a session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test("rejects an unauthenticated protected-route request", async ({ page }) => {
      await page.goto("/Submittals");
      await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
      await expect(page.locator('main[aria-label="Main content"]')).toHaveCount(0);
    });
  });

  test.describe("explicit sign-out", () => {
    test.use({ allowAuthLogout: true });
    test("signs out the staging user and clears the browser session", async ({ page, readOnlySupabaseUrl }) => {
      await page.goto("/Submittals");
      await expect(page).toHaveURL(/\/Submittals\/?$/);

      const signOutButton = page
        .locator('button[title*="sign out" i]')
        .or(page.getByRole("button", { name: /sign out/i }))
        .first();
      const [logout] = await Promise.all([
        page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.origin === new URL(readOnlySupabaseUrl).origin
            && url.pathname === "/auth/v1/logout" && response.request().method() === "POST";
        }),
        signOutButton.click(),
      ]);
      expect(logout.ok(), "The allowed auth logout must succeed").toBe(true);

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
});
