import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  rpc: (...args: unknown[]) => mocks.rpc(...args),
  from: (...args: unknown[]) => { mocks.from(...args); const builder = { update: () => builder, select: () => builder, eq: () => builder, single: async () => ({ data: { id: 'record-1' }, error: null as null }) }; return builder; },
} }));
import { entities } from '../entities';
import { createBackcharge } from '@/lib/backcharge/repository';
const operation = '00000000-0000-4000-8000-000000000001';
beforeEach(() => { mocks.rpc.mockReset(); mocks.from.mockClear(); });

describe.each([
  ['change_orders', (payload: never, options: never) => entities.ChangeOrder.create(payload, options), { title: 'Added connection plates', co_amount: 1250, attachments: 'approved-scope.pdf' }],
  ['change_requests', (payload: never, options: never) => entities.ChangeRequest.create(payload, options), { title: 'RFI 21 impact' }],
  ['deliveries', (payload: never, options: never) => entities.Delivery.create(payload, options), { delivery_title: 'Sequence 4', is_long_lead: true, lead_time_weeks: 12 }],
  ['sov_items', (payload: never, options: never) => entities.SOVItem.create(payload, options), { description: 'Fabrication', scheduled_value: 50000, application_number: 2, period_from: '2026-09-01' }],
  ['backcharges', (payload: never, options: never) => createBackcharge(payload, options), { title: 'Crane standby', amount: 1200, notice_date: '2026-10-07', attachments: ['notice.pdf'] }],
] as const)('%s transaction', (kind, create, payload) => {
  it('saves all collected fields and the operation identity in one database request', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'record-1', project_id: 'project-1', ...payload }, error: null });
    const record = await create({ project_id: 'project-1', ...payload } as never, { clientOperationId: operation } as never);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_numbered_record', { p_kind: kind, p_project_id: 'project-1', p_client_op_id: operation, p_payload: payload });
    expect(record).toMatchObject({ id: 'record-1', ...payload });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('retains the operation identity after an ambiguous network failure for a safe retry', async () => {
    mocks.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const failure = await create({ project_id: 'project-1', ...payload } as never, { clientOperationId: operation } as never).catch(error => error);
    expect(failure).toMatchObject({ clientOperationId: operation, outcomeUnknown: true });
    mocks.rpc.mockResolvedValue({ data: { id: 'original-record', project_id: 'project-1', ...payload }, error: null });
    const recovered = await create({ project_id: 'project-1', ...payload } as never, { clientOperationId: failure.clientOperationId } as never);
    expect(recovered.id).toBe('original-record');
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_client_op_id: operation });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

it('rejects malformed operation identities before a write', async () => {
  mocks.rpc.mockResolvedValue({ data: { id: 'unexpected' }, error: null });
  await expect(entities.ChangeOrder.create({ project_id: 'project-1', title: 'Connection', co_amount: 100 }, { clientOperationId: 'not-a-uuid' } as never)).rejects.toThrow(/operation/i);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('does not fall back to a non-idempotent legacy RPC if the candidate is unavailable', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Could not find create_numbered_record', code: 'PGRST202' } });
  await expect(entities.ChangeOrder.create({ project_id: 'project-1', title: 'Connection', co_amount: 100 }, { clientOperationId: operation } as never)).rejects.toMatchObject({ clientOperationId: operation, outcomeUnknown: false });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
