import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs helper, no type declarations
import { compareDrift, localInventory, readManifest, validateManifest } from '../supabase-drift-check.mjs';

/**
 * local.migrationOverrides exists because a local migration file can legitimately
 * have a lifecycle other than "required", and there was previously no way to say so.
 *
 * The manifest's own `migrations` list cannot express it: validateManifest rejects
 * an entry duplicating an active local migration, since a migration must carry
 * exactly one classification. So a file already applied under a restamped version,
 * or one that must never be applied because production holds a stronger
 * implementation, sat in missingMigrations permanently — with no action that could
 * ever clear it, which is the definition of noise in a drift report.
 *
 * This mirrors local.functionOverrides, which solves the same problem for functions.
 */

const BASE = {
  schemaVersion: 1,
  projectRef: 'kjrwqagyeswwoxpjkcko',
  local: {
    owner: 'lorteezy87/SteelBuild-Pro-Rev.2',
    migrationLifecycle: 'required',
    functionLifecycle: 'required',
    functionOverrides: [],
  },
  migrations: [],
  functions: [],
};

const LOCAL = { migrations: ['20260101000000', '20260102000000'], functions: [] };
const override = (version: string, lifecycle = 'intentionally-frozen') => ({
  version,
  lifecycle,
  evidence: `test evidence for ${version}`,
});

const withOverrides = (overrides: unknown[]) => ({
  ...BASE,
  local: { ...BASE.local, migrationOverrides: overrides },
});

describe('local.migrationOverrides', () => {
  it('keeps a manifest without the field valid (backward compatible)', () => {
    expect(() => validateManifest(BASE, LOCAL)).not.toThrow();
    const r = compareDrift(BASE, LOCAL, [{ version: '20260101000000' }], []);
    // no overrides, so the unapplied one is still required and therefore missing
    expect(r.missingMigrations).toEqual(['20260102000000']);
  });

  it('stops an overridden migration being reported missing', () => {
    const manifest = withOverrides([override('20260102000000')]);
    const r = compareDrift(manifest, LOCAL, [{ version: '20260101000000' }], []);
    expect(r.missingMigrations).toEqual([]);
    expect(r.unknownMigrations).toEqual([]);
    expect(r.hasDrift).toBe(false);
  });

  it('leaves non-overridden migrations required', () => {
    const manifest = withOverrides([override('20260102000000')]);
    const r = compareDrift(manifest, LOCAL, [], []);
    // 20260102000000 is frozen; 20260101000000 is still required and absent
    expect(r.missingMigrations).toEqual(['20260101000000']);
  });

  it('still reports an overridden migration present in remote as known, not unknown', () => {
    const manifest = withOverrides([override('20260102000000')]);
    const r = compareDrift(manifest, LOCAL, [{ version: '20260101000000' }, { version: '20260102000000' }], []);
    expect(r.unknownMigrations).toEqual([]);
    expect(r.missingMigrations).toEqual([]);
  });

  it('honours a lifecycle other than intentionally-frozen', () => {
    // deprecated means "must be absent"; present in remote must therefore fail
    const manifest = withOverrides([override('20260102000000', 'deprecated')]);
    const present = compareDrift(manifest, LOCAL, [{ version: '20260101000000' }, { version: '20260102000000' }], []);
    expect(present.deprecatedMigrations).toEqual(['20260102000000']);
    expect(present.hasDrift).toBe(true);
  });

  it('rejects an override with no source file, so a stale entry cannot suppress nothing', () => {
    const manifest = withOverrides([override('20260103000000')]);
    expect(() => validateManifest(manifest, LOCAL)).toThrow(/no source file: 20260103000000/);
  });

  it('rejects duplicate override versions', () => {
    const manifest = withOverrides([override('20260102000000'), override('20260102000000')]);
    expect(() => validateManifest(manifest, LOCAL)).toThrow(/local migration override version/);
  });

  it('rejects an invalid lifecycle', () => {
    const manifest = withOverrides([override('20260102000000', 'probably-fine')]);
    expect(() => validateManifest(manifest, LOCAL)).toThrow(/lifecycle/);
  });

  it('rejects a malformed version', () => {
    const manifest = withOverrides([override('2026')]);
    expect(() => validateManifest(manifest, LOCAL)).toThrow(/local migration override/);
  });

  it('rejects a non-array migrationOverrides', () => {
    const manifest = { ...BASE, local: { ...BASE.local, migrationOverrides: {} } };
    expect(() => validateManifest(manifest, LOCAL)).toThrow(/must be an array/);
  });

  it('does not weaken the manifest/local collision rule', () => {
    // Overrides live under local.*; the manifest's own migrations list must still
    // refuse to duplicate an active local migration.
    const manifest = {
      ...withOverrides([override('20260102000000')]),
      migrations: [{
        version: '20260101000000',
        owner: 'someone/else',
        lifecycle: 'required',
        evidence: 'x',
      }],
    };
    expect(() => validateManifest(manifest, LOCAL)).toThrow(/duplicates active local migration/);
  });
});

describe('the real manifest', () => {
  const manifest = readManifest();
  const local = localInventory();

  it('validates against the live migration inventory', () => {
    expect(() => validateManifest(manifest, local)).not.toThrow();
  });

  it('freezes the expense migration that must never be applied', () => {
    // 20260913084700 drops every trigger on public.expenses and installs a
    // create-only guard, while production carries the strictly stronger
    // enforce_expense_guards. Applying it would be a regression, so it is
    // superseded rather than pending.
    const entry = (manifest.local.migrationOverrides ?? [])
      .find((e: { version: string }) => e.version === '20260913084700');
    expect(entry).toBeDefined();
    expect(entry.lifecycle).toBe('intentionally-frozen');
    expect(entry.evidence).toMatch(/MUST NOT BE APPLIED/);
    expect(entry.evidence).toMatch(/enforce_expense_guards/);
    // and it is still a real file, not deleted
    expect(local.migrations).toContain('20260913084700');
  });

  it('gives every override an evidence string', () => {
    for (const entry of manifest.local.migrationOverrides ?? []) {
      expect(entry.evidence, `override ${entry.version} needs evidence`).toBeTruthy();
      expect(entry.evidence.length).toBeGreaterThan(40);
    }
  });
});
