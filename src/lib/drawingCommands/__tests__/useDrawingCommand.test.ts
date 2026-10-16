// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { useDrawingCommand } from '../useDrawingCommand';
import { completeDrawingCommand, loadDrawingCommands, saveDrawingCommand } from '../journal';
import { setActiveOrgId } from '@/lib/activeOrg';
import { createTestDrawingLocks, deferred, draftFixture, nextId, owner, resultFixture } from './fixtures';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { DrawingCommandOutcome } from '../types';

const { rpc, getUser, onAuthStateChange } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, auth: { getUser, onAuthStateChange } } }));
const flags = { contract_version: 1, new_set: true, revision: true, write_boundary: true, source_protection: true, receipt_lookup: true };
let authChanged: (event: AuthChangeEvent, session: Session | null) => void;
beforeEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('navigator', { locks: createTestDrawingLocks() });
  setActiveOrgId(owner.orgId);
  getUser.mockResolvedValue({ data: { user: { id: owner.actorId } }, error: null });
  onAuthStateChange.mockImplementation((callback: typeof authChanged) => { authChanged = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_receipt'
    ? { state: 'not_committed' } : name === 'get_drawing_command_capabilities' ? flags : resultFixture() }));
});
async function ready() {
  const hook = renderHook(() => useDrawingCommand(owner));
  await waitFor(() => expect(hook.result.current.state).toBe('reviewing'));
  return hook;
}

it('persistsBeforeFirstRpc and acknowledges only after durable preparation', async () => {
  const hook = await ready();
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (...args: unknown[]) => {
    expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
    return original(...args);
  });
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  expect(rpc).not.toHaveBeenCalled();
  await act(async () => { await hook.result.current.apply(); });
  expect(hook.result.current.state).toBe('committed');
  expect(await loadDrawingCommands(owner)).toEqual([]);
});

it.each(['remount', 'unavailable'] as const)('dismissSavedReview abandons %s review only after exact receipt lookup without mutation', async mode => {
  await saveDrawingCommand(draftFixture());
  const hook = await ready();
  if (mode === 'unavailable') {
    rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_receipt' ? { state: 'not_committed' } : { ...flags, new_set: false } }));
    await act(async () => { await expect(hook.result.current.apply()).rejects.toThrow(); });
  }
  rpc.mockClear();
  await act(async () => { expect(await hook.result.current.dismissSavedReview()).toBe(true); });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(['get_drawing_command_receipt']);
  expect(await loadDrawingCommands(owner)).toEqual([]);
  expect(hook.result.current.draft).toBeNull();
});

it.each(['pending', 'lookup-error', 'revoked', 'committed'] as const)('dismissSavedReview safely handles %s without replay', async receiptState => {
  await saveDrawingCommand(draftFixture());
  const onCommitted = vi.fn();
  const hook = renderHook(() => useDrawingCommand(owner, { onCommitted }));
  await waitFor(() => expect(hook.result.current.draft).not.toBeNull());
  if (receiptState === 'revoked') getUser.mockResolvedValue({ data: { user: null }, error: { message: 'revoked' } });
  else if (receiptState === 'lookup-error') rpc.mockRejectedValue(new Error('lookup unavailable'));
  else rpc.mockResolvedValue({ error: null, data: receiptState === 'committed' ? { state: 'committed', result: resultFixture() } : { state: 'pending' } });
  await act(async () => {
    if (receiptState === 'revoked' || receiptState === 'lookup-error') await expect(hook.result.current.dismissSavedReview()).rejects.toThrow();
    else expect(await hook.result.current.dismissSavedReview()).toBe(false);
  });
  expect(rpc.mock.calls.every(([name]) => name === 'get_drawing_command_receipt')).toBe(true);
  expect(await loadDrawingCommands(owner)).toEqual(receiptState === 'committed' ? [] : [draftFixture()]);
  expect(onCommitted).toHaveBeenCalledTimes(receiptState === 'committed' ? 1 : 0);
});

it('dismissSavedReview cannot remove a newer exact reservation', async () => {
  await saveDrawingCommand(draftFixture());
  const hook = await ready();
  await completeDrawingCommand(owner, draftFixture().requestId);
  await saveDrawingCommand(draftFixture(nextId));
  await act(async () => { await expect(hook.result.current.dismissSavedReview()).rejects.toThrow(); });
  expect(rpc).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture(nextId)]);
});

