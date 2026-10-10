import { defineConfig, devices } from '@playwright/test';
import { DRAWING_STATE_PATH } from './e2e/drawingEvidenceTransport.js';
import { VIEWPORTS } from './e2e/calculator-acceptance/contracts.js';

export default defineConfig({
  testDir: './e2e/calculator-acceptance', testMatch: ['viewport.spec.ts'], testIgnore: [],
  globalSetup: './e2e/drawing-evidence-setup.ts',
  timeout: 120_000, expect: { timeout: 15_000 }, fullyParallel: false,
  retries: 0, workers: 1, forbidOnly: !!process.env.CI,
  reporter: [['./e2e/calculator-acceptance/reporter.ts']],
  outputDir: 'test-results/calculator-acceptance/playwright',
  use: {
    ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173',
    storageState: DRAWING_STATE_PATH, serviceWorkers: 'block',
    trace: 'off', video: 'off', screenshot: 'off',
  },
  projects: VIEWPORTS.map(profile => ({ name: profile.name, use: {
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.band === 'phone', hasTouch: profile.band !== 'desktop',
  } })),
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30_000,
  },
});
