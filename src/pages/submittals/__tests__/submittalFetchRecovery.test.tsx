// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSubmittalsPageQueries } from '../useSubmittalsPageQueries';
const filters = vi.hoisted(() => Object.fromEntries(
  ['Submittal', 'DrawingSet', 'SubmittalRound', 'RFI', 'ScheduleTask', 'Drawing', 'SubmittalSheetResponse', 'SubmittalCommentDisposition']
    .map(name => [name, { filter: vi.fn(async (): Promise<Record<string, unknown>[]> => []), filterAll: vi.fn(async (): Promise<Record<string, unknown>[]> => []) }]),
));
vi.mock('@/api/supabaseClient', () => ({ entities: filters }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const hook = renderHook(() => useSubmittalsPageQueries('project-a'), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { ...hook, client };
}
for (const source of Object.keys(filters)) {
  it(`keeps ${source} failures distinct from an empty register and retries`, async () => {
    filters[source].filterAll.mockRejectedValueOnce(new Error('Read unavailable'));
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.queryError).toBeInstanceOf(Error);
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.queryError).toBeNull());
  });
}
it('waits for linked workflow evidence before reporting ready', async () => {
  let resolveRounds!: (value: never[]) => void;
  filters.SubmittalRound.filterAll.mockImplementationOnce(() => new Promise(resolve => { resolveRounds = resolve; }));
  const { result, client } = mount();
  await waitFor(() => expect(client.getQueryState(["submittals", "project-a"])?.status).toBe("success"));
  expect(result.current.isLoading).toBe(true);
  await act(async () => resolveRounds([]));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
});

it('keeps the last-page blocker in all shared project datasets', async () => {
  const complete = Array.from({ length: 1001 }, (_, index) => ({ id: `row-${index}`, status: index === 1000 ? 'Open' : 'Closed' }));
  for (const source of Object.values(filters)) {
    source.filter.mockResolvedValueOnce(complete.slice(0, 1000));
    source.filterAll.mockResolvedValueOnce(complete);
  }
  const { result } = mount();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  for (const rows of [result.current.rows, result.current.drawingSets, result.current.allRounds,
    result.current.allRfis, result.current.allTasks, result.current.allDrawings,
    result.current.allSheetResponses, result.current.allCommentDispositions]) {
    expect(rows).toHaveLength(1001);
    expect(rows.at(-1)).toMatchObject({ id: 'row-1000', status: 'Open' });
  }
});