it('storageQuotaRefusesDispatch', async () => {
  const hook = await ready();
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => { throw new DOMException('Quota', 'QuotaExceededError'); });
  await act(async () => { await expect(hook.result.current.prepare(draftFixture())).rejects.toThrow(); });
  expect(hook.result.current.state).toBe('unavailable');
  await act(async () => { await expect(hook.result.current.apply()).rejects.toThrow(); });
  expect(rpc).not.toHaveBeenCalled();
});

it('successful add followed by commit abort refuses dispatch', async () => {
  const hook = await ready();
  const add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(function (this: IDBObjectStore, ...args: Parameters<typeof add>) {
    const request = add.apply(this, args);
    request.onsuccess = () => this.transaction.abort();
    return request;
  });
  await act(async () => { await expect(hook.result.current.prepare(draftFixture())).rejects.toThrow(); });
  await act(async () => { await expect(hook.result.current.apply()).rejects.toThrow(); });
  expect(rpc).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([]);
});

it.each(['capabilities', 'final-auth'] as const)('workspaceSwitchInvalidatesActiveAttempt during %s before mutation', async (boundary) => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  const blocked = deferred<{ data: unknown; error: null }>();
  if (boundary === 'capabilities') rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_receipt'
    ? { data: { state: 'not_committed' }, error: null } : blocked.promise);
  else {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'get_drawing_command_capabilities') {
        getUser.mockImplementation(() => blocked.promise);
        return { data: flags, error: null };
      }
      return { data: { state: 'not_committed' }, error: null };
    });
  }
  let attempt!: Promise<unknown>;
  act(() => { attempt = hook.result.current.apply().catch((error: unknown) => error); });
  await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_drawing_command_capabilities', { p_project_id: owner.projectId }));
  if (boundary === 'final-auth') await waitFor(() => expect(getUser.mock.results.at(-1)?.value).toBe(blocked.promise));
  act(() => { setActiveOrgId(nextId); setActiveOrgId(owner.orgId); });
  await act(async () => { blocked.resolve({ data: boundary === 'capabilities' ? flags : { user: { id: owner.actorId } }, error: null }); await attempt; });
  expect(rpc.mock.calls.some(([name]) => name === 'create_drawing_set_from_review')).toBe(false);
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
});

it('already dispatched may commit after cancellation, preserving the journal for remount acknowledgement', async () => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  const reply = deferred<{ data: unknown; error: null }>();
  rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_receipt' ? { data: { state: 'not_committed' }, error: null }
    : name === 'get_drawing_command_capabilities' ? { data: flags, error: null } : reply.promise);
  let attempt!: Promise<DrawingCommandOutcome>;
  act(() => { attempt = hook.result.current.apply(); });
  await waitFor(() => expect(rpc.mock.calls.some(([name]) => name === 'create_drawing_set_from_review')).toBe(true));
  hook.unmount();
  reply.resolve({ data: resultFixture(), error: null });
  expect(await attempt).toMatchObject({ kind: 'committed' });
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  rpc.mockResolvedValue({ data: { state: 'committed', result: resultFixture() }, error: null });
  const remount = await ready();
  const callsBefore = rpc.mock.calls.length;
  expect(remount.result.current.draft).toEqual(draftFixture());
  expect(rpc).toHaveBeenCalledTimes(callsBefore);
  await act(async () => { await remount.result.current.reconcile(); });
  expect(remount.result.current.state).toBe('committed');
  expect(await loadDrawingCommands(owner)).toEqual([]);
});

it('lateOldReplyCannotDeleteNewDraft from another tab', async () => {
  const followUp = deferred<void>();
  const onCommitted = vi.fn(() => followUp.promise);
  const hook = renderHook(() => useDrawingCommand(owner, { onCommitted }));
  await waitFor(() => expect(hook.result.current.state).toBe('reviewing'));
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  let attempt!: Promise<DrawingCommandOutcome>;
  act(() => { attempt = hook.result.current.apply(); });
  await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
  await completeDrawingCommand(owner, draftFixture().requestId); // Another tab acknowledged this exact request.
  const newerDraft = draftFixture(nextId);
  await saveDrawingCommand(newerDraft);
  await act(async () => { followUp.resolve(undefined); await attempt; });
  expect(await loadDrawingCommands(owner)).toContainEqual(newerDraft);
});

