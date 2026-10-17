import { describe, expect, it } from 'vitest';
import { compareDrift, localInventory, readManifest } from '../../../scripts/supabase-drift-check.mjs';

describe('empty drawing-set lifecycle migration classification', () => {
  it('keeps the reviewed recount fix required and missing until its exact stamp exists', () => {
    const version = '20261017081417';
    const manifest = readManifest();
    const entry = manifest.local.migrationOverrides.find((candidate: { version: string }) => candidate.version === version);
    expect(entry?.lifecycle).toBe('required');
    expect(entry?.evidence).toContain('PENDING PRODUCTION APPLY');
    expect(compareDrift(manifest, localInventory(), [], []).missingMigrations).toContain(version);
  });
});
