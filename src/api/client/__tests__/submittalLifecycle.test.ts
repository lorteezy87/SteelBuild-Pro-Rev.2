import { beforeEach, describe, expect, it, vi } from 'vitest';
const workflowRpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: workflowRpc } }));
import { hydrateSubmittalRevisionCoverage } from '../submittalWorkflow';
import { withSubmittalLifecycle } from '../submittalLifecycle';
import { setActiveOrgId } from '@/lib/activeOrg';
import type { EntityClient } from '../supabaseTypes';
const row = { id: 's', status: 'Approved', ball_in_court: 'GC', submittal_type: 'Shop Drawing', current_round_id: 'r', updated_at: '2026-10-09T00:00:00.000001+00:00' };
function coverage(id: string) { return { submittal_id: id, submittal_status: row.status, submittal_updated_at: row.updated_at, round_id: 'r', ok: false, current_revision_ids: ['rev'], captured_revision_ids: [], missing_revision_ids: ['rev'], stale_revision_ids: [], missing_current_drawing_ids: [], foreign_drawing_set_ids: [], empty_drawing_set_ids: [], evidence: [] }; }
beforeEach(() => { workflowRpc.mockReset(); setActiveOrgId('org'); });
describe('complete revision coverage reads', () => {
  it('batches more than a hosted page without truncation or per-row calls', async () => {
    const rpc = vi.fn(async (_name: string, args: { p_submittal_ids: string[] }) => ({ data: args.p_submittal_ids.map(coverage), error: null }));
    const rows = Array.from({ length: 1001 }, (_, i) => ({ ...row, id: String(i) }));
    const hydrated = await hydrateSubmittalRevisionCoverage(rows, { rpc });
    expect(hydrated).toHaveLength(1001);
    expect(rpc).toHaveBeenCalledTimes(6);
    expect(rpc.mock.calls.every(([, args]) => args.p_submittal_ids.length <= 200)).toBe(true);
    expect(hydrated[1000].revision_coverage?.missing_revision_ids).toEqual(['rev']);
  });
  it('rejects missing coverage and stale state instead of printing a ready row', async () => {
    await expect(hydrateSubmittalRevisionCoverage([row], { rpc: async () => ({ data: [], error: null }) })).rejects.toThrow(/incomplete/);
    await expect(hydrateSubmittalRevisionCoverage([row], { rpc: async () => ({ data: [{ ...coverage('s'), submittal_status: 'Revise and Resubmit' }], error: null }) })).rejects.toThrow(/changed/);
    await expect(hydrateSubmittalRevisionCoverage([row], { rpc: async () => ({ data: [{ ...coverage('s'), submittal_updated_at: '2026-10-09T00:00:00.000002+00:00' }], error: null }) })).rejects.toThrow(/changed/);
  });
  it('preserves timestamp microseconds while recognizing equivalent UTC formats', async () => {
    const loaded = await hydrateSubmittalRevisionCoverage([{ ...row, updated_at: '2026-10-09T00:00:00.000001Z' }], { rpc: async () => ({ data: [coverage('s')], error: null }) });
    expect(loaded[0].revision_coverage).toBeTruthy();
  });
  it('rejects duplicate, foreign and malformed batch members without granting release evidence', async () => {
    for (const data of [[null], [{ ...coverage('s'), missing_revision_ids: null }], [coverage('other')]]) {
      await expect(hydrateSubmittalRevisionCoverage([row], { rpc: async () => ({ data, error: null }) })).rejects.toThrow(/invalid/);
    }
    await expect(hydrateSubmittalRevisionCoverage([row, { ...row, id: 's2' }], { rpc: async () => ({ data: [coverage('s'), coverage('s')], error: null }) })).rejects.toThrow(/invalid/);
  });
  it('rejects a workspace switch before returning evidence', async () => {
    await expect(hydrateSubmittalRevisionCoverage([row], { rpc: async () => { setActiveOrgId('other-org'); return { data: [coverage('s')], error: null }; } })).rejects.toThrow(/Workspace changed/);
  });
});
describe('entity lifecycle boundaries', () => {
  it('replays a lost response from the original reviewed snapshot without a stale pre-read or changed request identity', async () => {
    const review = { ...row, status: 'Submitted', revision_coverage: coverage('s') };
    const base = { update: vi.fn(), get: vi.fn(async () => ({ ...row, status: 'Approved', updated_at: '2026-10-09T00:00:00.000002Z' })) } as unknown as EntityClient<'submittals'>;
    workflowRpc.mockRejectedValueOnce(new Error('Network lost'));
    workflowRpc.mockResolvedValueOnce({ data: { submittal: row, round: { id: 'r' }, evidence: [] }, error: null });
    const entity = withSubmittalLifecycle(base);
    await expect(entity.update('s', { status: 'Approved', ball_in_court: 'GC' }, { submittalReview: review })).rejects.toMatchObject({ outcomeUnknown: true });
    await expect(entity.update('s', { status: 'Approved', ball_in_court: 'GC' }, { submittalReview: review })).resolves.toMatchObject({ status: 'Approved' });
    expect(workflowRpc.mock.calls[0][1]).toEqual(workflowRpc.mock.calls[1][1]);
    expect(base.get).not.toHaveBeenCalled();
    expect(base.update).not.toHaveBeenCalled();
  });
  it('rejects unreviewed status, owner and metadata transitions without writes', async () => {
    const base = { update: vi.fn(), get: vi.fn() } as unknown as EntityClient<'submittals'>;
    const entity = withSubmittalLifecycle(base);
    for (const patch of [{ status: 'Approved' }, { ball_in_court: 'GC' }, { metadata: { workflow_substatus: 'ifc_issued' } }]) await expect(entity.update('s', patch)).rejects.toThrow(/Review this submittal/);
    expect(base.update).not.toHaveBeenCalled(); expect(base.get).not.toHaveBeenCalled();
  });
  it('allows an ordinary detail correction and blocks bulk manufactured approval', async () => {
    const update = vi.fn(async () => ({ ...row, notes: 'Corrected detail' }));
    const base = { update, bulkUpdate: vi.fn() } as unknown as EntityClient<'submittals'>;
    const entity = withSubmittalLifecycle(base);
    expect(await entity.update('s', { notes: 'Corrected detail' })).toMatchObject({ notes: 'Corrected detail' });
    await expect(entity.bulkUpdate(['s'], { status: 'Approved' })).rejects.toThrow(/Review each/);
    expect(base.bulkUpdate).not.toHaveBeenCalled();
  });
});
