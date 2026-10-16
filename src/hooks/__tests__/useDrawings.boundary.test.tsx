// @vitest-environment jsdom
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue({ id: 'd' }), create: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}), rows: [{ id: 'd', project_id: 'p', drawing_set_name: 'Set', stage: 'IFA', notes: 'old' }] }));
vi.mock('@/api/supabaseClient', () => ({ entities: { Drawing: { filterAll: async () => backend.rows, update: backend.update, create: backend.create, delete: backend.delete } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/autoScheduleDetailing', () => ({ autoCreateDetailingTasks: vi.fn() }));
import { useDrawings } from '../useDrawings';
beforeEach(() => vi.clearAllMocks());
it('holds stage approval rejection supersession and CRUD before calling any writer', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useDrawings('p'), { wrapper });
  await waitFor(() => expect(result.current.drawings).toHaveLength(1));
  const operations = [() => result.current.bulkUpdateStage.mutateAsync({ ids: ['d'], stage: 'IFC' }), () => result.current.approveSet.mutateAsync({ sheets: [{ id: 'd' }] }), () => result.current.rejectSet.mutateAsync({ sheets: [{ id: 'd' }], notes: 'no' }), () => result.current.supersedeSet.mutateAsync({ sheets: [{ id: 'd' }] }), () => result.current.deleteDrawing.mutateAsync('d'), () => result.current.bulkDelete.mutateAsync(['d']), () => result.current.createDrawing.mutateAsync({ drawing_set_name: 'Set' })];
  for (const operation of operations) await act(async () => { await expect(operation()).rejects.toThrow(/held|reviewed/i); });
  expect(backend.update).not.toHaveBeenCalled(); expect(backend.create).not.toHaveBeenCalled(); expect(backend.delete).not.toHaveBeenCalled();
  await act(async () => { await result.current.updateDrawing.mutateAsync({ id: 'd', notes: 'safe' }); });
  expect(backend.update).toHaveBeenCalledWith('d', { notes: 'safe' });
});
