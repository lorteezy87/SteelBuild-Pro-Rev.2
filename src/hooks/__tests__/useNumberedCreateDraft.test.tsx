// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { setActiveOrgId } from '@/lib/activeOrg';
import { useNumberedCreateDraft } from '../useNumberedCreateDraft';

beforeEach(() => { setActiveOrgId(null); setActiveOrgId('org-a'); });
const payload = { project_id: 'p1', title: 'Original steel', metadata: { value: 100 } };

it('retains the exact original payload and identity across unknown results and later edits', async () => {
  const { result } = renderHook(() => useNumberedCreateDraft('p1', true, 'test-draft'));
  const create = vi.fn().mockRejectedValueOnce({ outcomeUnknown: true }).mockResolvedValue({ id: 'original' });
  await act(async () => { await expect(result.current.save(payload, create)).rejects.toMatchObject({ outcomeUnknown: true }); });
  expect(result.current.recoveryPending).toBe(true);
  await act(async () => { await result.current.save({ ...payload, title: 'Changed', metadata: { value: 900 } }, create); });
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  expect(create.mock.calls[0][1].clientOperationId).toMatch(/^[0-9a-f-]{36}$/i);
});

it('permits correcting a definite rejection and gives a reopened draft a fresh identity', async () => {
  const { result, rerender } = renderHook(({ open }) => useNumberedCreateDraft('p1', open, 'test-draft'), { initialProps: { open: true } });
  const create = vi.fn().mockRejectedValueOnce({ outcomeUnknown: false }).mockResolvedValue({ id: 'saved' });
  await expect(result.current.save(payload, create)).rejects.toBeTruthy();
  await result.current.save({ ...payload, title: 'Corrected' }, create);
  expect(create.mock.calls[1][0].title).toBe('Corrected');
  expect(create.mock.calls[1][1]).toEqual(create.mock.calls[0][1]);
  rerender({ open: false }); rerender({ open: true });
  await result.current.save(payload, create);
  expect(create.mock.calls[2][1]).not.toEqual(create.mock.calls[0][1]);
});

it('rejects a stale callback after a project or workspace switch', async () => {
  const { result, rerender } = renderHook(({ project }) => useNumberedCreateDraft(project, true, 'test-draft'), { initialProps: { project: 'p1' } });
  const create = vi.fn(); const save = result.current.save;
  rerender({ project: 'p2' });
  await expect(save(payload, create)).rejects.toThrow(/project changed/i);
  await expect(result.current.save({ ...payload, project_id: 'p2' }, create)).rejects.toThrow(/project changed/i);
  rerender({ project: 'p1' });
  await expect(save(payload, create)).rejects.toThrow(/project changed/i);
  act(() => setActiveOrgId('org-b'));
  act(() => setActiveOrgId('org-a'));
  await expect(save(payload, create)).rejects.toThrow(/Workspace/i);
  expect(create).not.toHaveBeenCalled();
});

it('blocks duplicate clicks and prevents a late completion from closing a newer draft', async () => {
  const { result, rerender } = renderHook(({ open }) => useNumberedCreateDraft('p1', open, 'test-draft'), { initialProps: { open: true } });
  let resolve!: (value: { id: string }) => void;
  const create = vi.fn().mockImplementation(() => new Promise<{ id: string }>(done => { resolve = done; }));
  const pending = result.current.save(payload, create);
  await expect(result.current.save(payload, create)).rejects.toThrow(/Wait/);
  rerender({ open: false }); rerender({ open: true });
  resolve({ id: 'saved-in-old-draft' });
  await expect(pending).rejects.toThrow(/previous project/);
  expect(create).toHaveBeenCalledTimes(1);
});

it('prevents follow-up writes after the owning modal unmounts', async () => {
  const { result, unmount } = renderHook(() => useNumberedCreateDraft('p1', true, 'test-draft'));
  let resolve!: (value: { id: string }) => void;
  const create = vi.fn().mockImplementation(() => new Promise<{ id: string }>(done => { resolve = done; }));
  const savedCallback = result.current.save;
  const pending = savedCallback(payload, create);
  unmount();
  resolve({ id: 'saved' });
  await expect(pending).rejects.toThrow(/previous project/);
  await expect(savedCallback(payload, create)).rejects.toThrow(/project changed/);
  expect(create).toHaveBeenCalledTimes(1);
  const reopened = renderHook(() => useNumberedCreateDraft('p1', true, 'test-draft'));
  expect(reopened.result.current.recoveryPending).toBe(true);
  create.mockResolvedValue({ id: 'saved' });
  await reopened.result.current.save({ project_id: 'p1', title: 'New blank editor' }, create);
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
});

it('retains an unknown create after closing and reopening with a visible recovery state', async () => {
  const { result, rerender } = renderHook(({ open }) => useNumberedCreateDraft('p1', open, 'retained-draft'), { initialProps: { open: true } });
  const create = vi.fn().mockRejectedValueOnce({ outcomeUnknown: true }).mockResolvedValue({ id: 'original' });
  await act(async () => { await expect(result.current.save(payload, create)).rejects.toBeTruthy(); });
  const oldSave = result.current.save;
  rerender({ open: false }); rerender({ open: true });
  expect(result.current.recoveryPending).toBe(true);
  await expect(oldSave(payload, create)).rejects.toThrow(/project changed/);
  await result.current.save({ ...payload, title: 'Seemingly new draft' }, create);
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
});

