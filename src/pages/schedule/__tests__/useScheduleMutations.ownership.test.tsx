// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ update: vi.fn(), error: vi.fn(), success: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { ScheduleTask: { update: mocks.update } } }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock('@/services/cacheRegistry', () => ({ getQueryKey: (_entity: string, project: string) => ['schedule-tasks', project], invalidateEntity: mocks.invalidate }));
vi.mock('@/services/auditLogger', () => ({ logActivity: vi.fn() }));
import { setActiveOrgId } from '@/lib/activeOrg';
import { useScheduleMutations, type UseScheduleMutationsParams } from '../useScheduleMutations';

const task = { id: 'task-a', task_name: 'Private A', status: 'Not Started', percent_complete: 0 };
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(['schedule-tasks', 'project-a'], [task]);
  const params = { projectId: 'project-a', qc, scheduleTasks: [task], enrichedTasks: [task], tasksWithEffective: [], selectedIds: new Set(), setShowDrawer: vi.fn(), setSelectedTask: vi.fn() } as unknown as UseScheduleMutationsParams;
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, ...renderHook(({ projectId }) => useScheduleMutations({ ...params, projectId }), { wrapper, initialProps: { projectId: 'project-a' } }) };
}
beforeEach(() => { vi.clearAllMocks(); setActiveOrgId('org-a'); });

it('does not restore a failed old task snapshot or toast after account clearing and re-entry', async () => {
  let reject!: (error: Error) => void;
  mocks.update.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const { result, qc } = setup();
  act(() => result.current.updateTaskMut.mutate({ ...task, task_name: 'Changed' }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
  act(() => { setActiveOrgId(null); qc.clear(); setActiveOrgId('org-a'); });
  await act(async () => reject(new Error('Denied')));
  expect(qc.getQueryData(['schedule-tasks', 'project-a'])).toBeUndefined();
  expect(mocks.error).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});

it('keeps legitimate rollback for the current owner', async () => {
  mocks.update.mockRejectedValueOnce(new Error('Denied'));
  const { result, qc } = setup();
  act(() => result.current.updateTaskMut.mutate({ ...task, task_name: 'Changed' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  expect(qc.getQueryData(['schedule-tasks', 'project-a'])).toEqual([task]);
});

it('a visible Undo captured in project A cannot write after navigating to project B', async () => {
  mocks.update.mockResolvedValue(task);
  const { result, rerender } = setup();
  act(() => result.current.updateTaskMut.mutate({ ...task, task_name: 'Changed' }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());
  const undo = mocks.success.mock.calls[0][1].action.onClick;
  rerender({ projectId: 'project-b' });
  await act(async () => undo());
  expect(mocks.update).toHaveBeenCalledOnce();
});

it('valid current-owner Undo restores the original columns', async () => {
  mocks.update.mockResolvedValue(task);
  const { result } = setup();
  act(() => result.current.updateTaskMut.mutate({ ...task, task_name: 'Changed' }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());
  await act(async () => mocks.success.mock.calls[0][1].action.onClick());
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(mocks.update.mock.calls[1][1].task_name).toBe('Private A');
});
