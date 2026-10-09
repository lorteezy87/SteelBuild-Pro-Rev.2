import { defineConfig, devices } from '@playwright/test';
import { APP, STATE } from './e2e/synthetic-pdf/fixture.js';

export default defineConfig({
  testDir: './e2e', testMatch: 'synthetic-pdf-evidence.spec.ts',
  globalSetup: './e2e/synthetic-pdf/setup.ts',
  timeout: 360_000, expect: { timeout: 15_000 }, workers: 1, retries: 0, fullyParallel: false,
  forbidOnly: true, reporter: [['./e2e/synthetic-pdf/reporter.ts']],
  outputDir: 'test-results/synthetic-pdf/screenshots',
  use: { ...devices['Desktop Chrome'], baseURL: APP, storageState: STATE, viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block', trace: 'off', video: 'off', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', url: APP, reuseExistingServer: false, timeout: 30_000 },
});
