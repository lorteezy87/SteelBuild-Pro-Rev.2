import { defineConfig, devices } from "@playwright/test";

const plannerPort = 4174;
const plannerBaseUrl = `http://127.0.0.1:${plannerPort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "planner-core.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: plannerBaseUrl,
    serviceWorkers: "allow",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run build:planner && npx vite preview --config planner/vite.config.ts --host 127.0.0.1 --port 4174 --strictPort",
    url: plannerBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "planner-browser-test-anon-key",
      VITE_PLANNER_PWA_HOSTNAMES: "127.0.0.1",
      VITE_STEELBUILD_APP_URL: "https://steelbuild-pro.com",
    },
  },
});
