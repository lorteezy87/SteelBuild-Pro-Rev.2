import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E smoke harness for the daily-driver workflow
 * (drawings → submittals → RFIs → fab release).
 *
 * This is the "unit tests pass ≠ it works" safety layer (TECH_DEBT / TODO
 * Thread B): the in-process Vitest suite + build can be green while the real
 * signed-in workflow is broken. These specs sign in once (e2e/global-setup.ts)
 * and assert each register actually renders under a real session.
 *
 * Run + provisioning: see e2e/README.md. Needs a dedicated test account
 * (E2E_USER / E2E_PASS), the project URL + anon key, and E2E_BASE_URL
 * (prod / preview / local). With nothing configured, `playwright test` fails
 * fast in global-setup with a clear message; `playwright test --list` works
 * with no secrets.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://steelbuild-pro.com",
    storageState: "e2e/.auth/state.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
