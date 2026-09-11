import { describe, expect, it } from 'vitest';

import * as drift from '../supabase-drift-check.mjs';

describe('Supabase drift evidence', () => {
  it('reports a local migration absent from remote history', () => {
    expect(drift.compareDrift(['20260101000000'], [], [], []).missingMigrations)
      .toEqual(['20260101000000']);
  });

  it('blocks remote-only migrations instead of declaring the repository reproducible', () => {
    const report = drift.compareDrift([], [{ version: '20260909011728', name: 'm1_auth' }], [], []);
    expect(report.extraMigrations).toEqual(['20260909011728']);
    expect(report.hasDrift).toBe(true);
  });

  it('matches exact function slugs, never an id, display name, or prefix', () => {
    const report = drift.compareDrift([], [], ['email-send'], [
      { id: 'email-send', name: 'email-send', slug: 'email-send-test' },
    ]);
    expect(report.missingFunctions).toEqual(['email-send']);
    expect(report.extraFunctions).toEqual(['email-send-test']);
  });

  it('rejects malformed evidence instead of silently producing empty sets', () => {
    expect(() => drift.compareDrift([], { error: 'forbidden' }, [], [])).toThrow();
    expect(() => drift.compareDrift([], [{ version: 'bad' }], [], [])).toThrow();
    expect(() => drift.compareDrift([], [], [], [{ id: 'id-only' }])).toThrow();
  });

  it('passes matching history and flags deprecated functions even if present locally', () => {
    expect(drift.compareDrift(['20260101000000'], [{ version: '20260101000000' }],
      ['email-send'], [{ slug: 'email-send' }]).hasDrift).toBe(false);
    expect(drift.compareDrift([], [], ['stripe-worker'], [{ slug: 'stripe-worker' }])
      .deprecatedFunctions).toEqual(['stripe-worker']);
  });

  it('reads the documented API paths and rejects HTTP failures', async () => {
    const requests = [];
    const fetcher = async (url, options) => {
      requests.push({ url, auth: options.headers.Authorization });
      return { ok: true, json: async () => [] };
    };
    await drift.readRemoteEvidence('project-ref', 'test-token', fetcher);
    expect(requests.map(r => r.url)).toEqual([
      'https://api.supabase.com/v1/projects/project-ref/database/migrations',
      'https://api.supabase.com/v1/projects/project-ref/functions',
    ]);
    expect(requests.every(r => r.auth === 'Bearer test-token')).toBe(true);
    await expect(drift.readRemoteEvidence('project-ref', 'test-token', async () =>
      ({ ok: false, status: 403 }))).rejects.toThrow('403');
  });
});
