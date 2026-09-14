import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Forward migrations applied to production kjrwqagyeswwoxpjkcko on 2026-09-13.
// The MD5s are copied from docs/runbooks/supabase-drift-repair-2026-09-13.md,
// where they match the ledger's stored statement payloads; they were not
// recomputed from the files under test. Never re-pin them to make this pass.
const applied = [
  { version: '20260913201853', name: 'reconcile_verified_readiness_and_pm_floors', bytes: 18958, md5: 'e30b074dd619aa1f2abec654d6f812fe' },
  { version: '20260913201900', name: 'harden_drifted_function_entrypoints', bytes: 2974, md5: '614936e8913b88a7b6bf8b5c3197a1de' },
];

describe('migrations already applied to production', () => {
  it.each(applied)('keeps the exact applied bytes of $version', ({ version, name, bytes, md5 }) => {
    const file = `supabase/migrations/${version}_${name}.sql`;
    const immutable = `${file} must keep the exact bytes production applied as ledger version ${version}. `
      + 'Applied migrations are immutable: production never re-runs an edited file, so any change '
      + '(even whitespace or line endings) means the repo no longer records what the database ran. '
      + 'Restore the original bytes from git and put the fix in a new forward migration; do not re-pin the hash.';
    const migration = fileURLToPath(new URL(`../../${file}`, import.meta.url));
    expect(existsSync(migration), immutable).toBe(true);
    const payload = readFileSync(migration);
    expect({ bytes: payload.byteLength, md5: createHash('md5').update(payload).digest('hex') }, immutable)
      .toEqual({ bytes, md5 });
  });
});
