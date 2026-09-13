import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertApplyConfirmation,
  deprecatedFunctionSlugs,
  main,
} from '../delete-deprecated-edge-functions.mjs';
import {
  localInventory,
  readManifest,
} from '../supabase-drift-check.mjs';

vi.mock('node:child_process', () => ({ spawnSync: () => ({ status: 1, stderr: 'Network and CLI disabled in this test' }) }));
afterEach(() => vi.unstubAllEnvs());

describe('deprecated Edge Function reconciliation', () => {
  it('derives the deletion set from the reviewed ownership manifest', () => {
    expect(deprecatedFunctionSlugs(readManifest(), localInventory())).toEqual([
      'bluebeam-proxy',
      'schedule-assistant',
      'sharepoint-proxy',
      'stripe-setup',
      'stripe-webhook',
      'stripe-worker',
    ]);
  });

  it('refuses the legacy apply path before CLI access while stripe-webhook is held', () => {
    vi.stubEnv('SUPABASE_ACCESS_TOKEN', 'offline-test');
    vi.stubEnv('DRY_RUN', '0');
    vi.stubEnv('SUPABASE_PROJECT_REF', 'kjrwqagyeswwoxpjkcko');
    vi.stubEnv('CONFIRM_DELETE_DEPRECATED_FUNCTIONS', 'kjrwqagyeswwoxpjkcko');
    expect(() => main()).toThrow('stripe-webhook is protected');
  });

  it('requires exact project confirmation for apply mode', () => {
    expect(() => assertApplyConfirmation('project-ref', true, undefined)).not.toThrow();
    expect(() => assertApplyConfirmation('project-ref', false, undefined))
      .toThrow('CONFIRM_DELETE_DEPRECATED_FUNCTIONS=project-ref');
    expect(() => assertApplyConfirmation('project-ref', false, 'different-ref'))
      .toThrow('CONFIRM_DELETE_DEPRECATED_FUNCTIONS=project-ref');
    expect(() => assertApplyConfirmation('project-ref', false, 'project-ref')).not.toThrow();
  });
});
