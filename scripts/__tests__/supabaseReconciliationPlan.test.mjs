import { describe, expect, it } from 'vitest';

import { buildReconciliationPlan } from '../supabase-reconciliation-plan.mjs';

const manifest = {
  schemaVersion: 1,
  projectRef: 'abcdefghijklmnopqrst',
  local: {
    owner: 'owner/rev2',
    migrationLifecycle: 'required',
    functionLifecycle: 'required',
    functionOverrides: [{
      slug: 'staging-only',
      lifecycle: 'staging-only',
      evidence: 'staging runbook',
    }],
  },
  migrations: [{
    version: '20260906040515',
    owner: 'unresolved',
    lifecycle: 'unresolved',
    evidence: 'source absent',
  }],
  functions: [{
    slug: 'old-function',
    owner: 'owner/rev2',
    lifecycle: 'deprecated',
    evidence: 'retirement runbook',
  }],
};

const local = {
  migrations: ['20260101000000'],
  functions: ['email-send', 'staging-only'],
};

describe('Supabase reconciliation planning', () => {
  it('produces reviewable actions without hiding unresolved lineage', () => {
    const plan = buildReconciliationPlan(manifest, local, {
      projectRef: manifest.projectRef,
      migrations: [
        { version: '20260906040515' },
        { version: '20260909011728' },
      ],
      functions: [
        { slug: 'old-function' },
        { slug: 'staging-only' },
      ],
    });
    expect(plan.mode).toBe('plan-only');
    expect(plan.blockers).toEqual([
      { type: 'unknown-remote-migration', asset: '20260909011728' },
      { type: 'unresolved-migration-lineage', asset: '20260906040515' },
    ]);
    expect(plan.proposedChanges).toEqual({
      applyRequiredMigrations: ['20260101000000'],
      deployRequiredFunctions: ['email-send'],
      deleteDeprecatedFunctions: ['old-function'],
      deleteEnvironmentExcludedFunctions: ['staging-only'],
    });
    expect(plan.canReconcile).toBe(false);
    expect(plan.isAlreadyReconciled).toBe(false);
  });

  it('reports a fully matching inventory without proposing mutations', () => {
    const cleanManifest = {
      ...manifest,
      migrations: [],
      functions: [],
      local: {
        ...manifest.local,
        functionOverrides: [],
      },
    };
    const cleanLocal = {
      migrations: local.migrations,
      functions: ['email-send'],
    };
    const plan = buildReconciliationPlan(cleanManifest, cleanLocal, {
      projectRef: manifest.projectRef,
      migrations: [{ version: '20260101000000' }],
      functions: [{ slug: 'email-send' }],
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.canReconcile).toBe(true);
    expect(plan.isAlreadyReconciled).toBe(true);
  });

  it('rejects evidence for a different Supabase project', () => {
    expect(() => buildReconciliationPlan(manifest, local, {
      projectRef: 'zyxwvutsrqponmlkjihg',
      migrations: [],
      functions: [],
    })).toThrow('does not match manifest project');
  });
});
