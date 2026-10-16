// @vitest-environment jsdom
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ writes: vi.fn(), filters: [] as unknown[][], actor: 'a', unlock: vi.fn(async () => {}) }));
vi.mock('@/lib/drawingHub', () => ({ assertSetUnlocked: m.unlock }));
vi.mock('@/hooks/useRealtimeInvalidation', () => ({ useRealtimeInvalidation() {} }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: m.actor, email: m.actor + '@test.invalid' } } }) },
  from() {
    const filters: Record<string, unknown> = {};
    const q = { select: () => q, eq: (k: string, v: unknown) => { filters[k] = v; m.filters.push([k, v]); return q; },
      order: async () => ({ data: [{ id: 'mark', drawing_revision_id: filters.drawing_revision_id, comment: String(filters.drawing_revision_id), markup_type: 'note' }], error: null as null }),
      insert: async (v: unknown) => { m.writes('insert', v); return { error: null as null }; },
      update: (v: unknown) => { m.writes('update', v); return q; },
      delete: () => { m.writes('delete'); return q; },
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve({ error: null as null })) };
    return q;
  },
} }));
import { useMarkup } from '../useMarkup';
import { setActiveOrgId } from '@/lib/activeOrg';
// Legacy JS default-null parameters otherwise infer null-only under strictNullChecks.
const useTypedMarkup = useMarkup as unknown as (options: { drawingId: string; projectId: string; drawingRevisionId: string | null; actorId: string; sourceKey: string }) => ReturnType<typeof useMarkup>;
function setup(revision: string | null = 'r1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ rev, actor }) => useTypedMarkup({ drawingId: 'd', projectId: 'p', drawingRevisionId: rev, actorId: actor, sourceKey: 'source' }), { wrapper, initialProps: { rev: revision, actor: 'a' } });
}
beforeEach(() => { vi.clearAllMocks(); m.filters = []; m.actor = 'a'; m.unlock.mockResolvedValue(undefined); setActiveOrgId('org'); });
it('filters and caches the actual revision and shows no history-less overlay', async () => {
  const { result, rerender } = setup();
  await waitFor(() => expect(result.current.items[0]?.text).toBe('r1'));
  expect(m.filters).toContainEqual(['project_id', 'p']);
  expect(m.filters).toContainEqual(['drawing_revision_id', 'r1']);
  rerender({ rev: 'r2', actor: 'a' });
  expect(result.current.items).not.toContainEqual(expect.objectContaining({ text: 'r1' }));
  await waitFor(() => expect(result.current.items[0]?.text).toBe('r2'));
  rerender({ rev: null, actor: 'a' });
  expect(result.current.items).toEqual([]);
  act(() => result.current.addItem({ kind: 'note' }));
  expect(m.writes).not.toHaveBeenCalled();
});
it('cancels pending text edits and stale callbacks on revision changes', async () => {
  const { result, rerender } = setup();
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  const oldAdd = result.current.addItem;
  act(() => result.current.updateItem('mark', { text: 'old edit' }));
  rerender({ rev: 'r2', actor: 'a' });
  act(() => oldAdd({ kind: 'note' }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)); });
  expect(m.writes).not.toHaveBeenCalled();
});
it('resolves each author freshly and drops an old actor completion', async () => {
  const { result, rerender } = setup();
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  act(() => result.current.addItem({ kind: 'note' }));
  await waitFor(() => expect(m.writes).toHaveBeenCalledTimes(1));
  m.actor = 'b'; rerender({ rev: 'r1', actor: 'b' });
  act(() => result.current.addItem({ kind: 'note' }));
  await waitFor(() => expect(m.writes).toHaveBeenCalledTimes(2));
  expect(m.writes.mock.calls[1][1].author_id).toBe('b');
  let release!: () => void;
  m.unlock.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  act(() => result.current.addItem({ kind: 'note' }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  m.actor = 'c'; rerender({ rev: 'r1', actor: 'c' });
  await act(async () => release());
  expect(m.writes).toHaveBeenCalledTimes(2);
});
