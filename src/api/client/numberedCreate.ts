import { supabase } from '@/lib/supabase';
import { addAliases, cleanRecord } from './fieldMapping';
import { SupabaseOperationError } from './errors';
import type { EntityRequestOptions, RowWithAliases } from './supabaseTypes';
import type { Json } from '@/types/supabase';

export type NumberedKind = 'change_orders' | 'change_requests' | 'deliveries' | 'sov_items' | 'backcharges';
const DERIVED: Record<NumberedKind, readonly string[]> = {
  change_orders: ['co_number', 'sov_line_number', 'submitted_by'],
  change_requests: ['cr_number', 'change_order_id'],
  deliveries: ['delivery_number', 'pieces', 'weight_tons'],
  sov_items: ['line_item_number', 'sov_id'],
  backcharges: ['backcharge_number', 'ticket_total', 'linked_co_number', 'source_rfi_number'],
};

/** Narrow additive API contract; matches the committed migration before type regeneration. */
type NumberedRpc = { rpc: (name: 'create_numbered_record', args: {
  p_project_id: string; p_kind: NumberedKind; p_client_op_id: string; p_payload: Json;
}) => PromiseLike<{ data: unknown; error: { message: string; code?: string; status?: number } | null }> };

export class NumberedCreateError extends SupabaseOperationError {
  readonly clientOperationId: string;
  readonly outcomeUnknown: boolean;
  constructor(kind: NumberedKind, clientOperationId: string, cause: unknown, outcomeUnknown: boolean) {
    super(kind, 'create', cause);
    this.name = 'NumberedCreateError';
    this.clientOperationId = clientOperationId;
    this.outcomeUnknown = outcomeUnknown;
    this.cause = cause;
    if (outcomeUnknown) this.message += ' The save may have completed. Retry this draft to recover the original record; do not start a duplicate.';
  }
}

/** One transaction for number, row, collected fields, audit and retry receipt. */
export async function createNumberedRecord<T extends NumberedKind>(kind: T, input: Record<string, unknown>, options: EntityRequestOptions = {}): Promise<RowWithAliases<T>> {
  const payload = cleanRecord(input);
  const projectId = payload.project_id;
  if (typeof projectId !== 'string' || !projectId.trim()) throw new Error(`project_id is required to create a ${kind} record`);
  const operation = options.clientOperationId ?? crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation)) throw new Error('A valid operation identity is required. Reopen the draft.');
  for (const key of ['project_id', 'project_name', 'id', 'created_at', 'updated_at', 'created_by', ...DERIVED[kind]]) delete payload[key];
  try {
    const client = (options.client ?? supabase) as unknown as NumberedRpc;
    const { data, error } = await client.rpc('create_numbered_record', {
      p_project_id: projectId, p_kind: kind, p_client_op_id: operation, p_payload: payload as Json,
    });
    if (error) {
      // SQL/PostgREST rejections are definite failures; transport errors can lose a committed reply.
      const definite = /^[0-9A-Z]{5}$/.test(error.code || '') || /^PGRST/.test(error.code || '');
      throw new NumberedCreateError(kind, operation, error, !definite);
    }
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') {
      throw new NumberedCreateError(kind, operation, new Error('The saved record was not returned.'), true);
    }
    return addAliases<RowWithAliases<T>>(data as RowWithAliases<T>, kind);
  } catch (cause) {
    if (cause instanceof NumberedCreateError) throw cause;
    throw new NumberedCreateError(kind, operation, cause, true);
  }
}
