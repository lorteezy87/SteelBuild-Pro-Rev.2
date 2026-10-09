import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), rpc: vi.fn(), bulkUpdate: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mocks.rpc(...args) } }));
import { withReviewedSovSaves } from '../sovLifecycle';
import type { EntityClient } from '../supabaseTypes';
const original = { id: 'sov-1', project_id: 'p1', scheduled_value: 1000, updated_at: '2026-10-07T12:00:00.123456Z' };
const review = { updatedAt: original.updated_at };
const client = withReviewedSovSaves({ get: mocks.get, update: mocks.update, bulkUpdate: mocks.bulkUpdate } as unknown as EntityClient<'sov_items'>);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(original);
  mocks.rpc.mockResolvedValue({ data: { ...original, description: 'Deck installation' }, error: null });
});
it('saves against the exact revision the user reviewed, preserving timestamp precision', async () => {
  await client.update('sov-1', { description: 'Deck installation', scheduled_value: 1000 }, { sovItemReview: review });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('save_sov_item_reviewed', {
    p_id: 'sov-1', p_expected_updated_at: original.updated_at, p_patch: { description: 'Deck installation', scheduled_value: 1000 },
  });
  expect(mocks.update).not.toHaveBeenCalled();
});
it('does not substitute a newly fetched revision for the original review', async () => {
  mocks.get.mockResolvedValue({ ...original, scheduled_value: 1400, updated_at: '2026-10-07T12:01:00Z' });
  await expect(client.update('sov-1', { scheduled_value: 1000 }, { sovItemReview: review })).rejects.toThrow(/changed.*review/i);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('preserves the server conflict when approval commits after the preliminary read', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'SOV changed after review' } });
  await expect(client.update('sov-1', { scheduled_value: 1000 }, { sovItemReview: review })).rejects.toMatchObject({ code: '40001' });
  expect(mocks.update).not.toHaveBeenCalled();
});
it('requires a displayed revision rather than guessing one for an old caller', async () => {
  await expect(client.update('sov-1', { scheduled_value: 1000 })).rejects.toThrow(/review/i);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('refuses unreviewed bulk financial writes and cross-project transfers', async () => {
  await expect(client.bulkUpdate(['sov-1'], { scheduled_value: 1000 })).rejects.toThrow(/review/i);
  await expect(client.update('sov-1', { project_id: 'another-project' }, { sovItemReview: review })).rejects.toThrow(/project/i);
  expect(mocks.bulkUpdate).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('treats an empty selection as a no-op without reading or writing an SOV line', async () => {
  await expect(client.bulkUpdate([], { scheduled_value: 1000 })).resolves.toEqual([]);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.bulkUpdate).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
