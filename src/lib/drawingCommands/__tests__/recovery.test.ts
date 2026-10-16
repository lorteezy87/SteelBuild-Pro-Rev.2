import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { reconcileDrawingCommand } from '../recovery';
import { loadDrawingCommands, saveDrawingCommand } from '../journal';
import { createTestDrawingLocks, draftFixture, owner, resultFixture } from './fixtures';

const { rpc, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, auth: { getUser } } }));
const flags = { contract_version: 1, new_set: true, revision: true, write_boundary: true, source_protection: true, receipt_lookup: true };
beforeEach(async () => {
  vi.resetAllMocks(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('navigator', { locks: createTestDrawingLocks() });
  getUser.mockResolvedValue({ data: { user: { id: owner.actorId } }, error: null });
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_receipt'
    ? { state: 'not_committed' } : name === 'get_drawing_command_capabilities' ? flags : resultFixture() }));
  await saveDrawingCommand(draftFixture());
});

it('reloadReusesExactKeyAndPayload only after not_committed receipt', async () => {
  const [draft] = await loadDrawingCommands(owner);
  expect(await reconcileDrawingCommand(draft)).toEqual({ kind: 'committed', result: resultFixture() });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(['get_drawing_command_receipt', 'get_drawing_command_capabilities', 'create_drawing_set_from_review']);
  expect(rpc).toHaveBeenLastCalledWith('create_drawing_set_from_review', { p_request_id: draft.requestId, p_request: draft.payload });
});

it('pending lookup never replays', async () => {
  rpc.mockResolvedValue({ data: { state: 'pending' }, error: null });
  expect(await reconcileDrawingCommand(draftFixture())).toMatchObject({ kind: 'uncertain', error: { code: 'receipt_pending' } });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
});

it('committed lookup recovers acknowledgement without command replay', async () => {
  rpc.mockResolvedValue({ data: { state: 'committed', result: resultFixture() }, error: null });
  expect(await reconcileDrawingCommand(draftFixture())).toEqual({ kind: 'committed', result: resultFixture() });
  expect(rpc).toHaveBeenCalledTimes(1);
});

it.each([{ code: '42501', message: 'revoked' }, { code: 'network', message: 'lost lookup' }])('lookup failure never becomes not_committed: %j', async (error) => {
  rpc.mockResolvedValue({ data: null, error });
  await expect(reconcileDrawingCommand(draftFixture())).rejects.toThrow();
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
});

it('revokedUserCannotReplay', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: { message: 'revoked' } });
  await expect(reconcileDrawingCommand(draftFixture())).rejects.toMatchObject({ code: 'identity_changed', dispatched: false });
  expect(rpc).not.toHaveBeenCalled();
});

it.each(['missing', 'failed'])('%s lock availability refuses a previously saved replay before mutation', async (failure) => {
  vi.stubGlobal('navigator', failure === 'missing' ? {} : { locks: { request: vi.fn().mockRejectedValue(new Error('unusable')) } });
  await expect(reconcileDrawingCommand(draftFixture())).rejects.toMatchObject({ dispatched: false, code: 'unavailable' });
  expect(rpc.mock.calls.filter(([name]) => name === 'create_drawing_set_from_review')).toHaveLength(0);
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
});

it('permission revocation after not_committed lookup prevents replay Auth preflight', async () => {
  rpc.mockImplementation(async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'revoked' } });
    return { data: { state: 'not_committed' }, error: null };
  });
  await expect(reconcileDrawingCommand(draftFixture())).rejects.toMatchObject({ code: 'identity_changed', dispatched: false });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(['get_drawing_command_receipt']);
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
});

it.each([
  [{ code: '40001', message: 'DRAWING_REVISION_STALE: changed' }, 'rejected'],
  [{ code: '55P03', message: 'DRAWING_REVISION_BUSY: locked' }, 'rejected'],
  [{ message: 'dropped response' }, 'uncertain'],
] as const)('definite rejection versus dropped response retains the reservation: %j', async (error, kind) => {
  rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_receipt' ? { data: { state: 'not_committed' }, error: null }
    : name === 'get_drawing_command_capabilities' ? { data: flags, error: null } : { data: null, error });
  expect(await reconcileDrawingCommand(draftFixture())).toMatchObject({ kind });
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
});