it.each(['capabilities', 'final-auth'] as const)('another tab dismissing during %s prevents old first dispatch', async (boundary) => {
  const oldTab = await ready();
  await act(async () => { await oldTab.result.current.prepare(draftFixture()); });
  const otherTab = await ready(); // Separate journal connections, same IDB factory and origin lock manager.
  rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_receipt' ? { data: { state: 'not_committed' }, error: null }
    : name === 'get_drawing_command_capabilities' ? { data: flags, error: null }
      : { data: null, error: { code: '40001', message: 'DRAWING_REVISION_STALE: changed' } });
  await act(async () => { await otherTab.result.current.apply(); });
  expect(otherTab.result.current.state).toBe('rejected');
  rpc.mockClear();
  const paused = deferred<{ data: unknown; error: null }>();
  rpc.mockImplementation(async (name: string) => {
    if (name === 'get_drawing_command_receipt') return { data: { state: 'not_committed' }, error: null };
    if (name === 'get_drawing_command_capabilities') {
      if (boundary === 'capabilities') return paused.promise;
      getUser.mockImplementationOnce(() => paused.promise);
      return { data: flags, error: null };
    }
    return { data: resultFixture(), error: null };
  });
  let attempt!: Promise<unknown>;
  act(() => { attempt = oldTab.result.current.apply().catch((error: unknown) => error); });
  await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_drawing_command_capabilities', { p_project_id: owner.projectId }));
  if (boundary === 'final-auth') await waitFor(() => expect(getUser.mock.results.some(({ value }) => value === paused.promise)).toBe(true));
  await act(async () => {
    expect(await otherTab.result.current.dismissSavedReview()).toBe(true);
    await otherTab.result.current.prepare(draftFixture(nextId));
  });
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture(nextId)]);
  await act(async () => {
    paused.resolve({ data: boundary === 'capabilities' ? flags : { user: { id: owner.actorId } }, error: null });
    await attempt;
  });
  expect(rpc.mock.calls.some(([name]) => name === 'create_drawing_set_from_review')).toBe(false);
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture(nextId)]);
});

it('an already dispatched command holds its reservation against exact completion in another tab', async () => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  const reply = deferred<{ data: unknown; error: null }>();
  rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_receipt' ? { data: { state: 'not_committed' }, error: null }
    : name === 'get_drawing_command_capabilities' ? { data: flags, error: null } : reply.promise);
  let attempt!: Promise<DrawingCommandOutcome>;
  act(() => { attempt = hook.result.current.apply(); });
  await waitFor(() => expect(rpc.mock.calls.some(([name]) => name === 'create_drawing_set_from_review')).toBe(true));
  let completed = false;
  const completion = completeDrawingCommand(owner, draftFixture().requestId).then(() => { completed = true; });
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  expect(completed).toBe(false);
  await act(async () => { reply.resolve({ data: resultFixture(), error: null }); await attempt; await completion; });
  expect(completed).toBe(true);
  expect(await loadDrawingCommands(owner)).toEqual([]);
});

it('retry after cache/schedule failure acknowledges same receipt without another write', async () => {
  const onCommitted = vi.fn().mockRejectedValueOnce(new Error('schedule unavailable')).mockResolvedValue(undefined);
  const hook = renderHook(() => useDrawingCommand(owner, { onCommitted }));
  await waitFor(() => expect(hook.result.current.state).toBe('reviewing'));
  await act(async () => { await hook.result.current.prepare(draftFixture()); await hook.result.current.apply(); });
  expect(hook.result.current.state).toBe('committed');
  expect(hook.result.current.error?.code).toBe('acknowledgement_failed');
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  rpc.mockResolvedValue({ data: { state: 'committed', result: resultFixture() }, error: null });
  await act(async () => { await hook.result.current.reconcile(); });
  expect(onCommitted).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls.filter(([name]) => name === 'create_drawing_set_from_review')).toHaveLength(1);
  expect(await loadDrawingCommands(owner)).toEqual([]);
});

it('sign-out invalidates active work and sign-in never auto replays', async () => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  act(() => { authChanged('SIGNED_OUT', null); });
  await act(async () => { await expect(hook.result.current.apply()).rejects.toThrow(); });
  expect(rpc).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  act(() => { authChanged('SIGNED_IN', { user: { id: owner.actorId } } as Session); });
  await waitFor(() => expect(hook.result.current.state).toBe('reviewing'));
  expect(rpc).not.toHaveBeenCalled();
});