it('reserves an in-flight create before unmount so its replacement replays the same operation', async () => {
  const first = renderHook(() => useNumberedCreateDraft('p1', true, 'pending-modal'));
  let resolve!: (value: { id: string }) => void;
  const create = vi.fn().mockImplementationOnce(() => new Promise<{ id: string }>(done => { resolve = done; }))
    .mockResolvedValue({ id: 'saved' });
  const pending = first.result.current.save(payload, create);
  first.unmount();
  const reopened = renderHook(() => useNumberedCreateDraft('p1', true, 'pending-modal'));
  expect(reopened.result.current.recoveryPending).toBe(true);
  await reopened.result.current.save({ project_id: 'p1', title: 'Different editor' }, create);
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  resolve({ id: 'saved' });
  await expect(pending).rejects.toMatchObject({ outcomeUnknown: true });
  reopened.unmount();
  const completed = renderHook(() => useNumberedCreateDraft('p1', true, 'pending-modal'));
  expect(completed.result.current.recoveryPending).toBe(false);
});

it('keeps a remounted retry reserved when the older request definitely rejects', async () => {
  const first = renderHook(() => useNumberedCreateDraft('p1', true, 'pending-retry'));
  let rejectOriginal!: (error: unknown) => void;
  let resolveRetry!: (value: { id: string }) => void;
  const create = vi.fn()
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOriginal = reject; }))
    .mockImplementationOnce(() => new Promise<{ id: string }>(resolve => { resolveRetry = resolve; }));
  const original = first.result.current.save(payload, create).catch(error => error);
  first.unmount();
  const replacement = renderHook(() => useNumberedCreateDraft('p1', true, 'pending-retry'));
  const retry = replacement.result.current.save(payload, create).catch(error => error);
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  await act(async () => { rejectOriginal({ outcomeUnknown: false, code: '55P03' }); await original; });
  replacement.unmount();
  const reopened = renderHook(() => useNumberedCreateDraft('p1', true, 'pending-retry'));
  expect(reopened.result.current.recoveryPending).toBe(true);
  resolveRetry({ id: 'saved-by-retry' });
  await retry;
});

it('does not send a second preopened draft when another operation owns its recovery slot', async () => {
  const first = renderHook(() => useNumberedCreateDraft('p1', true, 'concurrent-drafts'));
  const second = renderHook(() => useNumberedCreateDraft('p1', true, 'concurrent-drafts'));
  const create = vi.fn().mockRejectedValueOnce({ outcomeUnknown: true }).mockResolvedValue({ id: 'other' });
  await act(async () => { await expect(first.result.current.save(payload, create)).rejects.toBeTruthy(); });
  await expect(second.result.current.save({ ...payload, title: 'Different record' }, create)).rejects.toThrow(/recover|another draft/i);
  expect(create).toHaveBeenCalledTimes(1);
});

it('keeps an earlier unknown operation quarantined when its next retry has a definite rejection', async () => {
  const first = renderHook(() => useNumberedCreateDraft('p1', true, 'retry-modal'));
  const create = vi.fn().mockRejectedValueOnce({ outcomeUnknown: true }).mockRejectedValueOnce({ outcomeUnknown: false })
    .mockResolvedValue({ id: 'saved' });
  await act(async () => { await expect(first.result.current.save(payload, create)).rejects.toBeTruthy(); });
  await expect(first.result.current.save(payload, create)).rejects.toBeTruthy();
  first.unmount();
  const reopened = renderHook(() => useNumberedCreateDraft('p1', true, 'retry-modal'));
  expect(reopened.result.current.recoveryPending).toBe(true);
  await reopened.result.current.save({ project_id: 'p1', title: 'New input' }, create);
  expect(create.mock.calls[2]).toEqual(create.mock.calls[0]);
});

it('retains unknown payloads across modal unmounts without sharing them across callers or workspaces', async () => {
  const first = renderHook(() => useNumberedCreateDraft('p1', true, 'retained-modal'));
  const create = vi.fn().mockRejectedValueOnce({ outcomeUnknown: true }).mockResolvedValue({ id: 'original' });
  await act(async () => { await expect(first.result.current.save(payload, create)).rejects.toBeTruthy(); });
  first.unmount();
  const other = renderHook(() => useNumberedCreateDraft('p1', true, 'different-modal'));
  expect(other.result.current.recoveryPending).toBe(false); other.unmount();
  const reopened = renderHook(() => useNumberedCreateDraft('p1', true, 'retained-modal'));
  expect(reopened.result.current.recoveryPending).toBe(true);
  await reopened.result.current.save({ project_id: 'p1', title: '' }, create);
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  reopened.unmount();
  const completed = renderHook(() => useNumberedCreateDraft('p1', true, 'retained-modal'));
  expect(completed.result.current.recoveryPending).toBe(false); completed.unmount();
  const uncertain = renderHook(() => useNumberedCreateDraft('p1', true, 'private-modal'));
  await act(async () => { await expect(uncertain.result.current.save(payload, vi.fn().mockRejectedValue({ outcomeUnknown: true }))).rejects.toBeTruthy(); });
  uncertain.unmount();
  act(() => { setActiveOrgId(null); setActiveOrgId('org-a'); });
  const replacedAccount = renderHook(() => useNumberedCreateDraft('p1', true, 'private-modal'));
  expect(replacedAccount.result.current.recoveryPending).toBe(false);
});
