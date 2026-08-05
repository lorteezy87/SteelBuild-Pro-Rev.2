import { test, expect } from "@playwright/test";

/**
 * Boot smoke: the seeded session lands us in the authenticated app shell, not
 * bounced to the public landing / sign-in. A protected route that stays on its
 * path and renders its own content (not the marketing page) proves auth held
 * and the shell mounted.
 */
test("authenticated shell loads on a protected route", async ({ page }) => {
  const fatal: string[] = [];
  page.on("pageerror", (e) => fatal.push(String(e)));

  await page.goto("/Submittals");

  // Auth held — we did NOT get redirected away from the protected route.
  await expect(page).toHaveURL(/\/Submittals\/?$/);
  // Authenticated content rendered (the register), not the landing CTA.
  await expect(page.locator("body")).toContainText(/submittal/i);
  expect(fatal, `uncaught errors:\n${fatal.join("\n")}`).toEqual([]);
});
