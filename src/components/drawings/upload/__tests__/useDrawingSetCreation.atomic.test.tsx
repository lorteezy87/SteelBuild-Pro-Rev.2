// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { useDrawingSetCreation } from '../useDrawingSetCreation';
import { useUploadWizardState } from '../useUploadWizardState';
import { loadDrawingCommands, saveDrawingCommand } from '@/lib/drawingCommands/journal';
import { setActiveOrgId } from '@/lib/activeOrg';
import { createTestDrawingLocks, deferred, draftFixture, owner, resultFixture } from '@/lib/drawingCommands/__tests__/fixtures';

const m = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), legacy: vi.fn(), invalidate: vi.fn(), applyCommand: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: m.rpc, auth: { getUser: m.getUser, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }));
vi.mock('@/api/supabaseClient', () => ({ entities: { DrawingSet: { filter: m.legacy, create: m.legacy }, Drawing: { bulkCreate: m.legacy, create: m.legacy, update: m.legacy }, DrawingRevision: { bulkCreate: m.legacy } } }));
vi.mock('@/services/cacheRegistry', () => ({ invalidateEntities: m.invalidate }));
vi.mock('@/lib/autoScheduleDetailing', () => ({ autoCreateDetailingTasks: vi.fn() }));
vi.mock('@/services/auditLogger', () => ({ logActivity: vi.fn() }));
const flags = { contract_version: 1, new_set: true, revision: true, write_boundary: true, source_protection: true, receipt_lookup: true };
const source = draftFixture().payload.source_objects[0];
const otherSource = { path: source.path.replace('review.pdf', 'unselected.pdf'), token: 'c'.repeat(64) };
const sheet = { sheetNumber: 'S1', sheetTitle: 'Framing', revision: 'A', sourceFile: 'review.pdf', sourceFileUrl: source.path, sourceSnapshot: source, pdfPage: 2, reviewed: true, selected: true, extractedText: null as string | null, callouts: [] as unknown[] };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('navigator', { locks: createTestDrawingLocks() });
  setActiveOrgId(owner.orgId);
  m.getUser.mockResolvedValue({ data: { user: { id: owner.actorId } }, error: null });
  m.legacy.mockResolvedValue([]); m.invalidate.mockResolvedValue(undefined);
  m.applyCommand.mockImplementation(async (args: { p_request_id: string }) => ({ data: resultFixture(args.p_request_id), error: null }));
  m.rpc.mockImplementation(async (name: string, args: unknown) => name === 'get_drawing_command_capabilities' ? { data: flags, error: null }
    : name === 'get_drawing_command_receipt' ? { data: { state: 'not_committed' }, error: null } : m.applyCommand(args));
});
async function mount(verify = vi.fn().mockResolvedValue(true), pageCount: number | null = 3, sameName = false) {
  const onComplete = vi.fn();
  const hook = renderHook(() => {
    const state = useUploadWizardState({ onClose: vi.fn() });
    const creation = useDrawingSetCreation({ owner, meta: { setName: 'Reviewed set', revision: 'A', issueDate: '', notes: '' }, activeProject: { id: owner.projectId }, fileResults: [{ fileName: 'review.pdf', fileUrl: source.path, pageCount }, ...(sameName ? [{ fileName: 'review.pdf', fileUrl: otherSource.path, pageCount: 1 }] : [])], onComplete, qc: {}, state, sourceSnapshots: { ready: true, snapshots: [source, otherSource], verify } });
    return { state, ...creation };
  });
  await waitFor(() => expect(hook.result.current.command?.state ?? 'reviewing').toBe('reviewing'));
  return { ...hook, verify, onComplete };
}
it('lateRevisionFailureShowsZeroCommittedSheets', async () => {
  m.applyCommand.mockResolvedValue({ data: null, error: { code: '22023', message: 'DRAWING_REVISION_EXTRACTION: late revision failure' } });
  const hook = await mount();
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  expect(m.applyCommand).toHaveBeenCalledTimes(1);
  expect(hook.result.current.state.createdCount).toBe(0);
  expect(hook.result.current.command.state).toBe('rejected');
  expect(m.legacy).not.toHaveBeenCalled();
});
it('lostCreateResponseRecoversOneSet using the original saved payload after remount', async () => {
  m.applyCommand.mockRejectedValue(new Error('response lost'));
  const hook = await mount();
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  expect(m.applyCommand).toHaveBeenCalledTimes(1);
  expect(hook.result.current.state.createdCount).toBeNull();
  const [saved] = await loadDrawingCommands(owner);
  expect(saved.payload.issued_date).toBeNull();
  hook.unmount();
  m.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_capabilities' ? flags : { state: 'committed', result: resultFixture(saved.requestId) } }));
  const remount = await mount();
  await act(async () => { await remount.result.current.handleRecover(); });
  expect(remount.result.current.state.createdCount).toBe(1);
  expect(m.applyCommand).toHaveBeenCalledTimes(1);
  expect(await loadDrawingCommands(owner)).toEqual([]);
  expect(m.legacy).not.toHaveBeenCalled();
});
it('cancelAfterDispatchRemainsRecoverable', async () => {
  const reply = deferred<{ data: ReturnType<typeof resultFixture>; error: null }>();
  m.applyCommand.mockReturnValue(reply.promise);
  const hook = await mount(); let attempt!: Promise<unknown>;
  act(() => { attempt = hook.result.current.handleCreate([sheet]); });
  await waitFor(() => expect(m.applyCommand).toHaveBeenCalledTimes(1));
  const [saved] = await loadDrawingCommands(owner);
  act(() => hook.result.current.state.reset());
  await act(async () => { reply.resolve({ data: resultFixture(saved.requestId), error: null }); await attempt; });
  expect(hook.onComplete).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toHaveLength(1);
  expect(hook.result.current.state.step).toBe(0);
});
it('doesNotRunCrossSetWrites and rejects obsolete confirmed replacements visibly', async () => {
  const hook = await mount();
  await act(async () => { await hook.result.current.handleCreate([sheet], { supersedeIds: ['old-sheet'] }); });
  expect(m.applyCommand).not.toHaveBeenCalled();
  expect(m.legacy).not.toHaveBeenCalled();
  expect(hook.result.current.state.processError).toContain('Cross-set supersession is unavailable');
});
it('verifies the complete captured roster but sends only selected paths', async () => {
  const hook = await mount();
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  expect(hook.verify).toHaveBeenCalledWith([source.path, otherSource.path]);
  expect(m.applyCommand).toHaveBeenCalledTimes(1);
  expect(m.applyCommand.mock.calls[0][0].p_request).toMatchObject({ source_objects: [source], sheets: [{ extraction: { text: { state: 'unavailable' }, callouts: { state: 'harvested', value: [] } } }] });
  expect(m.legacy).not.toHaveBeenCalled();
});
it('cancel before prepare cannot revive when a new upload clears the cancel flag', async () => {
  const checked = deferred<boolean>();
  const hook = await mount(vi.fn().mockReturnValue(checked.promise));
  let attempt!: Promise<unknown>;
  act(() => { attempt = hook.result.current.handleCreate([sheet]); });
  await waitFor(() => expect(hook.verify).toHaveBeenCalledOnce());
  act(() => { hook.result.current.state.reset(); });
  act(() => { hook.result.current.state.cancelledRef.current = false; });
  await act(async () => { checked.resolve(true); await attempt; });
  expect(m.applyCommand).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([]);
});
it('double Create during source verification prepares and dispatches once', async () => {
  const checked = deferred<boolean>();
  const hook = await mount(vi.fn().mockReturnValue(checked.promise));
  let first!: Promise<unknown>;
  act(() => { first = hook.result.current.handleCreate([sheet]); });
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  expect(hook.verify).toHaveBeenCalledOnce();
  await act(async () => { checked.resolve(true); await first; });
  expect(m.applyCommand).toHaveBeenCalledTimes(1);
});
it.each(['metadata', 'source'])('editing %s during source verification invalidates the reviewed payload', async field => {
  const checked = deferred<boolean>();
  const hook = await mount(vi.fn().mockReturnValue(checked.promise));
  let attempt!: Promise<unknown>;
  act(() => { attempt = hook.result.current.handleCreate([sheet]); });
  act(() => {
    if (field === 'metadata') hook.result.current.state.setMeta((previous: Record<string, unknown>) => ({ ...previous, setName: 'Changed' }));
    else hook.result.current.state.setSheets([{ ...sheet, pdfPage: 3 }]);
  });
  await act(async () => { checked.resolve(true); await attempt; });
  expect(m.applyCommand).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([]);
});
it('unknown physical bounds hold manual recovery before prepare', async () => {
  const hook = await mount(undefined, null);
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  expect(m.applyCommand).not.toHaveBeenCalled();
  expect(hook.result.current.state.processError).toMatch(/in-range PDF page/);
});
it('changed original unselected source holds the entire reviewed intake', async () => {
  const hook = await mount(vi.fn().mockResolvedValue(false));
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  expect(m.applyCommand).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([]);
});
it('post-commit cache failure retains a committed receipt and never creates twice', async () => {
  m.invalidate.mockRejectedValue(new Error('cache unavailable'));
  const hook = await mount();
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  expect(hook.result.current.state.createdCount).toBe(1);
  expect(hook.result.current.command.state).toBe('committed');
  const [saved] = await loadDrawingCommands(owner);
  m.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_capabilities' ? flags : { state: 'committed', result: resultFixture(saved.requestId) } }));
  m.invalidate.mockResolvedValue(undefined);
  await act(async () => { await hook.result.current.handleRecover(); });
  expect(m.applyCommand).toHaveBeenCalledTimes(1);
  expect(await loadDrawingCommands(owner)).toEqual([]);
});
it('pending or failed receipt lookup cannot claim zero committed rows or dispatch again', async () => {
  m.applyCommand.mockRejectedValue(new Error('response lost'));
  const hook = await mount();
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  m.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_capabilities' ? flags : { state: 'pending' } }));
  await act(async () => { await hook.result.current.handleRecover(); });
  expect(hook.result.current.state.createdCount).toBeNull();
  m.rpc.mockRejectedValue(new Error('lookup failed'));
  await act(async () => { await hook.result.current.handleRecover(); });
  expect(hook.result.current.state.createdCount).toBeNull();
  expect(m.applyCommand).toHaveBeenCalledTimes(1);
});
it('a fully acknowledged commit allows a genuinely new reviewed set', async () => {
  const hook = await mount();
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  act(() => { hook.result.current.state.reset(); });
  await act(async () => { await hook.result.current.handleCreate([{ ...sheet, sheetNumber: 'S2' }]); });
  expect(m.applyCommand).toHaveBeenCalledTimes(2);
  expect(m.applyCommand.mock.calls[1][0].p_request_id).not.toBe(m.applyCommand.mock.calls[0][0].p_request_id);
});
it('discard receipt discovering a commit reports saved with Schedule hold and no replay', async () => {
  await saveDrawingCommand(draftFixture());
  m.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_capabilities' ? flags : { state: 'committed', result: resultFixture() } }));
  const hook = await mount();
  await act(async () => { await hook.result.current.handleDiscardSaved(); });
  expect(hook.result.current.state.step).toBe(5);
  expect(hook.result.current.state.createdCount).toBe(1);
  expect(hook.result.current.state.processError).toContain('Automatic schedule linking was not performed');
  expect(hook.onComplete).toHaveBeenCalledOnce();
  expect(m.applyCommand).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([]);
});
it('null owner has no capability or command RPC and cannot prepare', async () => {
  const hook = renderHook(() => {
    const state = useUploadWizardState({ onClose: vi.fn() });
    return useDrawingSetCreation({ owner: null, meta: {}, activeProject: { id: owner.projectId }, fileResults: [], onComplete: vi.fn(), qc: {}, state });
  });
  await act(async () => { await hook.result.current.handleCreate([sheet]); });
  expect(hook.result.current.available).toBe(false);
  expect(hook.result.current.command.state).toBe('unavailable');
  expect(m.rpc).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([]);
});
it('same filename uses each exact source path bounds and original token', async () => {
  const hook = await mount(undefined, 3, true);
  const otherSheet = { ...sheet, sheetNumber: 'S2', sourceFileUrl: otherSource.path, sourceSnapshot: otherSource };
  await act(async () => { await hook.result.current.handleCreate([otherSheet]); });
  expect(m.applyCommand).not.toHaveBeenCalled();
  await act(async () => { await hook.result.current.handleCreate([sheet, { ...otherSheet, pdfPage: 1 }]); });
  expect(m.applyCommand).toHaveBeenCalledOnce();
  expect(m.applyCommand.mock.calls[0][0].p_request).toMatchObject({ source_objects: [source, otherSource], sheets: [{ file_path: source.path, pdf_page: 2 }, { file_path: otherSource.path, pdf_page: 1 }] });
});
