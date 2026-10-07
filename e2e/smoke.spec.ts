import { readOnlyTest as test, acceptanceOptions, visitRegister } from "./acceptance";

/**
 * Boot smoke: the seeded session lands us in the authenticated app shell, not
 * bounced to the public landing / sign-in. A protected route that stays on its
 * path and renders its own content (not the marketing page) proves auth held
 * and the shell mounted.
 */
test("authenticated shell loads on a protected route", async ({ page }) => {
  await visitRegister(page, "submittals", acceptanceOptions("submittals"));
});
