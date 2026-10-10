import { defineConfig, devices } from '@playwright/test';

// Credential-free browser proofs for the acceptance checks themselves.
export default defineConfig({
  testDir: './e2e/calculator-acceptance', testMatch: ['contract.spec.ts'],
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: !!process.env.CI,
  timeout: 20_000, expect: { timeout: 1_000 }, reporter: 'list',
  outputDir: 'test-results/calculator-contract',
  use: { ...devices['Desktop Chrome'], serviceWorkers: 'block', trace: 'off', video: 'off', screenshot: 'off' },
});
