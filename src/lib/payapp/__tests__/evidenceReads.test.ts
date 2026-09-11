import { beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], failFrom: Infinity }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, order: () => query,
    range: async (start: number, end: number) => start >= backend.failFrom
      ? { data: null as Record<string, unknown>[] | null, error: new Error('Read failed') }
      : { data: backend.rows.slice(start, Math.min(end + 1, start + 400)), error: null },
    then: (resolve: (value: unknown) => void) => resolve({ data: backend.rows.slice(0, 400), error: null }),
  }; return query;
} } }));
import { listLines, listSovItems, listPayAppChangeOrders } from '../repository';
beforeEach(() => { backend.rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i) })); backend.failFrom = Infinity; });
it.each([['lines', () => listLines('app')], ['SOV', () => listSovItems('project')], ['COs', () => listPayAppChangeOrders('project')]] as const)('reads every %s row even when the server returns fewer rows than requested', async (_label, read) => {
  expect(await read()).toHaveLength(1201);
});
it.each([['lines', () => listLines('app')], ['SOV', () => listSovItems('project')], ['COs', () => listPayAppChangeOrders('project')]] as const)('rejects partial %s evidence when a later page fails', async (_label, read) => {
  backend.failFrom = 400;
  await expect(read()).rejects.toThrow('Read failed');
});
