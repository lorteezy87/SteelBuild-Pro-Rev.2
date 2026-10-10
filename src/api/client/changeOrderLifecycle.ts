import { supabase } from '@/lib/supabase';
import { getActiveOrgGeneration } from '@/lib/activeOrg';
import { isChangeOrderDate, validateChangeOrderDecision } from '@/lib/changeOrders/lifecycle';
import { addAliases, cleanRecord } from './fieldMapping';
import { SupabaseOperationError } from './errors';
import type { EntityClient, RowWithAliases } from './supabaseTypes';
import type { Json } from '@/types/supabase';

type ChangeOrder = RowWithAliases<'change_orders'>;
const IMMUTABLE = new Set([
  'id', 'project_id', 'project_name', 'co_number', 'sov_line_number', 'created_at', 'created_by', 'updated_at',
  'submitted_by', 'approved_at', 'sov_applied_at',
]);
/** Matches the additive reviewed-save migration; the existing RPCs remain available to sibling callers. */
type ReviewedSaveRpc = { rpc: (name: 'save_change_order_reviewed', args: {
  p_id: string; p_expected_updated_at: string | null; p_expected_status: string;
  p_expected_amount: number | null; p_patch: Json;
}) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };

/** Metadata, lifecycle, SOV and project rollup commit or roll back together. */
export function withChangeOrderLifecycle<T extends EntityClient<'change_orders'>>(base: T): T {
  const update: T['update'] = async (id, updates, options) => {
    const review = options?.changeOrderReview;
    if (!review) throw new Error('Reopen this change order and review its current value and status before saving.');
    const generation = getActiveOrgGeneration();
    const assertOrigin = () => {
      if (generation !== getActiveOrgGeneration()) throw new Error('Workspace changed. Reopen this change order before saving.');
    };
    const current = await base.get(id, options);
    assertOrigin();
    if (!current?.id) throw new Error('Change order not found. Refresh the register.');
    const patch = cleanRecord(updates as Record<string, unknown>);
    if (patch.project_id && patch.project_id !== current.project_id) throw new Error('A change order cannot move to another project.');
    if (review.updatedAt !== (current.updated_at ?? null) || review.status !== current.status || review.amount !== (current.co_amount ?? null)) {
      throw new Error('This change order changed after your review. Refresh it and review the value and status before saving.');
    }
    const target = String(patch.status ?? current.status);
    const transition = target !== current.status;
    validateChangeOrderDecision(current.status, { co_amount: current.co_amount, ...patch });
    if (patch.submitted_date != null && !isChangeOrderDate(patch.submitted_date)) throw new Error('Enter a valid submitted date.');
    if (transition && target === 'Approved' && patch.approved_date != null && !isChangeOrderDate(patch.approved_date)) throw new Error('Enter a valid approval date.');
    for (const key of IMMUTABLE) delete patch[key];
    if (!(transition && target === 'Approved')) {
      for (const key of ['approved_date', 'approved_by', 'sov_mode']) delete patch[key];
    } else if (typeof patch.approved_by === 'string') patch.approved_by = patch.approved_by.trim();
    if (!(transition && target === 'Void')) delete patch.void_reason;
    else if (typeof patch.void_reason === 'string') patch.void_reason = patch.void_reason.trim();
    if (!(transition && target === 'Rejected')) delete patch.decision_notes;
    else if (typeof patch.decision_notes === 'string') patch.decision_notes = patch.decision_notes.trim();
    assertOrigin();
    const client = (options?.client ?? supabase) as unknown as ReviewedSaveRpc;
    const { data, error } = await client.rpc('save_change_order_reviewed', {
      p_id: id, p_expected_updated_at: review.updatedAt, p_expected_status: review.status,
      p_expected_amount: review.amount, p_patch: patch as Json,
    });
    if (error) throw new SupabaseOperationError('change_orders', 'save', error);
    if (!data || typeof data !== 'object' || !('id' in data)) throw new Error('The save result could not be confirmed. Refresh this change order before retrying.');
    return addAliases<ChangeOrder>(data as ChangeOrder, 'change_orders');
  };
  // Register bulk actions call update once per displayed record with its own review.
  const bulkUpdate: T['bulkUpdate'] = async (ids) => {
    if (ids.length === 0) return [];
    throw new Error('Review each selected change order before saving its changes.');
  };
  return { ...base, update, bulkUpdate };
}
