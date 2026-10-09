import { defineConfig, devices } from '@playwright/test';
import authenticatedConfig from './playwright.config';
import { DRAWING_STATE_PATH } from './e2e/drawingEvidenceTransport';

// Reuse real auth/project selection. This runner serves the reviewed build,
// reads staging, and never provisions fixtures or authorizes project writes.
export default defineConfig({
  ...authenticatedConfig,
  globalSetup: './e2e/drawing-evidence-setup.ts',
  testMatch: ['drawing-revision-evidence.spec.ts'],
  // This spec is intentionally excluded from the general runner.
  testIgnore: [],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['./e2e/drawing-evidence-reporter.ts']],
  outputDir: 'test-results/drawing-evidence/screenshots',
  use: {
    ...authenticatedConfig.use,
    baseURL: 'http://127.0.0.1:4173',
    storageState: DRAWING_STATE_PATH,
    serviceWorkers: 'block',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