it('retains rejected drafts and dismissRejected requires exact not_committed receipt', async () => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_receipt' ? { data: { state: 'not_committed' }, error: null }
    : name === 'get_drawing_command_capabilities' ? { data: flags, error: null }
      : { data: null, error: { code: '55P03', message: 'DRAWING_REVISION_BUSY: locked' } });
  await act(async () => { await hook.result.current.apply(); });
  expect(hook.result.current.state).toBe('rejected');
  await act(async () => { await expect(hook.result.current.prepare(draftFixture(nextId))).rejects.toThrow(); });
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  rpc.mockResolvedValue({ data: { state: 'pending' }, error: null });
  await act(async () => { expect(await hook.result.current.dismissRejected()).toBe(false); });
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  rpc.mockResolvedValue({ data: { state: 'not_committed' }, error: null });
  await act(async () => { expect(await hook.result.current.dismissRejected()).toBe(true); await hook.result.current.prepare(draftFixture(nextId)); });
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture(nextId)]);
});

it('stale tab cannot retry a dismissed request over a newer durable reservation', async () => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  await completeDrawingCommand(owner, draftFixture().requestId);
  await saveDrawingCommand(draftFixture(nextId));
  await act(async () => { await expect(hook.result.current.apply()).rejects.toThrow(); });
  expect(rpc).not.toHaveBeenCalled();
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture(nextId)]);
});

it.each(['committed', 'revoked', 'lookup-error'] as const)('dismissRejected does not falsely abandon %s receipt', async (receiptState) => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  rpc.mockImplementation(async (name: string) => name === 'get_drawing_command_receipt' ? { data: { state: 'not_committed' }, error: null }
    : name === 'get_drawing_command_capabilities' ? { data: flags, error: null }
      : { data: null, error: { code: '40001', message: 'DRAWING_REVISION_STALE: changed' } });
  await act(async () => { await hook.result.current.apply(); });
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  if (receiptState === 'committed') {
    rpc.mockResolvedValue({ data: { state: 'committed', result: resultFixture() }, error: null });
    await act(async () => { expect(await hook.result.current.dismissRejected()).toBe(false); });
    expect(hook.result.current.state).toBe('committed');
    expect(await loadDrawingCommands(owner)).toEqual([]);
  } else {
    if (receiptState === 'revoked') getUser.mockResolvedValue({ data: { user: null }, error: { message: 'revoked' } });
    else rpc.mockRejectedValue(new Error('lookup failed'));
    await act(async () => { await expect(hook.result.current.dismissRejected()).rejects.toThrow(); });
    expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  }
});

it('identity mismatch cannot read or dispatch another actor’s retained project text', async () => {
  await saveDrawingCommand(draftFixture());
  getUser.mockResolvedValue({ data: { user: { id: nextId } }, error: null });
  const hook = renderHook(() => useDrawingCommand(owner));
  await waitFor(() => expect(hook.result.current.error?.code).toBe('recovery_unavailable'));
  expect(hook.result.current.draft).toBeNull();
  await act(async () => { await expect(hook.result.current.apply()).rejects.toThrow(); });
  expect(rpc).not.toHaveBeenCalled();
});

it('double-click apply does not create a second active attempt', async () => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  await act(async () => {
    const first = hook.result.current.apply();
    await expect(hook.result.current.apply()).rejects.toMatchObject({ code: 'unavailable' });
    await first;
  });
  expect(rpc.mock.calls.filter(([name]) => name === 'create_drawing_set_from_review')).toHaveLength(1);
});

it('unavailable preflight retains the draft and permits explicit receipt retry when readiness returns', async () => {
  const hook = await ready();
  await act(async () => { await hook.result.current.prepare(draftFixture()); });
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_receipt'
    ? { state: 'not_committed' } : { ...flags, new_set: false } }));
  await act(async () => { await expect(hook.result.current.apply()).rejects.toMatchObject({ dispatched: false, code: 'unavailable' }); });
  expect(hook.result.current.state).toBe('unavailable');
  expect(await loadDrawingCommands(owner)).toEqual([draftFixture()]);
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'get_drawing_command_receipt'
    ? { state: 'not_committed' } : name === 'get_drawing_command_capabilities' ? flags : resultFixture() }));
  await act(async () => { await hook.result.current.reconcile(); });
  expect(hook.result.current.state).toBe('committed');
});
