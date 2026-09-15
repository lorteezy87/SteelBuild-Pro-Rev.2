import { describe, expect, it } from 'vitest';
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
    // Still a real file, but quarantined: out of every runner's glob, so it can
    // never be applied, and therefore never reported missing either.
    expect(local.quarantined).toContain('20260913084700');
    expect(local.migrations).not.toContain('20260913084700');
  });

  it('gives every override an evidence string', () => {
    for (const entry of manifest.local.migrationOverrides ?? []) {
      expect(entry.evidence, `override ${entry.version} needs evidence`).toBeTruthy();
      expect(entry.evidence.length).toBeGreaterThan(40);
    }
  });

  it('leaves no local migration unclassified', () => {
    // Every local migration must either be in the remote ledger or carry an
    // override. A gap here means a file nothing can ever account for.
    const overridden = new Set(
      (manifest.local.migrationOverrides ?? []).map((e: { version: string }) => e.version),
    );
    const unaccounted = [...local.migrations, ...local.quarantined].filter(
      (v: string) => !overridden.has(v) && !LEDGER.has(v),
    );
    expect(unaccounted).toEqual([]);
  });

  it('records uncertain lineage as unresolved, never as frozen', () => {
    // The runbook's lifecycle contract: an identifier with uncertain source or
    // lineage is recorded as unresolved and never silently allowlisted.
    // unresolved always fails drift until an owner restores the lineage, which
    // is the point — freezing these would hide them.
    const byVersion = new Map<string, { lifecycle: string; evidence: string }>(
      (manifest.local.migrationOverrides ?? []).map((e: { version: string }) => [e.version, e]),
    );
    for (const version of ['20260727232000', '20260801013000', '20260913090000']) {
      expect(byVersion.get(version)?.lifecycle, `${version} must stay unresolved`).toBe('unresolved');
    }
  });

  it('spells out the fab-release gate drift rather than burying it', () => {
    // 20260727232000 is the P0 path. The live gate is two layers of untracked
    // drift and the divergence is bidirectional, so applying is unsafe. The
    // owner decided on 2026-09-14 to record it and document the divergence; it
    // stays unresolved until the sibling gate is ported.
    const entry = (manifest.local.migrationOverrides ?? [])
      .find((e: { version: string }) => e.version === '20260727232000');
    expect(entry.lifecycle).toBe('unresolved');
    expect(entry.evidence).toMatch(/work_package_drawing_set_reports/);
    expect(entry.evidence).toMatch(/evaluate_fab_release_set/);
    expect(entry.evidence).toMatch(/bidirectional/i);
    expect(entry.evidence).toMatch(/OWNER DECISION 2026-09-14: record and document/);
    expect(entry.evidence).toMatch(/do not apply/i);
  });

  it('marks a migration whose data repair was never verified as schema-only', () => {
    const byVersion = new Map<string, { lifecycle: string; evidence: string }>(
      (manifest.local.migrationOverrides ?? []).map((e: { version: string }) => [e.version, e]),
    );
    for (const version of ['20260904120000', '20260908140000']) {
      const entry = byVersion.get(version);
      expect(entry?.lifecycle).toBe('intentionally-frozen');
      // must not read as a blanket "applied"
      expect(entry?.evidence).toMatch(/NEVER VERIFIED|never verified/);
      expect(entry?.evidence).toMatch(/schema-only/i);
    }
  });

  it('refuses to stamp a repair the ledger already records under another version', () => {
    const entry = (manifest.local.migrationOverrides ?? [])
      .find((e: { version: string }) => e.version === '20260817020000');
    expect(entry.lifecycle).toBe('intentionally-frozen');
    expect(entry.evidence).toMatch(/20260817083550/);
    expect(entry.evidence).toMatch(/MUST NOT BE STAMPED/);
  });
});

/**
 * The live ledger at the time these overrides were written (121 rows). Kept as
 * a literal so the "nothing unclassified" test above is deterministic and needs
 * no network access.
 */
const LEDGER = new Set([
  '20260101000000', '20260101000010', '20260101000020', '20260620231716', '20260623032908',
  '20260623042453', '20260626041744', '20260629091126', '20260629184030', '20260630000310',
  '20260630040350', '20260630060251', '20260630060302', '20260630131332', '20260702032954',
  '20260702034009', '20260702035058', '20260703152625', '20260703170000', '20260703180000',
  '20260704000000', '20260704000005', '20260704000010', '20260704020000', '20260704020010',
  '20260704030000', '20260705000000', '20260707061933', '20260707120000', '20260710070047',
  '20260710080000', '20260712000000', '20260712141821', '20260715235514', '20260716081258',
  '20260718000000', '20260718010000', '20260718020000', '20260718030000', '20260718040000',
  '20260718050000', '20260718070000', '20260720195844', '20260720213000', '20260721030200',
  '20260721031557', '20260721031606', '20260721060621', '20260721230000', '20260724120000',
  '20260724130000', '20260724140000', '20260724150000', '20260725183000', '20260725190000',
  '20260725193000', '20260725194500', '20260725200000', '20260725203000', '20260725210000',
  '20260727012111', '20260727192742', '20260802090000', '20260802090500', '20260817072554',
  '20260817083550', '20260906040515', '20260908045525', '20260909011728', '20260909014620',
  '20260909020328', '20260909021554', '20260909025658', '20260909031838', '20260909033138',
  '20260909034903', '20260909042216', '20260909043638', '20260909050350', '20260909051637',
  '20260909053304', '20260909055216', '20260909062016', '20260909062929', '20260909064310',
  '20260909065749', '20260909070839', '20260909073142', '20260909073500', '20260909074754',
  '20260909080453', '20260909082019', '20260909083319', '20260909084749', '20260909090445',
  '20260909091118', '20260909092236', '20260909093448', '20260909100010', '20260909104609',
  '20260909111157', '20260909113533', '20260910025557', '20260910031027', '20260910031540',
  '20260910034739', '20260910040138', '20260910044641', '20260911062832', '20260912023827',
  '20260912034015', '20260912042823', '20260912045532', '20260912052502', '20260912055243',
  '20260912062606', '20260913201853', '20260913201900', '20260913203000', '20260914010000',
  '20260914020000', '20260914120000', '20260914120100',
]);
