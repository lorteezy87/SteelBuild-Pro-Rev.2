import { defineConfig, devices } from '@playwright/test';
import { loadRunConfig, verifyBuild, assertFabBindings } from './scripts/drawing-cutover-staging.ts';
import { PREVIEW_ORIGIN, STAGE_REF } from './e2e/drawing-cutover-setup.ts';

// Evaluate before browser launch or test discovery. Missing input is a failure, never a skip.
const config = (() => {
  try { const value = loadRunConfig(); verifyBuild(value.candidateSha); return value; }
  catch { throw new Error('DRAWING_CONFIGURATION_REFUSED'); }
})();
if (config.phase !== 'acceptance' || process.env.DRAWING_CUTOVER_ENABLED !== 'true') throw new Error('ACCEPTANCE_OPT_IN_REQUIRED');
const fab = config.manifest.fab;
if (!fab) throw new Error('FAB_FIXTURE_BINDINGS_REQUIRED');
Object.assign(process.env, {
  E2E_TARGET: 'staging', E2E_EXPECTED_SUPABASE_REF: STAGE_REF, E2E_BASE_URL: PREVIEW_ORIGIN,
  E2E_MUTATIONS_ENABLED: 'true', E2E_MUTATION_FIXTURE_KIND: 'disposable',
  E2E_FAB_PROJECT_ID: fab.projectId, E2E_BLOCKED_DRAWING_ID: fab.blockedDrawingId, E2E_CLEAN_DRAWING_ID: fab.cleanDrawingId,
  E2E_USER: config.actors.pm.email, E2E_PASS: config.actors.pm.password,
  E2E_VIEWER_USER: config.actors.viewer.email, E2E_VIEWER_PASS: config.actors.viewer.password,
});
assertFabBindings(config, process.env);

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  timeout: 45_000, expect: { timeout: 15_000 },
  reporter: [['./e2e/drawingCutoverReporter.ts']],
  outputDir: 'test-results/drawing-cutover-private',
  use: { ...devices['Desktop Chrome'], baseURL: PREVIEW_ORIGIN, trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block' },
  projects: [
    { name: 'drawing-cutover', testMatch: 'drawing-cutover.spec.ts' },
    { name: 'drawing-cutover-fab', testMatch: 'fab-release-gate.spec.ts', dependencies: ['drawing-cutover'] },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: PREVIEW_ORIGIN, reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore',
    // Vite serves prebuilt bytes; the preview subprocess receives no actor secrets.
    env: { ...Object.fromEntries(Object.keys(process.env).map(key => [key, ''])),
      PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '', TEMP: process.env.TEMP ?? '', TMP: process.env.TMP ?? '', NODE_ENV: 'production' },
  },
});
