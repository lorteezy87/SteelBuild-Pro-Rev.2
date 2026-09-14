import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareDrift, localInventory, readManifest } from '../supabase-drift-check.mjs';

// These hashes come from the authenticated production ledger export, not from
// the archive under test. Reformatting an original payload destroys provenance.
const originals = [
  { version: '20260909090445', name: 'm19_reset_org_data', bytes: 3466, sha256: 'ae1cc33e8a33185eba25e7d6935d4cb05e7f6f178d216cfb03e551310c1cd0bd' },
  { version: '20260910034739', name: 'hard_delete_records', bytes: 20682, sha256: 'c9754d64671cdfc27be6871bb326777af7ff8ca25790c81dfba0f12850fabbe9' },
  { version: '20260910044641', name: 'm30_scope_items', bytes: 12309, sha256: '942871f2a0f9c04659c54d25d418eac57f4cb639505865c9779c4830d8eb29c5' },
];

describe('recovered shared-production migration lineage', () => {
  it.each(originals)('preserves the original ledger payload for $version outside active migrations', ({ version, name, bytes, sha256 }) => {
    const archive = fileURLToPath(new URL(`../../supabase/migrations_external/${version}_${name}.sql`, import.meta.url));
    expect(existsSync(archive)).toBe(true);
    const payload = readFileSync(archive);
    expect(payload.byteLength).toBe(bytes);
    expect(createHash('sha256').update(payload).digest('hex')).toBe(sha256);
    expect(localInventory().migrations).not.toContain(version);
  });

  it('requires the two distinct migrations while accepting either state of the superseded reset alias', () => {
    const manifest = readManifest();
    const scopedManifest = {
      ...manifest,
      local: { ...manifest.local, functionOverrides: [], migrationOverrides: [] },
      migrations: manifest.migrations.filter((entry: { version: string }) => originals.some(original => original.version === entry.version)),
      functions: [],
    };
    const local = { migrations: [], functions: [] };
    const required = [{ version: '20260910034739' }, { version: '20260910044641' }];
    expect(compareDrift(scopedManifest, local, required, []).hasDrift).toBe(false);
    expect(compareDrift(scopedManifest, local, [...required, { version: '20260909090445' }], []).hasDrift).toBe(false);
    const missing = compareDrift(scopedManifest, local, [], []);
    expect(missing.missingMigrations).toEqual(['20260910034739', '20260910044641']);
    expect(missing.hasDrift).toBe(true);
  });
});
