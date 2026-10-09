import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  current: { id: 'co-1', project_id: 'p1', status: 'Draft', co_number: 'CO-001', co_amount: 500, title: 'Added embeds' } as Record<string, unknown>,
  update: vi.fn(), rpc: vi.fn(), readError: null as null | { message: string },
  afterRead: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {
  rpc: (...args: unknown[]) => mocks.rpc(...args),
  from: () => {
    let patch: Record<string, unknown> | undefined;
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder, data: [] as unknown[], error: null as null,
      maybeSingle: async () => ({ data: mocks.current, error: mocks.readError }),
      update: (value: Record<string, unknown>) => { patch = value; mocks.update(value); return builder; },
      single: async () => { if (!patch) mocks.afterRead(); return { data: { ...mocks.current, ...patch }, error: patch ? null : mocks.readError }; },
    };
    return builder;
  },
} }));
import { entities } from '../entities';
import { setActiveOrgId } from '@/lib/activeOrg';
const reviewedUpdate: typeof entities.ChangeOrder.update = (id, patch) => entities.ChangeOrder.update(id, patch, {
  changeOrderReview: {
    updatedAt: typeof mocks.current.updated_at === 'string' ? mocks.current.updated_at : null,
    status: String(mocks.current.status),
    amount: typeof mocks.current.co_amount === 'number' ? mocks.current.co_amount : null,
  },
});

beforeEach(() => {
  mocks.current = { id: 'co-1', project_id: 'p1', status: 'Draft', co_number: 'CO-001', co_amount: 500, title: 'Added embeds' };
  mocks.readError = null;
  mocks.afterRead.mockReset();
  setActiveOrgId('org-1');
  mocks.update.mockReset();
  mocks.rpc.mockReset().mockResolvedValue({ data: { ...mocks.current, status: 'Submitted' }, error: null });
});

describe('change-order lifecycle persistence', () => {
  it('submits through the existing state RPC rather than a guarded table status write', async () => {
    await reviewedUpdate('co-1', { status: 'Submitted', submitted_date: '2026-10-07' });
    expect(mocks.rpc).toHaveBeenCalledWith('save_change_order_reviewed', { p_id: 'co-1', p_expected_updated_at: null, p_expected_status: 'Draft', p_expected_amount: 500, p_patch: { status: 'Submitted', submitted_date: '2026-10-07' } });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('uses the explicit SOV decision and approver in the atomic approval RPC', async () => {
    await reviewedUpdate('co-1', { status: 'Approved', approved_by: '  GC Representative  ', approved_date: '2026-10-07', sov_mode: 'adjust_line', sov_line_item_id: 'sov-1' });
    expect(mocks.rpc).toHaveBeenCalledWith('save_change_order_reviewed', { p_id: 'co-1', p_expected_updated_at: null, p_expected_status: 'Draft', p_expected_amount: 500, p_patch: { status: 'Approved', approved_by: 'GC Representative', approved_date: '2026-10-07', sov_mode: 'adjust_line', sov_line_item_id: 'sov-1' } });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['Rejected', 'Void'])('requires a written %s reason before changing any fields', async status => {
    mocks.current.status = 'Submitted';
    await expect(reviewedUpdate('co-1', { title: 'Changed', status })).rejects.toThrow(/written reason/i);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('routes a void reason through the reversal RPC', async () => {
    mocks.current.status = 'Approved';
    await reviewedUpdate('co-1', { status: 'Void', void_reason: '  Duplicate authorization  ' });
    expect(mocks.rpc).toHaveBeenCalledWith('save_change_order_reviewed', { p_id: 'co-1', p_expected_updated_at: null, p_expected_status: 'Approved', p_expected_amount: 500, p_patch: { status: 'Void', void_reason: 'Duplicate authorization' } });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('requires an explicit SOV treatment for approval', async () => {
    await expect(reviewedUpdate('co-1', { status: 'Approved', approved_by: 'GC', title: 'Changed' })).rejects.toThrow(/SOV treatment/i);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects an invalid transition before saving unrelated edits', async () => {
    mocks.current.status = 'Void';
    await expect(reviewedUpdate('co-1', { status: 'Draft', title: 'Changed' })).rejects.toThrow(/cannot move/i);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects a project change rather than moving a commercial record', async () => {
    await expect(reviewedUpdate('co-1', { project_id: 'p2', title: 'Changed' })).rejects.toThrow(/project/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not restamp an already approved record during an ordinary edit', async () => {
    Object.assign(mocks.current, { status: 'Approved', approved_by: 'GC', approved_date: '2026-10-07' });
    await reviewedUpdate('co-1', { status: 'Approved', approved_by: 'GC', approved_date: '2026-10-07', co_number: 'CO-001', notes: 'Backup filed' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('save_change_order_reviewed', expect.objectContaining({ p_patch: { status: 'Approved', notes: 'Backup filed' } }));
  });
  it('reports transaction failure without a separate committed metadata write', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Approval was revoked', code: '42501' } });
    const outcome = await reviewedUpdate('co-1', { title: 'Revised embeds', status: 'Submitted' }).catch(error => error);
    expect(outcome).toMatchObject({ name: 'SupabaseOperationError', code: '42501' });
    expect(outcome.message).toMatch(/Approval was revoked/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('propagates read failure without writing or changing state', async () => {
    mocks.readError = { message: 'Connection interrupted' };
    await expect(reviewedUpdate('co-1', { status: 'Submitted' })).rejects.toThrow('Connection interrupted');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('stops a delayed lifecycle request after a workspace switch', async () => {
    mocks.afterRead.mockImplementation(() => setActiveOrgId('org-2'));
    await expect(reviewedUpdate('co-1', { status: 'Submitted', title: 'Wrong workspace' })).rejects.toThrow(/Workspace changed/);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects an impossible approval date before saving associated edits', async () => {
    await expect(reviewedUpdate('co-1', { status: 'Approved', approved_date: '2026-02-30', approved_by: 'GC', sov_mode: 'none', title: 'Changed' })).rejects.toThrow(/date/i);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('routes individually reviewed register selections through the same approval authority', async () => {
    await reviewedUpdate('co-1', { status: 'Submitted' });
    await reviewedUpdate('co-2', { status: 'Submitted' });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'save_change_order_reviewed', expect.objectContaining({ p_id: 'co-1', p_patch: { status: 'Submitted' } }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'save_change_order_reviewed', expect.objectContaining({ p_id: 'co-2', p_patch: { status: 'Submitted' } }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
