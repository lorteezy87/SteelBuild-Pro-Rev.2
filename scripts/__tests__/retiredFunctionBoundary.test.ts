import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compareDrift, localInventory, readManifest } from '../supabase-drift-check.mjs';

it.each(['legacy-app-files-copy', 'command-center-read', 'command-center-session-handoff'])('rejects retired %s without weakening required migration checks', (slug) => {
  const manifest = readManifest();
  const local = localInventory();
  const absent = compareDrift(manifest, local, [], []);
  const present = compareDrift(manifest, local, [], [{ slug }]);
  expect(absent.deprecatedFunctions).not.toContain(slug);
  expect(present.deprecatedFunctions).toContain(slug);
  expect(present.hasDrift).toBe(true);
  expect(present.missingMigrations).toEqual(absent.missingMigrations);
});

it.each(['legacy-app-files-copy', 'command-center-read', 'command-center-session-handoff'])('packages only inert %s', (slug) => {
  const source = readFileSync(new URL(`../../supabase/functions/${slug}/index.ts`, import.meta.url), 'utf8');
  let call: () => Response;
  new Function('Deno', source.replace(/^import .*;\r?\n/m, ''))({ serve: (handler: () => Response) => { call = handler; } });
  expect(call!().status).toBe(410);
  expect(source).not.toContain('maintenanceClient');
  expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  expect(source).not.toContain('createClient');
  expect(source).not.toContain('fetch(');
});
