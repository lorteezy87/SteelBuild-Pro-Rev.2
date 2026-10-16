import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { resolveConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import foundation from '../../playwright.foundation.config.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const radixEntries = [
  '@radix-ui/react-dialog', '@radix-ui/react-popover',
  '@radix-ui/react-dropdown-menu', '@radix-ui/react-context-menu',
  '@radix-ui/react-tooltip', '@radix-ui/react-hover-card',
  '@radix-ui/react-label', '@radix-ui/react-select', '@radix-ui/react-slot',
];
const servers = Array.isArray(foundation.webServer) ? foundation.webServer : [foundation.webServer!];

async function configured(command: 'serve' | 'build' = 'serve') {
  return resolveConfig({ root, configFile: path.join(root, 'vite.config.js'), envFile: false }, command);
}

beforeEach(() => {
  vi.stubEnv('SENTRY_AUTH_TOKEN', '');
  vi.stubEnv('STEELBUILD_FOUNDATION_VITE_CACHE_DIR', undefined);
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'foundation-no-network-placeholder');
});
afterEach(() => vi.unstubAllEnvs());

describe('foundation Vite optimizer isolation', () => {
  it('resolves the two real foundation server environments to independent caches', async () => {
    const caches: string[] = [];
    for (const server of servers) {
      vi.stubEnv('STEELBUILD_FOUNDATION_VITE_CACHE_DIR', server.env?.STEELBUILD_FOUNDATION_VITE_CACHE_DIR);
      vi.stubEnv('VITE_SUPABASE_URL', server.env?.VITE_SUPABASE_URL ?? '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', server.env?.VITE_SUPABASE_ANON_KEY ?? '');
      caches.push((await configured()).cacheDir);
    }
    expect(caches).toEqual([
      path.resolve(root, 'node_modules/.vite-foundation-app').replaceAll('\\', '/'),
      path.resolve(root, 'node_modules/.vite-foundation-missing-env').replaceAll('\\', '/'),
    ]);
    expect(new Set(caches).size).toBe(2);
  });

  it('preoptimizes exactly the fixture entry modules together in each foundation server', async () => {
    for (const server of servers) {
      vi.stubEnv('STEELBUILD_FOUNDATION_VITE_CACHE_DIR', server.env?.STEELBUILD_FOUNDATION_VITE_CACHE_DIR);
      const config = await configured();
      expect(config.optimizeDeps.include?.filter(entry => entry.startsWith('@radix-ui/')).sort()).toEqual([...radixEntries].sort());
    }
  });

  it.each(['serve', 'build'] as const)('preserves independently resolved ordinary %s optimizer defaults', async command => {
    const defaults = await resolveConfig({ root, configFile: false, envFile: false, plugins: [react()] }, command);
    const config = await configured(command);
    expect(config.cacheDir).toBe(defaults.cacheDir);
    expect(config.optimizeDeps.include).toEqual(defaults.optimizeDeps.include);
  });
});
