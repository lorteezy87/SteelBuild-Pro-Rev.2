import { beforeEach, describe, expect, it, vi } from 'vitest';
const update = vi.hoisted(() => vi.fn());
vi.mock('@/api/supabaseClient', () => ({ entities: { Drawing: { update } } }));
import { deleteRegisterSheet } from '../drawingRegisterDeletion';
beforeEach(() => vi.clearAllMocks());
describe('recoverable register deletion', () => {
 it('soft deletes a current-project sheet without touching revisions or storage', async () => {
  update.mockResolvedValue({ id: 'd1', is_deleted: true });
  await deleteRegisterSheet({ id: 'd1', project_id: 'p1' }, 'p1');
  expect(update).toHaveBeenCalledWith('d1', { is_deleted: true, deleted_at: expect.any(String) });
 });
 it('rejects foreign and missing-project records before mutation', async () => {
  await expect(deleteRegisterSheet({ id: 'd1', project_id: 'other' }, 'p1')).rejects.toThrow('project');
  await expect(deleteRegisterSheet({ id: 'd1', project_id: 'p1' }, null)).rejects.toThrow('project');
  expect(update).not.toHaveBeenCalled();
 });
 it('propagates denied, locked and zero-row errors instead of reporting deletion', async () => {
  update.mockRejectedValue(new Error('No authorized row returned'));
  await expect(deleteRegisterSheet({ id: 'd1', project_id: 'p1' }, 'p1')).rejects.toThrow('No authorized row');
 });
});
