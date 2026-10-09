// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import type { Submittal } from '../submittals/types';
const update = vi.hoisted(() => vi.fn());
vi.mock('@/api/supabaseClient', () => ({ entities: { Submittal: { update } } }));
vi.mock('@/lib/submittalSmartTriggers', () => ({ runSubmittalStatusTriggers: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { useSubmittalMutations } from '../submittals/useSubmittalMutations';

describe('reviewed submittal status display', () => {
  it('does not display approval while the server has not committed it', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const queryKey = ['submittals', 'project-1'];
    const reviewed = { id: 's', status: 'Under Review', current_round_id: 'r', updated_at: '2026-10-09T00:00:00Z' } as Submittal;
    queryClient.setQueryData(queryKey, [reviewed]);
    let finish: (row: Submittal) => void = () => {};
    update.mockImplementation(() => new Promise<Submittal>(resolve => { finish = resolve; }));
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useSubmittalMutations({ projectId: 'project-1', submittals: [reviewed], queryKey, invalidateAll: vi.fn(async () => {}) }), { wrapper });
    act(() => hook.result.current.updateSubmittal.mutate({ id: 's', status: 'Approved', ball_in_court: 'GC' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(queryClient.getQueryData<Submittal[]>(queryKey)?.[0].status).toBe('Under Review');
    await act(async () => { finish({ ...reviewed, status: 'Approved' }); });
    await waitFor(() => expect(hook.result.current.updateSubmittal.isSuccess).toBe(true));
    hook.unmount();
    queryClient.clear();
  });
});
