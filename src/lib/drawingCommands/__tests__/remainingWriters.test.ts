import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ current: null as Record<string, unknown> | null, error: null as unknown, revisionCreate: vi.fn(), writes: vi.fn(), filters: [] as unknown[][] }));
vi.mock('@/lib/supabase', () => ({ supabase: { from(table: string) {
  const result = () => ({ data: table === 'drawing_zone_proposals' ? { id: 'p', status: 'pending', project_id: 'project', drawing_id: 'drawing', drawing_revision_id: null, suggested_zone_type: 'area' } : table === 'drawings' ? { id: 'drawing', project_id: 'project' } : backend.current, error: backend.error });
  const query = { select: () => query, eq: (key: string, value: unknown) => { backend.filters.push([key, value]); return query; }, is: (key: string, value: unknown) => { backend.filters.push([key, value]); return query; }, insert: (payload: unknown) => { backend.revisionCreate(payload); return query; }, update: (payload: unknown) => { backend.writes(payload); return query; }, maybeSingle: async () => result(), single: async () => result() };
  return query;
} } }));
import { ensureCurrentRevision } from '@/lib/drawingHub/revisions';
import { acceptZoneProposal } from '@/lib/drawingHub/proposals';
import { provisionRegisterRevision } from '@/components/drawings/register/registerProvision';
beforeEach(() => { backend.current = null; backend.error = null; backend.filters = []; vi.clearAllMocks(); });
describe('read-only revision tracking', () => {
  it('openingViewerDoesNotCreateHistory', async () => {
    await expect(ensureCurrentRevision({ drawing: { id: 'drawing', project_id: 'project' } })).rejects.toThrow(/tracking required/i);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
  });
  it('proposalAcceptanceDoesNotProvision', async () => {
    await expect(acceptZoneProposal('p')).rejects.toThrow(/tracking required/i);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
    expect(backend.writes).not.toHaveBeenCalled();
  });
  it('register setup cannot invent history from a parent PDF', async () => {
    await expect(provisionRegisterRevision({ row: { drawing_id: 'drawing', project_id: 'project' }, projectId: 'project', userId: 'actor' })).rejects.toThrow(/tracking required/i);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
  });
  it('returns authorized existing history without changing it', async () => {
    backend.current = { id: 'rev', project_id: 'project', drawing_id: 'drawing', is_current: true, archived_at: null };
    await expect(ensureCurrentRevision({ drawing: { id: 'drawing', project_id: 'project' } })).resolves.toBe(backend.current);
    expect(backend.filters).toContainEqual(['project_id', 'project']);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
  });
  it('does not reinterpret an ambiguous lookup as missing history', async () => {
    backend.error = { code: 'PGRST116', message: 'ambiguous rows' };
    await expect(ensureCurrentRevision({ drawing: { id: 'drawing', project_id: 'project' } })).rejects.toEqual(backend.error);
    expect(backend.revisionCreate).not.toHaveBeenCalled();
  });
});
