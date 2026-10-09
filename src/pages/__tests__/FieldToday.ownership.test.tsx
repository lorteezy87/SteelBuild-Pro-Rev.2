// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ project: 'project-a', get: vi.fn(), update: vi.fn(), error: vi.fn(), message: vi.fn(), enqueue: vi.fn(), flush: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/shared/ProjectContext', () => ({ useProjectContext: () => ({ activeProject: { name: 'A' } }) }));
vi.mock('@/hooks/useProjectId', () => ({ useProjectId: () => mocks.project }));
vi.mock('@/hooks/useScheduleTasks', () => ({ useScheduleTasks: () => ({ scheduleTasks: [], isPending: false, refetch: vi.fn() }) }));
vi.mock('@/lib/field/OutboxContext', () => ({ useOutbox: () => ({ pending: 0, enqueue: mocks.enqueue, flush: mocks.flush }) }));
vi.mock('@/lib/field/blobStore', () => ({ putPendingPhoto: vi.fn(), reconcilePendingPhotos: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: { Photo: { filter: async () => [] }, PunchlistItem: { filter: async () => [] }, ScheduleTask: { get: mocks.get, update: mocks.update } }, integrations: {} }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, message: mocks.message } }));
vi.mock('@/components/punchlist/PunchlistFormModal', () => ({ default: () => null }));
vi.mock('../fieldToday/FieldTodayControlCenter', () => ({ default: ({ onSetProgress }: { onSetProgress: (task: { id: string; percent_complete: number }, pct: number) => void }) => <button onClick={() => onSetProgress({ id: 'task-a', percent_complete: 0 }, 50)}>Update progress</button> }));
import { setActiveOrgId } from '@/lib/activeOrg';
import FieldToday from '../FieldToday';
beforeEach(() => { vi.clearAllMocks(); mocks.project = 'project-a'; setActiveOrgId('org-a'); });

it('does not perform the progress write if account identity changes during its server read', async () => {
  let resolve!: (task: { id: string; status: string }) => void;
  mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><FieldToday /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Update progress' }));
  await waitFor(() => expect(mocks.get).toHaveBeenCalledOnce());
  act(() => { setActiveOrgId(null); qc.clear(); setActiveOrgId('org-a'); });
  await act(async () => resolve({ id: 'task-a', status: 'Not Started' }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(mocks.error).not.toHaveBeenCalled();
});

it('does not enqueue a failed old-owner write into the new workspace outbox', async () => {
  let reject!: (error: Error) => void;
  mocks.get.mockResolvedValue({ id: 'task-a', status: 'Not Started' });
  mocks.update.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><FieldToday /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Update progress' }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
  act(() => { setActiveOrgId('org-b'); qc.clear(); });
  await act(async () => reject(new TypeError('Failed to fetch')));
  expect(mocks.enqueue).not.toHaveBeenCalled();
  expect(mocks.message).not.toHaveBeenCalled();
});
