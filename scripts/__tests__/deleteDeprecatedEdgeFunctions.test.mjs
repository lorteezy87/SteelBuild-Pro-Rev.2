import { describe, expect, it } from 'vitest';

import {
  assertApplyConfirmation,
  deprecatedFunctionSlugs,
} from '../delete-deprecated-edge-functions.mjs';
import {
  localInventory,
  readManifest,
} from '../supabase-drift-check.mjs';

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

  it('requires exact project confirmation for apply mode', () => {
    expect(() => assertApplyConfirmation('project-ref', true, undefined)).not.toThrow();
    expect(() => assertApplyConfirmation('project-ref', false, undefined))
      .toThrow('CONFIRM_DELETE_DEPRECATED_FUNCTIONS=project-ref');
    expect(() => assertApplyConfirmation('project-ref', false, 'different-ref'))
      .toThrow('CONFIRM_DELETE_DEPRECATED_FUNCTIONS=project-ref');
    expect(() => assertApplyConfirmation('project-ref', false, 'project-ref')).not.toThrow();
  });
});
