import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs helper, no type declarations
import { QUARANTINE_DIR, compareDrift, localInventory, readManifest, validateManifest } from '../supabase-drift-check.mjs';

/**
 * supabase/migrations/ is an executable surface, not a document store.
 *
 * The Supabase CLI and the branching runner apply every `<14-digit>_*.sql` in
 * it, in version order, and read neither this repo's ownership manifest nor the
 * comments inside the files. So `local.migrationOverrides` makes a dangerous
 * migration quiet in the drift report while leaving it just as runnable — and a
 * staging branch is exactly the runner that would run it.
 *
 * Quarantine is the structural fix: the file moves out of the glob. These tests
 * pin the two halves of that contract — that the dangerous files are out of the
 * runner's path, and that being out of the path does not also take them out of
 * the report.
 */

const BASE = {
  schemaVersion: 1,
  projectRef: 'kjrwqagyeswwoxpjkcko',
  local: {
    owner: 'lorteezy87/SteelBuild-Pro-Rev.2',
    migrationLifecycle: 'required',
    functionLifecycle: 'required',
    functionOverrides: [],
    migrationOverrides: [],
  },
  migrations: [],
  functions: [],
};

const override = (version: string, lifecycle = 'intentionally-frozen') => ({
  version,
  lifecycle,
  evidence: `test evidence for ${version}`,
});

const manifestWith = (overrides: unknown[]) => ({
  ...BASE,
  local: { ...BASE.local, migrationOverrides: overrides },
});

const localWith = (migrations: string[], quarantined: string[]) => ({
  migrations,
  quarantined,
  functions: [],
});

describe('quarantine directory contract', () => {
  it('accepts an override whose only source file is quarantined', () => {
    // The "no source file" rule exists to stop a stale entry suppressing
    // nothing. A quarantined file is not stale — it is present and is exactly
    // what the entry documents.
    const manifest = manifestWith([override('20260102000000')]);
    expect(() => validateManifest(manifest, localWith([], ['20260102000000']))).not.toThrow();
  });

  it('refuses a quarantined file with no override, so nothing lands there unexplained', () => {
    expect(() => validateManifest(BASE, localWith([], ['20260102000000'])))
      .toThrow(/Quarantined migration has no local\.migrationOverrides entry: 20260102000000/);
  });

  it('refuses a quarantined file classified required, which nothing could satisfy', () => {
    // No runner can reach the file, so "required" is unsatisfiable by
    // construction — the unfixable-drift-noise bug in a new place.
    const manifest = manifestWith([override('20260102000000', 'required')]);
    expect(() => validateManifest(manifest, localWith([], ['20260102000000'])))
      .toThrow(/lifecycle required; a quarantined file must be intentionally-frozen or unresolved/);
  });

  it.each(['staging-only', 'deprecated'])(
    'refuses a quarantined file classified %s, an assertion about the remote ledger',
    (lifecycle) => {
      const manifest = manifestWith([override('20260102000000', lifecycle)]);
      expect(() => validateManifest(manifest, localWith([], ['20260102000000'])))
        .toThrow(/a quarantined file must be intentionally-frozen or unresolved/);
    },
  );

  it('refuses a version that is both active and quarantined', () => {
    // A copy in the quarantine does not disarm the one still in the runner's
    // glob, and a reader seeing the quarantined copy would think it was safe.
    const manifest = manifestWith([override('20260102000000')]);
    expect(() => validateManifest(manifest, localWith(['20260102000000'], ['20260102000000'])))
      .toThrow(/both active and quarantined: 20260102000000/);
  });

  it('keeps a local inventory with no quarantine list valid', () => {
    expect(() => validateManifest(BASE, { migrations: [], functions: [] })).not.toThrow();
  });
});

describe('quarantine and the drift report', () => {
  it('never reports a frozen quarantined migration as missing, even on an empty ledger', () => {
    const manifest = manifestWith([override('20260102000000')]);
    const report = compareDrift(manifest, localWith([], ['20260102000000']), [], []);
    expect(report.missingMigrations).toEqual([]);
    expect(report.hasDrift).toBe(false);
  });

  it('still fails drift for an unresolved quarantined migration', () => {
    // This is the half that is easy to get wrong: moving a file out of the
    // runner's path must not also move an open question out of the report.
    const manifest = manifestWith([override('20260102000000', 'unresolved')]);
    const report = compareDrift(manifest, localWith([], ['20260102000000']), [], []);
    expect(report.unresolvedMigrations).toEqual(['20260102000000']);
    expect(report.hasDrift).toBe(true);
  });

  it('classifies a quarantined version found in the remote ledger instead of calling it unknown', () => {
    const manifest = manifestWith([override('20260102000000')]);
    const report = compareDrift(
      manifest,
      localWith([], ['20260102000000']),
      [{ version: '20260102000000' }],
      [],
    );
    expect(report.unknownMigrations).toEqual([]);
    expect(report.missingMigrations).toEqual([]);
  });
});

describe('the real quarantine', () => {
  const manifest = readManifest();
  const local = localInventory();
  const byVersion = new Map<string, { lifecycle: string; evidence: string }>(
    (manifest.local.migrationOverrides ?? []).map((e: { version: string }) => [e.version, e]),
  );

  // Both files would regress production if a runner reached them: one replaces
  // the live expense guards with a weaker create-only guard, the other deletes
  // live blockers from the P0 fab-release gate.
  const QUARANTINED = ['20260727232000', '20260913084700'];

  it('holds exactly the two migrations that must never run', () => {
    expect(local.quarantined).toEqual(QUARANTINED);
  });

  it.each(QUARANTINED)('keeps %s out of the runner-executed directory', (version) => {
    // Check the actual files, not just the derived inventory: the inventory is
    // computed from the same glob the runner uses, so a filename the glob does
    // not match (a .sql.bak, say) would leave a file in place that this repo's
    // own bookkeeping cannot see.
    const inRunnerDir = readdirSync(path.resolve(process.cwd(), 'supabase/migrations'))
      .filter((name) => name.startsWith(version));
    expect(inRunnerDir, `${version} must not have any file in supabase/migrations/`).toEqual([]);

    const inQuarantine = readdirSync(path.resolve(process.cwd(), QUARANTINE_DIR))
      .filter((name) => name.startsWith(version));
    expect(inQuarantine).toHaveLength(1);
    expect(local.migrations).not.toContain(version);
  });

  it.each(QUARANTINED)('records why %s is quarantined, at a lifecycle quarantine can mean', (version) => {
    const entry = byVersion.get(version);
    expect(entry, `${version} must carry an override`).toBeDefined();
    expect(['intentionally-frozen', 'unresolved']).toContain(entry?.lifecycle);
    expect(entry?.evidence).toMatch(/QUARANTINED/);
  });

  it('documents the directory contract next to the files', () => {
    const readme = readFileSync(path.resolve(process.cwd(), QUARANTINE_DIR, 'README.md'), 'utf8');
    for (const version of QUARANTINED) expect(readme).toContain(version);
    expect(readme).toMatch(/never run/i);
  });

  it('validates the real manifest against the real split inventory', () => {
    expect(() => validateManifest(manifest, local)).not.toThrow();
  });
});
