// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'account-a', email: 'viewer@example.test' } as { id: string; email: string } | null,
  rpc: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/components/shared/useAppSecurity', () => ({ useAppSecurity: () => ({ user: mocks.user }) }));
import { useAllFlags, useFlag } from '../useFeatureFlag';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}
beforeEach(() => {
  mocks.user = { id: 'account-a', email: 'viewer@example.test' };
  mocks.rpc.mockReset().mockResolvedValue({ data: [{ flag_key: 'viewer_3d', enabled: true }], error: null });
});
afterEach(cleanup);

it('reads only the server effective-value projection without submitting identity claims', async () => {
  const { wrapper } = setup();
  const { result } = renderHook(() => useAllFlags(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('list_effective_feature_flags');
  expect(result.current.data).toEqual(new Map([['viewer_3d', true]]));
});

it('does not read flags when there is no authenticated identity', () => {
  mocks.user = null;
  const { wrapper } = setup();
  const { result } = renderHook(() => useAllFlags(), { wrapper });
  expect(result.current.data).toBeUndefined();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('does not reuse an old account result for a different account with the same email', async () => {
  const { wrapper } = setup();
  const { result, rerender } = renderHook(() => useAllFlags(), { wrapper });
  await waitFor(() => expect(result.current.data?.get('viewer_3d')).toBe(true));
  mocks.rpc.mockImplementationOnce(() => new Promise(() => {}));
  mocks.user = { id: 'account-b', email: 'viewer@example.test' };
  rerender();
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
});

it('fails closed when the projection cannot authorize or load the request', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: new Error('Authentication required') });
  const { wrapper } = setup();
  const { result } = renderHook(() => useFlag('viewer_3d'), { wrapper });
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
  expect(result.current).toBe(false);
});
