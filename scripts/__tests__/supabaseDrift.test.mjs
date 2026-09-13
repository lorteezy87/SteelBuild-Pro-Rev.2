import { describe, expect, it } from 'vitest';

import * as drift from '../supabase-drift-check.mjs';

const manifest = (overrides = {}) => ({
  schemaVersion: 1,
  projectRef: 'abcdefghijklmnopqrst',
  local: {
    owner: 'owner/rev2',
    migrationLifecycle: 'required',
    functionLifecycle: 'required',
    functionOverrides: [],
  },
  migrations: [],
  functions: [],
  ...overrides,
});

const local = {
  migrations: ['20260101000000'],
  functions: ['email-send'],
};

describe('Supabase production ownership evidence', () => {
  it('validates the reviewed repository manifest and preserves its blockers', () => {
    const repositoryManifest = drift.readManifest();
    const repositoryLocal = drift.localInventory();
    expect(() => drift.validateManifest(repositoryManifest, repositoryLocal)).not.toThrow();
    expect(repositoryManifest.migrations).toHaveLength(45);
    expect(repositoryManifest.migrations
      .filter(entry => entry.lifecycle === 'unresolved')
      .map(entry => entry.version)).toEqual([
      '20260909090445',
      '20260910034739',
      '20260910044641',
    ]);
  });

  it('requires active local and external required assets in production', () => {
    const owned = manifest({
      migrations: [{
        version: '20260909011728',
        owner: 'owner/2026',
        lifecycle: 'required',
        evidence: 'owner/2026 migration source',
      }],
    });
    const report = drift.compareDrift(
      owned,
      local,
      [{ version: '20260101000000' }],
      [{ slug: 'email-send' }],
    );
    expect(report.missingMigrations).toEqual(['20260909011728']);
    expect(report.hasDrift).toBe(true);
  });

  it('permits reviewed external assets and rejects unknown remote assets', () => {
    const owned = manifest({
      functions: [{
        slug: 'sheets-api',
        owner: 'owner/sheets',
        lifecycle: 'required',
        evidence: 'reviewed source repository',
      }],
    });
    const report = drift.compareDrift(
      owned,
      local,
      [{ version: '20260101000000' }, { version: '20260909011728' }],
      [{ slug: 'email-send' }, { slug: 'sheets-api' }],
    );
    expect(report.unknownMigrations).toEqual(['20260909011728']);
    expect(report.unknownFunctions).toEqual([]);
  });

  it('permits absent frozen and staging-only local functions', () => {
    const owned = manifest({
      local: {
        ...manifest().local,
        functionOverrides: [
          {
            slug: 'account-delete',
            lifecycle: 'intentionally-frozen',
            evidence: 'frozen pending owner release',
          },
          {
            slug: 'staging-e2e-bootstrap',
            lifecycle: 'staging-only',
            evidence: 'staging runbook',
          },
        ],
      },
    });
    const source = {
      migrations: local.migrations,
      functions: ['email-send', 'account-delete', 'staging-e2e-bootstrap'],
    };
    const report = drift.compareDrift(
      owned,
      source,
      [{ version: '20260101000000' }],
      [{ slug: 'email-send' }],
    );
    expect(report.missingFunctions).toEqual([]);
    expect(report.hasDrift).toBe(false);
  });

  it('fails when staging-only or deprecated functions are deployed', () => {
    const owned = manifest({
      local: {
        ...manifest().local,
        functionOverrides: [{
          slug: 'staging-e2e-bootstrap',
          lifecycle: 'staging-only',
          evidence: 'staging runbook',
        }],
      },
      functions: [{
        slug: 'schedule-assistant',
        owner: 'owner/rev2',
        lifecycle: 'deprecated',
        evidence: 'retirement plan',
      }],
    });
    const source = {
      migrations: local.migrations,
      functions: ['email-send', 'staging-e2e-bootstrap'],
    };
    const report = drift.compareDrift(
      owned,
      source,
      [{ version: '20260101000000' }],
      [
        { slug: 'email-send' },
        { slug: 'staging-e2e-bootstrap' },
        { slug: 'schedule-assistant' },
      ],
    );
    expect(report.environmentExcludedFunctions).toEqual(['staging-e2e-bootstrap']);
    expect(report.deprecatedFunctions).toEqual(['schedule-assistant']);
    expect(report.hasDrift).toBe(true);
  });

  it('keeps unresolved entries as blockers instead of allowlisting them', () => {
    const owned = manifest({
      migrations: [{
        version: '20260906040515',
        owner: 'unresolved',
        lifecycle: 'unresolved',
        evidence: 'remote ledger only; exact source absent',
      }],
    });
    const report = drift.compareDrift(
      owned,
      local,
      [{ version: '20260101000000' }, { version: '20260906040515' }],
      [{ slug: 'email-send' }],
    );
    expect(report.unresolvedMigrations).toEqual(['20260906040515']);
    expect(report.unknownMigrations).toEqual([]);
    expect(report.hasDrift).toBe(true);
  });

  it('rejects malformed and duplicate manifest entries', () => {
    expect(() => drift.compareDrift(
      manifest({ migrations: [{ version: 'bad' }] }),
      local,
      [],
      [],
    )).toThrow('Invalid manifest migration version');

    const duplicate = {
      version: '20260909011728',
      owner: 'owner/2026',
      lifecycle: 'required',
      evidence: 'source',
    };
    expect(() => drift.compareDrift(
      manifest({ migrations: [duplicate, duplicate] }),
      local,
      [],
      [],
    )).toThrow('Duplicate manifest migration version');
  });

  it('rejects malformed or duplicate remote evidence', () => {
    expect(() => drift.compareDrift(manifest(), local, { error: 'forbidden' }, []))
      .toThrow('Invalid remote version inventory');
    expect(() => drift.compareDrift(
      manifest(),
      local,
      [{ version: '20260101000000' }, { version: '20260101000000' }],
      [],
    )).toThrow('Duplicate remote version');
  });

  it('reads documented API paths, uses bearer auth, and rejects HTTP failures', async () => {
    const requests = [];
    const fetcher = async (url, options) => {
      requests.push({ url, auth: options.headers.Authorization });
      return { ok: true, json: async () => [] };
    };
    await drift.readRemoteEvidence('project-ref', 'test-token', fetcher);
    expect(requests.map(request => request.url)).toEqual([
      'https://api.supabase.com/v1/projects/project-ref/database/migrations',
      'https://api.supabase.com/v1/projects/project-ref/functions',
    ]);
    expect(requests.every(request => request.auth === 'Bearer test-token')).toBe(true);
    await expect(drift.readRemoteEvidence('project-ref', 'test-token', async () =>
      ({ ok: false, status: 403 }))).rejects.toThrow('403');
  });
});
