import { supabase } from '@/lib/supabase';
import { getActiveOrgGeneration } from '@/lib/activeOrg';
import { addAliases, cleanRecord } from './fieldMapping';
import { SupabaseOperationError } from './errors';
import type { EntityClient, RowWithAliases } from './supabaseTypes';
import type { Json } from '@/types/supabase';

type SovSaveRpc = { rpc: (name: 'save_sov_item_reviewed', args: {
  p_id: string; p_expected_updated_at: string | null; p_patch: Json;
}) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };

/** A form opened before a CO adjustment must never overwrite that adjustment. */
export function withReviewedSovSaves<T extends EntityClient<'sov_items'>>(base: T): T {
  const update: T['update'] = async (id, updates, options) => {
    const review = options?.sovItemReview;
    if (!review) throw new Error('Reopen this SOV line and review its current values before saving.');
    const generation = getActiveOrgGeneration();
    const current = await base.get(id, options);
    if (generation !== getActiveOrgGeneration()) throw new Error('Workspace changed. Reopen this SOV line.');
    if (!current?.id) throw new Error('SOV line not found. Refresh the register.');
    if ((current.updated_at ?? null) !== review.updatedAt) throw new Error('This SOV line changed after your review. Refresh it and review the current value before saving.');
    const patch = cleanRecord(updates as Record<string, unknown>);
    if (patch.project_id && patch.project_id !== current.project_id) throw new Error('An SOV line cannot move to another project.');
    for (const field of ['id', 'project_id', 'project_name', 'sov_id', 'line_item_number', 'created_at', 'created_by', 'updated_at']) delete patch[field];
    const client = (options?.client ?? supabase) as unknown as SovSaveRpc;
    const { data, error } = await client.rpc('save_sov_item_reviewed', {
      p_id: id, p_expected_updated_at: review.updatedAt, p_patch: patch as Json,
    });
    if (error) throw new SupabaseOperationError('sov_items', 'save', error);
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') throw new Error('The SOV save could not be confirmed. Refresh the line before retrying.');
    return addAliases<RowWithAliases<'sov_items'>>(data as RowWithAliases<'sov_items'>, 'sov_items');
  };
  // Each line has its own displayed revision. A common patch cannot supply it.
  const bulkUpdate: T['bulkUpdate'] = async (ids) => {
    if (ids.length === 0) return [];
    throw new Error('Review each selected SOV line before saving its changes.');
  };
  return { ...base, update, bulkUpdate };
}
