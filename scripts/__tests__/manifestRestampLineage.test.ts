import { describe, expect, it } from 'vitest';
import { compareDrift, localInventory, readManifest } from '../supabase-drift-check.mjs';

interface ManifestEntry {
  version: string;
  owner: string;
  lifecycle: string;
  evidence: string;
}

/**
 * Applying a migration through the dashboard or the MCP server mints a fresh
 * version instead of reusing the filename's, so one migration ends up in the
 * ledger under a version that exists nowhere in either repo. The manifest is
 * how this repo reconciles that: the version production actually applied is
 * declared so it is not "unknown".
 *
 * The trap is the OTHER half of the pair. The source version — the one the
 * .sql file is named for — was never applied and never will be, so declaring
 * it "required" puts it in missingMigrations permanently, with no action that
 * could ever clear it. Three 2026-owned migrations were declared that way and
 * sat in every drift report as unfixable noise.
 */
const RESTAMPS = [
  { source: '20260909060000', applied: '20260909062016', name: 'm3_7_auto_archive_empty_drawing_sets' },
  { source: '20260909060100', applied: '20260909073500', name: 'm2_1_scope_project_number_uniqueness_to_org' },
  { source: '20260909090000', applied: '20260909090445', name: 'm19_reset_org_data' },
] as const;

describe('production apply-time restamp lineage', () => {
  const manifest = readManifest();
  const byVersion = new Map<string, ManifestEntry>(
    (manifest.migrations as ManifestEntry[]).map((entry) => [entry.version, entry]),
  );

  it.each(RESTAMPS)(
    'declares both halves of the $name restamp, and only the applied half is required',
    ({ source, applied }) => {
      const sourceEntry = byVersion.get(source);
      const appliedEntry = byVersion.get(applied);
      expect(sourceEntry, `manifest must still declare source ${source}`).toBeDefined();
      expect(appliedEntry, `manifest must still declare applied ${applied}`).toBeDefined();

      // The source version cannot be satisfied by any action, so it must never
      // be "required" — that is the bug this test exists to prevent.
      expect(sourceEntry?.lifecycle).toBe('intentionally-frozen');
      expect(appliedEntry?.lifecycle).toBe('intentionally-frozen');

      // Neither half may become an active local migration: the source would
      // reintroduce SQL production never ran, and the applied version would
      // collide with its own manifest entry and make validateManifest throw.
      expect(localInventory().migrations).not.toContain(source);
      expect(localInventory().migrations).not.toContain(applied);
    },
  );

  it('reports no missing migration for a ledger holding only the applied halves', () => {
    const scoped = {
      ...manifest,
      local: { ...manifest.local, functionOverrides: [], migrationOverrides: [] },
      migrations: (manifest.migrations as ManifestEntry[]).filter((entry) =>
        RESTAMPS.some((r) => r.source === entry.version || r.applied === entry.version),
      ),
      functions: [],
    };
    const remote = RESTAMPS.map((r) => ({ version: r.applied }));
    const report = compareDrift(scoped, { migrations: [], functions: [] }, remote, []);

    expect(report.missingMigrations).toEqual([]);
    expect(report.unknownMigrations).toEqual([]);
    expect(report.hasDrift).toBe(false);
  });

  it('never reports a source version as missing, even on an empty ledger', () => {
    const scoped = {
      ...manifest,
      local: { ...manifest.local, functionOverrides: [], migrationOverrides: [] },
      migrations: (manifest.migrations as ManifestEntry[]).filter((entry) =>
        RESTAMPS.some((r) => r.source === entry.version),
      ),
      functions: [],
    };
    const report = compareDrift(scoped, { migrations: [], functions: [] }, [], []);
    for (const { source } of RESTAMPS) {
      expect(report.missingMigrations).not.toContain(source);
    }
  });
});
