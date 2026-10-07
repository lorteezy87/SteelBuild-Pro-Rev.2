import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mocks.rpc(...args) } }));
import { withChangeOrderLifecycle } from '../changeOrderLifecycle';
import type { EntityClient } from '../supabaseTypes';
const original = { id: 'co-1', project_id: 'project-1', title: 'Stair landing steel', status: 'Submitted', co_amount: 1200, updated_at: '2026-10-07T11:00:00.123456Z' };
const review = { status: 'Submitted', amount: 1200, updatedAt: original.updated_at };
const client = withChangeOrderLifecycle({ get: mocks.get, update: mocks.update } as unknown as EntityClient<'change_orders'>);
beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(original);
  mocks.update.mockReset().mockResolvedValue(original);
  mocks.rpc.mockReset().mockResolvedValue({ data: { ...original, status: 'Approved' }, error: null });
});
it('sends the displayed version and value to the locking approval transaction', async () => {
  await client.update('co-1', { title: 'Revised landing steel', status: 'Approved', approved_by: 'GC', approved_date: '2026-10-07', sov_mode: 'none' }, { changeOrderReview: review });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('save_change_order_reviewed', {
    p_id: 'co-1', p_expected_updated_at: original.updated_at, p_expected_status: 'Submitted', p_expected_amount: 1200,
    p_patch: { title: 'Revised landing steel', status: 'Approved', approved_by: 'GC', approved_date: '2026-10-07', sov_mode: 'none' },
  });
  expect(mocks.update).not.toHaveBeenCalled();
});
it('refuses to approve a value changed since the user reviewed it', async () => {
  mocks.get.mockResolvedValue({ ...original, co_amount: 12000 });
  await expect(client.update('co-1', { status: 'Approved', approved_by: 'GC', sov_mode: 'none' }, { changeOrderReview: review })).rejects.toThrow(/changed.*review/i);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
it('never commits the ordinary edits separately when the lifecycle transaction fails', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'SOV adjustment would be negative', code: '23514' } });
  await expect(client.update('co-1', { title: 'Changed scope', status: 'Approved', approved_by: 'GC', sov_mode: 'adjust_line', sov_line_item_id: 'sov-1' }, { changeOrderReview: review })).rejects.toThrow(/SOV adjustment/);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('preserves a valid submitted date in the authoritative save instead of silently ignoring it', async () => {
  await client.update('co-1', { submitted_date: '2026-09-30' }, { changeOrderReview: review });
  expect(mocks.rpc).toHaveBeenCalledWith('save_change_order_reviewed', expect.objectContaining({ p_patch: { submitted_date: '2026-09-30' } }));
  expect(mocks.update).not.toHaveBeenCalled();
});

it('does not substitute a newly fetched version when the caller supplies no displayed review', async () => {
  await expect(client.update('co-1', { status: 'Approved', approved_by: 'GC', sov_mode: 'none' })).rejects.toThrow(/review.*before saving/i);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('requires individual reviewed versions for a nonempty bulk save', async () => {
  await expect(client.bulkUpdate(['co-1'], { status: 'Submitted' })).rejects.toThrow(/review each/i);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  await expect(client.bulkUpdate([], { status: 'Submitted' })).resolves.toEqual([]);
});
