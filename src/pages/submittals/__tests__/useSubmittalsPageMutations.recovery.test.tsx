// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSubmittalsPageMutations } from '../useSubmittalsPageMutations';

const mocks = vi.hoisted(() => ({ advance: vi.fn(), invalidateEntity: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ entities: {} }));
vi.mock('@/hooks/useSubmittals', () => ({ addSubmittalRound: mocks.advance }));
vi.mock('@/services/auditLogger', () => ({ logActivity: vi.fn(), logTransition: vi.fn() }));
vi.mock('@/services/cacheRegistry', () => ({ invalidateEntity: mocks.invalidateEntity }));
vi.mock('@/lib/submittalSmartTriggers', () => ({ runSubmittalStatusTriggers: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }));

afterEach(() => vi.resetAllMocks());
describe('failed advance recovery', () => {
  it.each([false, true])('refreshes rejected state without retry or success, even with refresh failure=%s', async refreshFails => {
    if (refreshFails) mocks.invalidateEntity.mockRejectedValue(new Error('Refresh unavailable'));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const keys = [['submittals', 'project'], ['submittal-rounds', 'project'], ['submittal-revision-coverage', 'sub'], ['submittal-revision-documents', 'sub', ['rev']]];
    for (const key of keys) client.setQueryData(key, { status: 'Approved as Noted' });
    const fetchPackage = vi.fn().mockResolvedValue({ status: 'Released for Fabrication' });
    const observer = new QueryObserver(client, { queryKey: keys[0], queryFn: fetchPackage, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    const failure = new Error('ROUND_LEGACY_RECONCILIATION_REQUIRED: Missing or stale revision evidence');
    mocks.advance.mockRejectedValue(failure);
    const clearPending = vi.fn();
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
    const { result, unmount } = renderHook(() => useSubmittalsPageMutations({ projectId: 'project', rows: [], activeProject: null, selectedId: 'sub',
      setSelectedId: vi.fn(), setToDelete: vi.fn(), setReleaseBlock: vi.fn(), setSelectedIds: vi.fn(), setShowBulkEdit: vi.fn(),
      setShowBulkDelete: vi.fn(), setShowBulkAdd: vi.fn(), setShowNewRound: vi.fn(), setShowSheetResponse: vi.fn(), onAdvanceError: clearPending }), { wrapper });
    await act(async () => {
      await expect(result.current.advanceMut.mutateAsync({ submittal: { id: 'sub', project_id: 'project' }, status: 'Released for Fabrication' })).rejects.toThrow('ROUND_LEGACY');
    });
    expect(client.getQueryData(keys[0])).toEqual({ status: 'Released for Fabrication' });
    expect(fetchPackage).toHaveBeenCalledOnce();
    for (const key of keys.slice(1)) expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    expect(clearPending).toHaveBeenCalledOnce();
    expect(mocks.advance).toHaveBeenCalledOnce();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Revision evidence'));
    unsubscribe(); unmount(); client.clear();
  });
});
