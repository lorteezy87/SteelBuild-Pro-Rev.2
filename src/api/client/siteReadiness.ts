/**
 * Site readiness — one checklist item, set atomically on the server.
 *
 * `set_site_readiness_mark` (migration 20261022064000) locks the action_items
 * row and changes only the given item, so concurrent ticks by different users
 * serialize instead of overwriting each other's jsonb. SECURITY INVOKER: the
 * caller's action_items RLS applies.
 */
import { supabase } from '@/lib/supabase';
import { SupabaseOperationError } from './errors';
import type { Json } from '@/types/supabase';

export type ReadinessMarkState = 'done' | 'na' | null;

/** Narrow additive API contract; matches the committed migration before type regeneration. */
type ReadinessRpc = { rpc: (name: 'set_site_readiness_mark', args: {
  p_action_item_id: string; p_key: string; p_state: ReadinessMarkState; p_by: string | null;
}) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };

export interface ReadinessRow {
  id: string;
  project_id?: string | null;
  status?: string | null;
  metadata?: Json | null;
  [key: string]: unknown;
}

/** PostgREST "function not found": the migration is not on this database yet. */
export function isMissingFunctionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === 'PGRST202' || /Could not find the function/i.test(e.message ?? ''));
}

export async function setSiteReadinessMark(
  actionItemId: string,
  key: string,
  state: ReadinessMarkState,
  by: string | null,
  client: unknown = supabase,
): Promise<ReadinessRow> {
  const { data, error } = await (client as ReadinessRpc).rpc('set_site_readiness_mark', {
    p_action_item_id: actionItemId, p_key: key, p_state: state, p_by: by,
  });
  if (error) {
    if (isMissingFunctionError(error)) throw Object.assign(new Error(error.message), { code: 'PGRST202' });
    throw new SupabaseOperationError('action_items', 'update', error);
  }
  if (!data || typeof data !== 'object' || typeof (data as { id?: unknown }).id !== 'string') {
    throw new SupabaseOperationError('action_items', 'update', new Error('The saved checklist was not returned.'));
  }
  return data as ReadinessRow;
}
